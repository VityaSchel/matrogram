/* eslint-disable matrix-org/require-copyright-header */
import React, { type JSX, useContext } from "react";
import { EventType, type Room, RoomType } from "matrix-js-sdk/src/matrix";

import { type ViewRoomPayload } from "../../dispatcher/payloads/ViewRoomPayload";
import { useFeatureEnabled } from "../../hooks/useSettings";
import PosthogTrackers from "../../PosthogTrackers";
import { UIComponent } from "../../settings/UIFeature";
import {
  shouldShowSpaceInvite,
  showAddExistingRooms,
  showCreateNewRoom,
  showCreateNewSubspace,
  showSpaceInvite,
} from "../../utils/space";
import { BetaPill } from "../views/beta/BetaCard";
import IconizedContextMenu, {
  IconizedContextMenuOption,
  IconizedContextMenuOptionList,
} from "../views/context_menus/IconizedContextMenu";
import MatrixClientContext from "../../contexts/MatrixClientContext";
import { shouldShowComponent } from "../../customisations/helpers/UIComponents";
import { useEventEmitterState } from "../../hooks/useEventEmitter";
import { type SpaceKey, UPDATE_SELECTED_SPACE } from "../../stores/spaces";
import SpaceStore from "../../stores/spaces/SpaceStore";
import { ContextMenuTooltipButton, useContextMenu } from "./ContextMenu";
import { _t } from "../../languageHandler";
import { contextMenuBelow } from "../views/rooms/RoomTile";
import defaultDispatcher from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";

