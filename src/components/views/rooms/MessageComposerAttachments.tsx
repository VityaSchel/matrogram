/* eslint-disable matrix-org/require-copyright-header */
import classNames from "classnames";
import {
    type IEventRelation,
    M_POLL_START,
    type MatrixClient,
    type Room,
    THREAD_RELATION_TYPE,
} from "matrix-js-sdk/src/matrix";
import React, { createContext, type ReactElement, type ReactNode, useContext, useRef } from "react";

import ContentMessages from "../../../ContentMessages.ts";
import MatrixClientContext from "../../../contexts/MatrixClientContext.tsx";
import { useScopedRoomContext } from "../../../contexts/ScopedRoomContext.tsx";
import dis from "../../../dispatcher/dispatcher.ts";
import { useDispatcher } from "../../../hooks/useDispatcher.ts";
import { _t } from "../../../languageHandler.tsx";
import { MatrixClientPeg } from "../../../MatrixClientPeg.ts";
import Modal from "../../../Modal.tsx";
import { filterBoolean } from "../../../utils/arrays.ts";
import { chromeFileInputFix } from "../../../utils/BrowserWorkarounds.ts";
import { type MenuProps } from "../../structures/ContextMenu.tsx";
import IconizedContextMenu, { IconizedContextMenuOptionList } from "../context_menus/IconizedContextMenu.tsx";
import ErrorDialog from "../dialogs/ErrorDialog.tsx";
import AccessibleButton from "../elements/AccessibleButton.tsx";
import PollCreateDialog from "../elements/PollCreateDialog.tsx";
import { LocationButton } from "../location/index.tsx";
import { CollapsibleButton } from "./CollapsibleButton.tsx";

interface IProps {
    haveRecording: boolean;
    isMenuOpen: boolean;
    menuPosition?: MenuProps;
    relation?: IEventRelation;
    showLocationButton: boolean;
    showPollsButton: boolean;
    toggleButtonMenu: () => void;
}

type OverflowMenuCloser = () => void;
export const OverflowMenuContext = createContext<OverflowMenuCloser | null>(null);

const MessageComposerAttachments: React.FC<IProps> = (props: IProps) => {
    const matrixClient = useContext(MatrixClientContext);
    const { room } = useScopedRoomContext("room");

    if(props.haveRecording) {
        return (
            <span className="mx_MessageComposer_attachmentsMenuPlaceholder" />
        )
    }

    if (!matrixClient || !room) {
        return null;
    }

    const buttons = filterBoolean([
        uploadButton(), // props passed via UploadButtonContext
        props.showPollsButton ? pollButton(room, props.relation) : null,
        showLocationButton(props, room, matrixClient),
    ]);

    return (
        <UploadButtonContextProvider roomId={room.roomId} relation={props.relation}>
            {buttons.length > 0 ? (
                <AccessibleButton
                    className={classNames(["mx_MessageComposer_button", "mx_MessageComposer_buttonMenu"], {
                        mx_MessageComposer_closeButtonMenu: props.isMenuOpen,
                    })}
                    onClick={props.toggleButtonMenu}
                    title={_t("quick_settings|sidebar_settings")}
                />
            ) : (
                <span className="mx_MessageComposer_attachmentsMenuPlaceholder" />
            )}
            {props.isMenuOpen && (
                <IconizedContextMenu
                    onFinished={props.toggleButtonMenu}
                    {...props.menuPosition}
                    wrapperClassName="mx_MessageComposer_Menu"
                    compact={true}
                >
                    <OverflowMenuContext.Provider value={props.toggleButtonMenu}>
                        <IconizedContextMenuOptionList>{buttons}</IconizedContextMenuOptionList>
                    </OverflowMenuContext.Provider>
                </IconizedContextMenu>
            )}
        </UploadButtonContextProvider>
    );
};

function uploadButton(): ReactElement {
    return <UploadButton key="controls_upload" />;
}

type UploadButtonFn = () => void;
export const UploadButtonContext = createContext<UploadButtonFn | null>(null);

interface IUploadButtonProps {
    roomId: string;
    relation?: IEventRelation;
    children: ReactNode;
}

