/*
Copyright 2024 New Vector Ltd.
Copyright 2015-2018 , 2020, 2021 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type Room } from "matrix-js-sdk/src/matrix";
import React, { createRef, type ReactComponentElement, type SyntheticEvent } from "react";

import { type IState as IRovingTabIndexState, RovingTabIndexProvider } from "../../../accessibility/RovingTabIndex.tsx";
import MatrixClientContext from "../../../contexts/MatrixClientContext.tsx";
import { Action } from "../../../dispatcher/actions.ts";
import defaultDispatcher from "../../../dispatcher/dispatcher.ts";
import { type ActionPayload } from "../../../dispatcher/payloads.ts";
import { type ViewRoomDeltaPayload } from "../../../dispatcher/payloads/ViewRoomDeltaPayload.ts";
import { type ViewRoomPayload } from "../../../dispatcher/payloads/ViewRoomPayload.ts";
import { _t } from "../../../languageHandler.tsx";
import { RoomNotificationStateStore } from "../../../stores/notifications/RoomNotificationStateStore.ts";
import { type ITagMap } from "../../../stores/room-list/algorithms/models.ts";
import { DefaultTagID, type TagID } from "../../../stores/room-list/models.ts";
import { UPDATE_EVENT } from "../../../stores/AsyncStore.ts";
import RoomListStore, { LISTS_UPDATE_EVENT } from "../../../stores/room-list/RoomListStore.ts";
import RoomAvatar from "../avatars/RoomAvatar.tsx";
import {
    type ISuggestedRoom,
    type SpaceKey,
    UPDATE_SUGGESTED_ROOMS,
} from "../../../stores/spaces/index.ts";
import SpaceStore from "../../../stores/spaces/SpaceStore.ts";
import { arrayFastClone, arrayHasDiff } from "../../../utils/arrays.ts";
import { objectShallowClone, objectWithOnly } from "../../../utils/objects.ts";
import type ResizeNotifier from "../../../utils/ResizeNotifier.ts";
import ExtraTile from "./ExtraTile.tsx";
import RoomSublist from "./RoomSublist.tsx";
import { SdkContextClass } from "../../../contexts/SDKContext.ts";
import { KeyBindingAction } from "../../../accessibility/KeyboardShortcuts.ts";
import { getKeyBindingsManager } from "../../../KeyBindingsManager.ts";
import { Landmark, LandmarkNavigation } from "../../../accessibility/LandmarkNavigation.ts";
import LegacyCallHandler, { LegacyCallHandlerEvent } from "../../../LegacyCallHandler.tsx";

interface IProps {
    onKeyDown: (ev: React.KeyboardEvent, state: IRovingTabIndexState) => void;
    onFocus: (ev: React.FocusEvent) => void;
    onBlur: (ev: React.FocusEvent) => void;
    onResize: () => void;
    onListCollapse?: (isExpanded: boolean) => void;
    resizeNotifier: ResizeNotifier;
    isMinimized: boolean;
    activeSpace: SpaceKey;
}

interface IState {
    sublists: ITagMap;
    currentRoomId?: string;
    suggestedRooms: ISuggestedRoom[];
}

export const TAG_ORDER: TagID[][] = [
    [DefaultTagID.Invite],
    [DefaultTagID.Favourite],
    [DefaultTagID.DM,
    DefaultTagID.Untagged,
    DefaultTagID.Conference,
    DefaultTagID.LowPriority,
    DefaultTagID.ServerNotice,
    DefaultTagID.Suggested],
    // DefaultTagID.Archived isn't here any more: we don't show it at all.
    // The section still exists in the code as a place for rooms that we know
    // about but aren't joined. At some point it could be removed entirely
    // but we'd have to make sure that rooms you weren't in were hidden.
];

export default class LegacyRoomList extends React.PureComponent<IProps, IState> {
    private dispatcherRef?: string;
    private treeRef = createRef<HTMLDivElement>();

    public static contextType = MatrixClientContext;
    declare public context: React.ContextType<typeof MatrixClientContext>;

    public constructor(props: IProps) {
        super(props);

        this.state = {
            sublists: {},
            suggestedRooms: SpaceStore.instance.suggestedRooms,
        };
    }

    public componentDidMount(): void {
        this.dispatcherRef = defaultDispatcher.register(this.onAction);
        SdkContextClass.instance.roomViewStore.on(UPDATE_EVENT, this.onRoomViewStoreUpdate);
        SpaceStore.instance.on(UPDATE_SUGGESTED_ROOMS, this.updateSuggestedRooms);
        RoomListStore.instance.on(LISTS_UPDATE_EVENT, this.updateLists);
        LegacyCallHandler.instance.on(LegacyCallHandlerEvent.ProtocolSupport, this.updateProtocolSupport);
        this.updateLists(); // trigger the first update
    }

    public componentWillUnmount(): void {
        SpaceStore.instance.off(UPDATE_SUGGESTED_ROOMS, this.updateSuggestedRooms);
        RoomListStore.instance.off(LISTS_UPDATE_EVENT, this.updateLists);
        defaultDispatcher.unregister(this.dispatcherRef);
        SdkContextClass.instance.roomViewStore.off(UPDATE_EVENT, this.onRoomViewStoreUpdate);
        LegacyCallHandler.instance.off(LegacyCallHandlerEvent.ProtocolSupport, this.updateProtocolSupport);
    }

    private updateProtocolSupport = (): void => {
        this.updateLists();
    };

    private onRoomViewStoreUpdate = (): void => {
        this.setState({
            currentRoomId: SdkContextClass.instance.roomViewStore.getRoomId() ?? undefined,
        });
    };

    private onAction = (payload: ActionPayload): void => {
        if (payload.action === Action.ViewRoomDelta) {
            const viewRoomDeltaPayload = payload as ViewRoomDeltaPayload;
            const currentRoomId = SdkContextClass.instance.roomViewStore.getRoomId();
            if (!currentRoomId) return;
            const room = this.getRoomDelta(currentRoomId, viewRoomDeltaPayload.delta, viewRoomDeltaPayload.unread);
            if (room) {
                defaultDispatcher.dispatch<ViewRoomPayload>({
                    action: Action.ViewRoom,
                    room_id: room.roomId,
                    show_room_tile: true, // to make sure the room gets scrolled into view
                    metricsTrigger: "WebKeyboardShortcut",
                    metricsViaKeyboard: true,
                });
            }
        }
    };

    private getRoomDelta = (roomId: string, delta: number, unread = false): Room => {
        const lists = RoomListStore.instance.orderedLists;
        const rooms: Room[] = [];
        TAG_ORDER.forEach((t) => {
            let listRooms = t.map(k => lists[k]).flat().sort((a, b) => b.getLast() - a.getLastActiveTimestamp());

            if (unread) {
                // filter to only notification rooms (and our current active room so we can index properly)
                listRooms = listRooms.filter((r) => {
                    const state = RoomNotificationStateStore.instance.getRoomState(r);
                    return state.room.roomId === roomId || state.isUnread;
                });
            }

            rooms.push(...listRooms);
        });

        const currentIndex = rooms.findIndex((r) => r.roomId === roomId);
        // use slice to account for looping around the start
        const [room] = rooms.slice((currentIndex + delta) % rooms.length);
        return room;
    };

    private updateSuggestedRooms = (suggestedRooms: ISuggestedRoom[]): void => {
        this.setState({ suggestedRooms });
    };

    private updateLists = (): void => {
        const newLists = RoomListStore.instance.orderedLists;
        const previousListIds = Object.keys(this.state.sublists);
        const newListIds = Object.keys(newLists);

        let doUpdate = arrayHasDiff(previousListIds, newListIds);
        if (!doUpdate) {
            // so we didn't have the visible sublists change, but did the contents of those
            // sublists change significantly enough to break the sticky headers? Probably, so
            // let's check the length of each.
            for (const tagId of newListIds) {
                const oldRooms = this.state.sublists[tagId];
                const newRooms = newLists[tagId];
                if (oldRooms.length !== newRooms.length) {
                    doUpdate = true;
                    break;
                }
            }
        }

        if (doUpdate) {
            // We have to break our reference to the room list store if we want to be able to
            // diff the object for changes, so do that.
            // @ts-ignore - ITagMap is ts-ignored so this will have to be too
            const newSublists = objectWithOnly(newLists, newListIds);
            const sublists = objectShallowClone(newSublists, (k, v) => arrayFastClone(v));

            this.setState({ sublists }, () => {
                this.props.onResize();
            });
        }
    };

    private renderSuggestedRooms(): ReactComponentElement<typeof ExtraTile>[] {
        return this.state.suggestedRooms.map((room) => {
            const name = room.name || room.canonical_alias || room.aliases?.[0] || _t("empty_room");
            const avatar = (
                <RoomAvatar
                    oobData={{
                        name,
                        avatarUrl: room.avatar_url,
                    }}
                    size="32px"
                />
            );
            const viewRoom = (ev: SyntheticEvent): void => {
                defaultDispatcher.dispatch<ViewRoomPayload>({
                    action: Action.ViewRoom,
                    room_alias: room.canonical_alias || room.aliases?.[0],
                    room_id: room.room_id,
                    via_servers: room.viaServers,
                    oob_data: {
                        avatarUrl: room.avatar_url,
                        name,
                    },
                    metricsTrigger: "RoomList",
                    metricsViaKeyboard: ev.type !== "click",
                });
            };
            return (
                <ExtraTile
                    isMinimized={this.props.isMinimized}
                    isSelected={this.state.currentRoomId === room.room_id}
                    displayName={name}
                    avatar={avatar}
                    onClick={viewRoom}
                    key={`suggestedRoomTile_${room.room_id}`}
                />
            );
        });
    }

    private renderSublists(): React.ReactElement[] {
        // show a skeleton UI if the user is in no rooms and they are not filtering and have no suggested rooms
        const showSkeleton =
            !this.state.suggestedRooms?.length &&
            Object.values(RoomListStore.instance.orderedLists).every((list) => !list?.length);

        return TAG_ORDER.map((orderedTagIds) => {
            let extraTiles: ReactComponentElement<typeof ExtraTile>[] | undefined;
            if (orderedTagIds.length === 0 && orderedTagIds[0] === DefaultTagID.Suggested) {
                extraTiles = this.renderSuggestedRooms();
            }

            // The cost of mounting/unmounting this component offsets the cost
            // of keeping it in the DOM and hiding it when it is not required
            return (
                <RoomSublist
                    key={`sublist-${orderedTagIds.join("-")}`}
                    tagIds={orderedTagIds}
                    forRooms={true}
                    isMinimized={this.props.isMinimized}
                    showSkeleton={showSkeleton}
                    extraTiles={extraTiles}
                    resizeNotifier={this.props.resizeNotifier}
                    alwaysVisible
                    forceExpanded
                />
            );
        });
    }

    public focus(): void {
        // focus the first focusable element in this aria treeview widget
        const treeItems = this.treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]');
        if (!treeItems) return;
        [...treeItems].find((e) => e.offsetParent !== null)?.focus();
    }

    public render(): React.ReactNode {
        const sublists = this.renderSublists();
        return (
            <RovingTabIndexProvider handleHomeEnd handleUpDown onKeyDown={this.props.onKeyDown}>
                {({ onKeyDownHandler }) => (
                    <div
                        onFocus={this.props.onFocus}
                        onBlur={this.props.onBlur}
                        onKeyDown={(ev) => {
                            const navAction = getKeyBindingsManager().getNavigationAction(ev);
                            if (
                                navAction === KeyBindingAction.NextLandmark ||
                                navAction === KeyBindingAction.PreviousLandmark
                            ) {
                                LandmarkNavigation.findAndFocusNextLandmark(
                                    Landmark.ROOM_LIST,
                                    navAction === KeyBindingAction.PreviousLandmark,
                                );
                                ev.stopPropagation();
                                ev.preventDefault();
                                return;
                            }
                            onKeyDownHandler(ev);
                        }}
                        className="mx_LegacyRoomList"
                        role="tree"
                        aria-label={_t("common|rooms")}
                        ref={this.treeRef}
                    >
                        {sublists}
                    </div>
                )}
            </RovingTabIndexProvider>
        );
    }
}