export default function PlusButton(): React.JSX.Element {
  const cli = useContext(MatrixClientContext);
  const videoRoomsEnabled = useFeatureEnabled("feature_video_rooms");
  const elementCallVideoRoomsEnabled = useFeatureEnabled("feature_element_call_video_rooms");

  const [, activeSpace] = useEventEmitterState<[SpaceKey, Room | null]>(
    SpaceStore.instance,
    UPDATE_SELECTED_SPACE,
    () => [SpaceStore.instance.activeSpace, SpaceStore.instance.activeSpaceRoom],
  );

  const [plusMenuDisplayed, plusMenuHandle, openPlusMenu, closePlusMenu] = useContextMenu<HTMLDivElement>();

  const canExploreRooms = shouldShowComponent(UIComponent.ExploreRooms);
  const canCreateRooms = shouldShowComponent(UIComponent.CreateRooms);
  const canCreateSpaces = shouldShowComponent(UIComponent.CreateSpaces);

  const hasPermissionToAddSpaceChild = activeSpace?.currentState?.maySendStateEvent(
    EventType.SpaceChild,
    cli.getUserId()!,
  );
  const canAddSubRooms = hasPermissionToAddSpaceChild && canCreateRooms;
  const canAddSubSpaces = hasPermissionToAddSpaceChild && canCreateSpaces;

  // If the user can't do anything on the plus menu, don't show it. This aims to target the
  // plus menu shown on the Home tab primarily: the user has options to use the menu for
  // communities and spaces, but is at risk of no options on the Home tab.
  const canShowPlusMenu = canCreateRooms || canExploreRooms || canCreateSpaces || activeSpace;

  let contextMenu
  if (plusMenuDisplayed && activeSpace) {
    let inviteOption: JSX.Element | undefined;
    if (shouldShowSpaceInvite(activeSpace)) {
      inviteOption = (
        <IconizedContextMenuOption
          label={_t("action|invite")}
          iconClassName="mx_LegacyRoomListHeader_iconInvite"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            showSpaceInvite(activeSpace);
            closePlusMenu();
          }}
        />
      );
    }

    let newRoomOptions: JSX.Element | undefined;
    if (activeSpace?.currentState.maySendStateEvent(EventType.RoomAvatar, cli.getUserId()!)) {
      newRoomOptions = (
        <>
          <IconizedContextMenuOption
            iconClassName="mx_LegacyRoomListHeader_iconNewRoom"
            label={_t("action|new_room")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              showCreateNewRoom(activeSpace);
              PosthogTrackers.trackInteraction("WebRoomListHeaderPlusMenuCreateRoomItem", e);
              closePlusMenu();
            }}
          />
          {videoRoomsEnabled && (
            <IconizedContextMenuOption
              iconClassName="mx_LegacyRoomListHeader_iconNewVideoRoom"
              label={_t("action|new_video_room")}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                showCreateNewRoom(
                  activeSpace,
                  elementCallVideoRoomsEnabled ? RoomType.UnstableCall : RoomType.ElementVideo,
                );
                closePlusMenu();
              }}
            >
              <BetaPill />
            </IconizedContextMenuOption>
          )}
        </>
      );
    }

    contextMenu = (
      <IconizedContextMenu
        {...contextMenuBelow(plusMenuHandle.current!.getBoundingClientRect())}
        onFinished={closePlusMenu}
        compact
      >
        <IconizedContextMenuOptionList first>
          {inviteOption}
          {newRoomOptions}
          <IconizedContextMenuOption
            label={_t("action|explore_rooms")}
            iconClassName="mx_LegacyRoomListHeader_iconExplore"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              defaultDispatcher.dispatch<ViewRoomPayload>({
                action: Action.ViewRoom,
                room_id: activeSpace.roomId,
                metricsTrigger: undefined, // other
              });
              closePlusMenu();
              PosthogTrackers.trackInteraction("WebRoomListHeaderPlusMenuExploreRoomsItem", e);
            }}
          />
          <IconizedContextMenuOption
            label={_t("action|add_existing_room")}
            iconClassName="mx_LegacyRoomListHeader_iconPlus"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              showAddExistingRooms(activeSpace);
              closePlusMenu();
            }}
            disabled={!canAddSubRooms}
            title={!canAddSubRooms ? _t("spaces|error_no_permission_add_room") : undefined}
          />
          {canCreateSpaces && (
            <IconizedContextMenuOption
              label={_t("room_list|add_space_label")}
              iconClassName="mx_LegacyRoomListHeader_iconPlus"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                showCreateNewSubspace(activeSpace);
                closePlusMenu();
              }}
              disabled={!canAddSubSpaces}
              title={!canAddSubSpaces ? _t("spaces|error_no_permission_add_space") : undefined}
            >
              <BetaPill />
            </IconizedContextMenuOption>
          )}
        </IconizedContextMenuOptionList>
      </IconizedContextMenu>
    );
  }
  let newRoomOpts: JSX.Element | undefined;
  let joinRoomOpt: JSX.Element | undefined;
  if (plusMenuDisplayed) {
    if (canCreateRooms) {
      newRoomOpts = (
        <>
          <IconizedContextMenuOption
            label={_t("action|start_new_chat")}
            iconClassName="mx_LegacyRoomListHeader_iconStartChat"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              defaultDispatcher.dispatch({ action: Action.CreateChat });
              PosthogTrackers.trackInteraction("WebRoomListHeaderPlusMenuCreateChatItem", e);
              closePlusMenu();
            }}
          />
          <IconizedContextMenuOption
            label={_t("action|new_room")}
            iconClassName="mx_LegacyRoomListHeader_iconNewRoom"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              defaultDispatcher.dispatch({ action: Action.CreateRoom });
              PosthogTrackers.trackInteraction("WebRoomListHeaderPlusMenuCreateRoomItem", e);
              closePlusMenu();
            }}
          />
          {videoRoomsEnabled && (
            <IconizedContextMenuOption
              label={_t("action|new_video_room")}
              iconClassName="mx_LegacyRoomListHeader_iconNewVideoRoom"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                defaultDispatcher.dispatch({
                  action: Action.CreateRoom,
                  type: elementCallVideoRoomsEnabled ? RoomType.UnstableCall : RoomType.ElementVideo,
                });
                closePlusMenu();
              }}
            >
              <BetaPill />
            </IconizedContextMenuOption>
          )}
        </>
      );
    }
    if (canExploreRooms) {
      joinRoomOpt = (
        <IconizedContextMenuOption
          label={_t("room_list|join_public_room_label")}
          iconClassName="mx_LegacyRoomListHeader_iconExplore"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            defaultDispatcher.dispatch({ action: Action.ViewRoomDirectory });
            PosthogTrackers.trackInteraction("WebRoomListHeaderPlusMenuExploreRoomsItem", e);
            closePlusMenu();
          }}
        />
      );
    }
    contextMenu = (
      <IconizedContextMenu
        {...contextMenuBelow(plusMenuHandle.current!.getBoundingClientRect())}
        onFinished={closePlusMenu}
        compact
      >
        <IconizedContextMenuOptionList first>
          {newRoomOpts}
          {joinRoomOpt}
        </IconizedContextMenuOptionList>
      </IconizedContextMenu>
    );
  }
  return (
    <React.Fragment>
      {canShowPlusMenu && (
        <ContextMenuTooltipButton
          ref={plusMenuHandle}
          onClick={openPlusMenu}
          isExpanded={plusMenuDisplayed}
          className="mx_LeftPanel_plusButton"
          title={_t("action|add")}
        />
      )}
      {contextMenu}
    </React.Fragment>
  )
}