// We put the file input outside the UploadButton component so that it doesn't get killed when the context menu closes.
const UploadButtonContextProvider: React.FC<IUploadButtonProps> = ({ roomId, relation, children }) => {
    const cli = useContext(MatrixClientContext);
    const roomContext = useScopedRoomContext("timelineRenderingType");
    const uploadInput = useRef<HTMLInputElement>(null);

    const onUploadClick = (): void => {
        if (cli?.isGuest()) {
            dis.dispatch({ action: "require_registration" });
            return;
        }
        uploadInput.current?.click();
    };

    useDispatcher(dis, (payload) => {
        if (roomContext.timelineRenderingType === payload.context && payload.action === "upload_file") {
            onUploadClick();
        }
    });

    const onUploadFileInputChange = (ev: React.ChangeEvent<HTMLInputElement>): void => {
        if (ev.target.files?.length === 0) return;

        // Take a copy, so we can safely reset the value of the form control
        ContentMessages.sharedInstance().sendContentListToRoom(
            Array.from(ev.target.files!),
            roomId,
            relation,
            cli,
            roomContext.timelineRenderingType,
        );

        // This is the onChange handler for a file form control, but we're
        // not keeping any state, so reset the value of the form control
        // to empty.
        // NB. we need to set 'value': the 'files' property is immutable.
        ev.target.value = "";
    };

    const uploadInputStyle = { display: "none" };
    return (
        <UploadButtonContext.Provider value={onUploadClick}>
            {children}

            <input
                ref={uploadInput}
                type="file"
                style={uploadInputStyle}
                multiple
                onClick={chromeFileInputFix}
                onChange={onUploadFileInputChange}
            />
        </UploadButtonContext.Provider>
    );
};

// Must be rendered within an UploadButtonContextProvider
const UploadButton: React.FC = () => {
    const overflowMenuCloser = useContext(OverflowMenuContext);
    const uploadButtonFn = useContext(UploadButtonContext);

    const onClick = (): void => {
        uploadButtonFn?.();
        overflowMenuCloser?.(); // close overflow menu
    };

    return (
        <CollapsibleButton
            className="mx_MessageComposer_button"
            iconClassName="mx_MessageComposer_upload"
            onClick={onClick}
            title={_t("common|attachment")}
        />
    );
};

function pollButton(room: Room, relation?: IEventRelation): ReactElement {
    return <PollButton key="polls" room={room} relation={relation} />;
}

interface IPollButtonProps {
    room: Room;
    relation?: IEventRelation;
}

class PollButton extends React.PureComponent<IPollButtonProps> {
    public static contextType = OverflowMenuContext;
    declare public context: React.ContextType<typeof OverflowMenuContext>;

    private onCreateClick = (): void => {
        this.context?.(); // close overflow menu
        const canSend = this.props.room.currentState.maySendEvent(
            M_POLL_START.name,
            MatrixClientPeg.safeGet().getSafeUserId(),
        );
        if (!canSend) {
            Modal.createDialog(ErrorDialog, {
                title: _t("composer|poll_button_no_perms_title"),
                description: _t("composer|poll_button_no_perms_description"),
            });
        } else {
            const threadId =
                this.props.relation?.rel_type === THREAD_RELATION_TYPE.name ? this.props.relation.event_id : undefined;

            Modal.createDialog(
                PollCreateDialog,
                {
                    room: this.props.room,
                    threadId,
                },
                "mx_CompoundDialog",
                false, // isPriorityModal
                true, // isStaticModal
            );
        }
    };

    public render(): React.ReactNode {
        // do not allow sending polls within threads at this time
        if (this.props.relation?.rel_type === THREAD_RELATION_TYPE.name) return null;

        return (
            <CollapsibleButton
                className="mx_MessageComposer_button"
                iconClassName="mx_MessageComposer_poll"
                onClick={this.onCreateClick}
                title={_t("composer|poll_button")}
            />
        );
    }
}

function showLocationButton(props: IProps, room: Room, matrixClient: MatrixClient): ReactElement | null {
    const sender = room.getMember(matrixClient.getSafeUserId());

    return props.showLocationButton && sender ? (
        <LocationButton
            key="location"
            roomId={room.roomId}
            relation={props.relation}
            sender={sender}
            menuPosition={props.menuPosition}
        />
    ) : null;
}

export default MessageComposerAttachments;
