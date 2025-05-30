/*
Copyright 2024 New Vector Ltd.
Copyright 2021, 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { ClientEvent, type Room, RoomEvent } from "matrix-js-sdk/src/matrix";
import React, { type JSX, useContext, useEffect, useState } from "react";
import { Tooltip } from "@vector-im/compound-web";

import MatrixClientContext from "../../../contexts/MatrixClientContext";
import { Action } from "../../../dispatcher/actions";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { useDispatcher } from "../../../hooks/useDispatcher";
import { useEventEmitterState, useTypedEventEmitter, useTypedEventEmitterState } from "../../../hooks/useEventEmitter";
import { _t } from "../../../languageHandler";
import {
    getMetaSpaceName,
    MetaSpace,
    type SpaceKey,
    UPDATE_HOME_BEHAVIOUR,
    UPDATE_SELECTED_SPACE,
} from "../../../stores/spaces";
import SpaceStore from "../../../stores/spaces/SpaceStore";
import {
    ChevronFace,
    ContextMenuButton,
    ContextMenuTooltipButton,
    type MenuProps,
    useContextMenu,
} from "../../structures/ContextMenu";
import SpaceContextMenu from "../context_menus/SpaceContextMenu";
import InlineSpinner from "../elements/InlineSpinner";
import { HomeButtonContextMenu } from "../spaces/SpacePanel";

const contextMenuBelow = (elementRect: DOMRect): MenuProps => {
    // align the context menu's icons with the icon which opened the context menu
    const left = elementRect.left + window.scrollX;
    const top = elementRect.bottom + window.scrollY + 12;
    const chevronFace = ChevronFace.None;
    return { left, top, chevronFace };
};

// Long-running actions that should trigger a spinner
enum PendingActionType {
    JoinRoom,
    BulkRedact,
}

const usePendingActions = (): Map<PendingActionType, Set<string>> => {
    const cli = useContext(MatrixClientContext);
    const [actions, setActions] = useState(new Map<PendingActionType, Set<string>>());

    const addAction = (type: PendingActionType, key: string): void => {
        const keys = new Set(actions.get(type));
        keys.add(key);
        setActions(new Map(actions).set(type, keys));
    };
    const removeAction = (type: PendingActionType, key: string): void => {
        const keys = new Set(actions.get(type));
        if (keys.delete(key)) {
            setActions(new Map(actions).set(type, keys));
        }
    };

    useDispatcher(defaultDispatcher, (payload) => {
        switch (payload.action) {
            case Action.JoinRoom:
                addAction(PendingActionType.JoinRoom, payload.roomId);
                break;
            case Action.JoinRoomReady:
            case Action.JoinRoomError:
                removeAction(PendingActionType.JoinRoom, payload.roomId);
                break;
            case Action.BulkRedactStart:
                addAction(PendingActionType.BulkRedact, payload.roomId);
                break;
            case Action.BulkRedactEnd:
                removeAction(PendingActionType.BulkRedact, payload.roomId);
                break;
        }
    });
    useTypedEventEmitter(cli, ClientEvent.Room, (room: Room) => removeAction(PendingActionType.JoinRoom, room.roomId));

    return actions;
};

interface IProps {
    onVisibilityChange?(): void;
}

const LegacyRoomListHeader: React.FC<IProps> = ({ onVisibilityChange }) => {
    const [mainMenuDisplayed, mainMenuHandle, openMainMenu, closeMainMenu] = useContextMenu<HTMLDivElement>();
    const [spaceKey, activeSpace] = useEventEmitterState<[SpaceKey, Room | null]>(
        SpaceStore.instance,
        UPDATE_SELECTED_SPACE,
        () => [SpaceStore.instance.activeSpace, SpaceStore.instance.activeSpaceRoom],
    );
    const allRoomsInHome = useEventEmitterState(SpaceStore.instance, UPDATE_HOME_BEHAVIOUR, () => {
        return SpaceStore.instance.allRoomsInHome;
    });
    const pendingActions = usePendingActions();

    const canShowMainMenu = activeSpace || spaceKey === MetaSpace.Home;

    useEffect(() => {
        if (mainMenuDisplayed && !canShowMainMenu) {
            // Space changed under us and we no longer has a main menu to draw
            closeMainMenu();
        }
    }, [closeMainMenu, canShowMainMenu, mainMenuDisplayed]);

    const spaceName = useTypedEventEmitterState(activeSpace ?? undefined, RoomEvent.Name, () => activeSpace?.name);

    useEffect(() => {
        onVisibilityChange?.();
    }, [onVisibilityChange]);

    let contextMenu: JSX.Element | undefined;
    if (mainMenuDisplayed && mainMenuHandle.current) {
        let ContextMenuComponent;
        if (activeSpace) {
            ContextMenuComponent = SpaceContextMenu;
        } else {
            ContextMenuComponent = HomeButtonContextMenu;
        }

        contextMenu = (
            <ContextMenuComponent
                {...contextMenuBelow(mainMenuHandle.current.getBoundingClientRect())}
                space={activeSpace!}
                onFinished={closeMainMenu}
                hideHeader={true}
            />
        );
    }

    let title: string;
    if (activeSpace && spaceName) {
        title = spaceName;
    } else {
        title = getMetaSpaceName(spaceKey as MetaSpace, allRoomsInHome);
    }

    const pendingActionSummary = [...pendingActions.entries()]
        .filter(([type, keys]) => keys.size > 0)
        .map(([type, keys]) => {
            switch (type) {
                case PendingActionType.JoinRoom:
                    return _t("room_list|joining_rooms_status", { count: keys.size });
                case PendingActionType.BulkRedact:
                    return _t("room_list|redacting_messages_status", { count: keys.size });
            }
        })
        .join("\n");

    let contextMenuButton: JSX.Element = <div className="mx_LegacyRoomListHeader_contextLessTitle">{title}</div>;
    if (canShowMainMenu) {
        const commonProps = {
            ref: mainMenuHandle,
            onClick: openMainMenu,
            isExpanded: mainMenuDisplayed,
            className: "mx_LegacyRoomListHeader_contextMenuButton",
            children: title,
        };

        if (!!activeSpace) {
            contextMenuButton = (
                <ContextMenuButton
                    {...commonProps}
                    label={_t("room_list|space_menu_label", { spaceName: spaceName ?? activeSpace.name })}
                />
            );
        } else {
            contextMenuButton = <ContextMenuTooltipButton {...commonProps} title={_t("room_list|home_menu_label")} />;
        }
    }

    return (
        <aside className="mx_LegacyRoomListHeader" aria-label={_t("room|context_menu|title")}>
            {contextMenuButton}
            {pendingActionSummary ? (
                <Tooltip label={pendingActionSummary} isTriggerInteractive={false}>
                    <InlineSpinner />
                </Tooltip>
            ) : null}

            {contextMenu}
        </aside>
    );
};

export default LegacyRoomListHeader;
