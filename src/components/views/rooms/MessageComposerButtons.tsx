/* eslint-disable matrix-org/require-copyright-header */
import classNames from "classnames";
import { type Room, type IEventRelation, THREAD_RELATION_TYPE } from "matrix-js-sdk/src/matrix";
import React, { type JSX, type ReactElement, useContext } from "react";

import MatrixClientContext from "../../../contexts/MatrixClientContext";
import { useScopedRoomContext } from "../../../contexts/ScopedRoomContext.tsx";
import { useSettingValue } from "../../../hooks/useSettings";
import { _t } from "../../../languageHandler";
import { filterBoolean } from "../../../utils/arrays";
import { type MenuProps } from "../../structures/ContextMenu.tsx";
import { type ButtonEvent } from "../elements/AccessibleButton";
import { CollapsibleButton } from "./CollapsibleButton";
import { EmojiButton } from "./EmojiButton";

interface IProps {
    addEmoji: (emoji: string) => boolean;
    haveRecording: boolean;
    relation?: IEventRelation;
    showStickersButton: boolean;
    isRichTextEnabled: boolean;
    onComposerModeClick: () => void;
    menuPosition?: MenuProps;
    room: Room;
}

const MessageComposerButtons: React.FC<IProps> = (props: IProps) => {
    const matrixClient = useContext(MatrixClientContext);
    const { room } = useScopedRoomContext("room");

    const isWysiwygLabEnabled = useSettingValue("feature_wysiwyg_composer");

    if (!matrixClient || !room || props.haveRecording) {
        return null;
    }

    return filterBoolean([
        isWysiwygLabEnabled ? (
            <ComposerModeButton
                key="composerModeButton"
                isRichTextEnabled={props.isRichTextEnabled}
                onClick={props.onComposerModeClick}
            />
        ) : (
            emojiButton(props)
        ),
    ]);
};

function emojiButton(props: IProps): ReactElement {
    return (
        <EmojiButton
            key="emoji_button"
            addEmoji={props.addEmoji}
            menuPosition={props.menuPosition}
            className="mx_MessageComposer_button"
            room={props.room}
            threadId={props.relation?.rel_type === THREAD_RELATION_TYPE.name ? props.relation.event_id : null}
        />
    );
}

interface WysiwygToggleButtonProps {
    isRichTextEnabled: boolean;
    onClick: (ev: ButtonEvent) => void;
}

function ComposerModeButton({ isRichTextEnabled, onClick }: WysiwygToggleButtonProps): JSX.Element {
    const title = isRichTextEnabled ? _t("composer|mode_plain") : _t("composer|mode_rich_text");

    return (
        <CollapsibleButton
            className="mx_MessageComposer_button"
            iconClassName={classNames({
                mx_MessageComposer_plain_text: !isRichTextEnabled,
                mx_MessageComposer_rich_text: isRichTextEnabled,
            })}
            onClick={onClick}
            title={title}
        />
    );
}

export default MessageComposerButtons;
