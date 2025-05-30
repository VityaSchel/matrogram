/*
Copyright 2024 New Vector Ltd.
Copyright 2020 The Matrix.org Foundation C.I.C.
Copyright 2017, 2018 Vector Creations Ltd
Copyright 2015, 2016 OpenMarket Ltd

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type Room } from "matrix-js-sdk/src/matrix";
import classNames from "classnames";
import React, { type JSX, createRef, type ReactComponentElement } from "react";

import { polyfillTouchEvent } from "../../../@types/polyfill";
import { KeyBindingAction } from "../../../accessibility/KeyboardShortcuts";
import { Action } from "../../../dispatcher/actions";
import defaultDispatcher, { type MatrixDispatcher } from "../../../dispatcher/dispatcher";
import { type ActionPayload } from "../../../dispatcher/payloads";
import { getKeyBindingsManager } from "../../../KeyBindingsManager";
import { DefaultTagID, type TagID } from "../../../stores/room-list/models";
import RoomListStore, { LISTS_UPDATE_EVENT, LISTS_LOADING_EVENT } from "../../../stores/room-list/RoomListStore";
import { arrayFastClone, arrayHasOrderChange } from "../../../utils/arrays";
import { objectExcluding, objectHasDiff } from "../../../utils/objects";
import type ResizeNotifier from "../../../utils/ResizeNotifier";
import type ExtraTile from "./ExtraTile";
import RoomTile from "./RoomTile";

export const HEADER_HEIGHT = 32; // As defined by CSS

// HACK: We really shouldn't have to do this.
polyfillTouchEvent();

export interface IAuxButtonProps {
    tabIndex: number;
    dispatcher?: MatrixDispatcher;
}

interface IProps {
    forRooms: boolean;
    isMinimized: boolean;
    showSkeleton?: boolean;
    alwaysVisible?: boolean;
    forceExpanded?: boolean;
    resizeNotifier: ResizeNotifier;
    extraTiles?: ReactComponentElement<typeof ExtraTile>[] | null;
    onListCollapse?: (isExpanded: boolean) => void;
    tagIds: TagID[];
}

interface IState {
    isExpanded: boolean; // used for the for expand of the sublist when the room list is being filtered
    rooms: Room[];
    roomsLoading: boolean;
}

export default class RoomSublist extends React.Component<IProps, IState> {
    private headerButton = createRef<HTMLDivElement>();
    private sublistRef = createRef<HTMLDivElement>();
    private tilesRef = createRef<HTMLDivElement>();
    private dispatcherRef?: string;

    public constructor(props: IProps) {
        super(props);

        this.state = {
            isExpanded: true,
            rooms: this.getRooms(props.tagIds),
            roomsLoading: false,
        };
    }

    private getRooms(tagIds: TagID[]): Room[] {
        const lists = RoomListStore.instance.orderedLists
        const rooms = tagIds.map(k => arrayFastClone(lists[k] || [])).flat()
        return rooms.sort((a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp());
    }

    private get extraTiles(): ReactComponentElement<typeof ExtraTile>[] | null {
        return this.props.extraTiles ?? null;
    }

    private get numTiles(): number {
        return RoomSublist.calcNumTiles(this.state.rooms, this.extraTiles);
    }

    private static calcNumTiles(rooms: Room[], extraTiles?: any[] | null): number {
        return (rooms || []).length + (extraTiles || []).length;
    }

    private get numVisibleTiles(): number {
        const nVisible = 50;
        return Math.min(nVisible, this.numTiles);
    }

    public shouldComponentUpdate(nextProps: Readonly<IProps>, nextState: Readonly<IState>): boolean {
        if (objectHasDiff(this.props, nextProps)) {
            // Something we don't care to optimize has updated, so update.
            return true;
        }

        // Do the same check used on props for state, without the rooms we're going to no-op
        const prevStateNoRooms = objectExcluding(this.state, ["rooms"]);
        const nextStateNoRooms = objectExcluding(nextState, ["rooms"]);
        if (objectHasDiff(prevStateNoRooms, nextStateNoRooms)) {
            return true;
        }

        // If we're supposed to handle extra tiles, take the performance hit and re-render all the
        // time so we don't have to consider them as part of the visible room optimization.
        const prevExtraTiles = this.props.extraTiles || [];
        const nextExtraTiles = nextProps.extraTiles || [];
        if (prevExtraTiles.length > 0 || nextExtraTiles.length > 0) {
            return true;
        }

        // If we're about to update the height of the list, we don't really care about which rooms
        // are visible or not for no-op purposes, so ensure that the height calculation runs through.
        if (RoomSublist.calcNumTiles(nextState.rooms, nextExtraTiles) !== this.numTiles) {
            return true;
        }

        // Before we go analyzing the rooms, we can see if we're collapsed. If we're collapsed, we don't need
        // to render anything. We do this after the height check though to ensure that the height gets appropriately
        // calculated for when/if we become uncollapsed.
        if (!nextState.isExpanded) {
            return false;
        }

        // Quickly double check we're not about to break something due to the number of rooms changing.
        if (this.state.rooms.length !== nextState.rooms.length) {
            return true;
        }

        // Finally, determine if the room update (as presumably that's all that's left) is within
        // our visible range. If it is, then do a render. If the update is outside our visible range
        // then we can skip the update.
        //
        // We also optimize for order changing here: if the update did happen in our visible range
        // but doesn't result in the list re-sorting itself then there's no reason for us to update
        // on our own.
        const prevSlicedRooms = this.state.rooms.slice(0, this.numVisibleTiles);
        const nextSlicedRooms = nextState.rooms.slice(0, this.numVisibleTiles);
        if (arrayHasOrderChange(prevSlicedRooms, nextSlicedRooms)) {
            return true;
        }

        // Finally, nothing happened so no-op the update
        return false;
    }

    public componentDidMount(): void {
        this.dispatcherRef = defaultDispatcher.register(this.onAction);
        RoomListStore.instance.on(LISTS_UPDATE_EVENT, this.onListsUpdated);
        RoomListStore.instance.on(LISTS_LOADING_EVENT, this.onListsLoading);

        // Using the passive option to not block the main thread
        // https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#improving_scrolling_performance_with_passive_listeners
        this.tilesRef.current?.addEventListener("scroll", this.onScrollPrevent, { passive: true });
    }

    public componentWillUnmount(): void {
        defaultDispatcher.unregister(this.dispatcherRef);
        RoomListStore.instance.off(LISTS_UPDATE_EVENT, this.onListsUpdated);
        RoomListStore.instance.off(LISTS_LOADING_EVENT, this.onListsLoading);
        this.tilesRef.current?.removeEventListener("scroll", this.onScrollPrevent);
    }

    private onListsLoading = (tagId: TagID, isLoading: boolean): void => {
        this.setState({
            roomsLoading: isLoading,
        });
    };

    private onListsUpdated = (): void => {
        const stateUpdates = {} as IState;

        const currentRooms = this.state.rooms;
        const newRooms = this.getRooms(this.props.tagIds);
        if (arrayHasOrderChange(currentRooms, newRooms)) {
            stateUpdates.rooms = newRooms;
        }

        if (Object.keys(stateUpdates).length > 0) {
            this.setState(stateUpdates);
        }
    };

    private onAction = (payload: ActionPayload): void => {
        if (payload.action === Action.ViewRoom && payload.show_room_tile && this.state.rooms) {
            // XXX: we have to do this a tick later because we have incorrect intermediate props during a room change
            // where we lose the room we are changing from temporarily and then it comes back in an update right after.
            setTimeout(() => {
                const roomIndex = this.state.rooms.findIndex((r) => r.roomId === payload.room_id);

                // extend the visible section to include the room if it is entirely invisible
                if (roomIndex >= this.numVisibleTiles) {
                    this.forceUpdate(); // because the layout doesn't trigger a re-render
                }
            }, 0);
        }
    };

    private onKeyDown = (ev: React.KeyboardEvent): void => {
        const action = getKeyBindingsManager().getAccessibilityAction(ev);
        switch (action) {
            // On ArrowLeft go to the sublist header
            case KeyBindingAction.ArrowLeft:
                ev.stopPropagation();
                this.headerButton.current?.focus();
                break;
            // Consume ArrowRight so it doesn't cause focus to get sent to composer
            case KeyBindingAction.ArrowRight:
                ev.stopPropagation();
        }
    };

    private renderVisibleTiles(): React.ReactElement[] {
        if (!this.state.isExpanded && !this.props.forceExpanded) {
            // don't waste time on rendering
            return [];
        }

        const tiles: React.ReactElement[] = [];

        if (this.state.rooms) {
            let visibleRooms = this.state.rooms;
            if (!this.props.forceExpanded) {
                visibleRooms = visibleRooms.slice(0, this.numVisibleTiles);
            }

            for (const room of visibleRooms) {
                tiles.push(
                    <RoomTile
                        room={room}
                        key={`room-${room.roomId}`}
                        isMinimized={this.props.isMinimized}
                        tag={DefaultTagID.DM}
                    />,
                );
            }
        }

        if (this.extraTiles) {
            // HACK: We break typing here, but this 'extra tiles' property shouldn't exist.
            (tiles as any[]).push(...this.extraTiles);
        }

        // We only have to do this because of the extra tiles. We do it conditionally
        // to avoid spending cycles on slicing. It's generally fine to do this though
        // as users are unlikely to have more than a handful of tiles when the extra
        // tiles are used.
        if (tiles.length > this.numVisibleTiles && !this.props.forceExpanded) {
            return tiles.slice(0, this.numVisibleTiles);
        }

        return tiles;
    }

    private onScrollPrevent(e: Event): void {
        // the RoomTile calls scrollIntoView and the browser may scroll a div we do not wish to be scrollable
        // this fixes https://github.com/vector-im/element-web/issues/14413
        (e.target as HTMLDivElement).scrollTop = 0;
    }

    public render(): React.ReactElement {
        const visibleTiles = this.renderVisibleTiles();
        const hidden = !this.state.rooms.length && !this.props.extraTiles?.length && this.props.alwaysVisible !== true;
        const classes = classNames({
            mx_RoomSublist: true,
            mx_RoomSublist_minimized: this.props.isMinimized,
            mx_RoomSublist_hidden: hidden,
        });

        let content: JSX.Element | undefined;
        if (this.state.roomsLoading) {
            content = <div className="mx_RoomSublist_skeletonUI" />;
        } else if (visibleTiles.length > 0 && this.props.forceExpanded) {
            content = (
                <div className="mx_RoomSublist_resizeBox mx_RoomSublist_resizeBox_forceExpanded">
                    <div className="mx_RoomSublist_tiles" ref={this.tilesRef}>
                        {visibleTiles}
                    </div>
                </div>
            );
        } else if (visibleTiles.length > 0) {
            content = (
                <React.Fragment>
                    <div className="mx_RoomSublist_tiles" ref={this.tilesRef}>
                        {visibleTiles}
                    </div>
                </React.Fragment>
            );
        } else if (this.props.showSkeleton && this.state.isExpanded) {
            content = <div className="mx_RoomSublist_skeletonUI" />;
        }

        return (
            <div
                ref={this.sublistRef}
                className={classes}
                role="group"
                aria-hidden={hidden}
                onKeyDown={this.onKeyDown}
            >
                {content}
            </div>
        );
    }
}
