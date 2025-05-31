/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { Button } from "@vector-im/compound-web";
import classNames from "classnames";
import { type Room } from "matrix-js-sdk/src/matrix";
import React, { type JSX, useContext } from "react";

import { _t } from "../../../languageHandler";
import ContextMenu, { aboveLeftOf, type MenuProps, useContextMenu } from "../../structures/ContextMenu";
import EmojiPicker from "../emojipicker/EmojiPicker";
import { CollapsibleButton } from "./CollapsibleButton";
import { OverflowMenuContext } from "./MessageComposerAttachments";
import Stickerpicker from "./Stickerpicker";

interface IEmojiButtonProps {
    addEmoji: (unicode: string) => boolean;
    menuPosition?: MenuProps;
    className?: string;
    room: Room;
    threadId?: string | null;
}

export function EmojiButton({ addEmoji, room, threadId, menuPosition, className }: IEmojiButtonProps): JSX.Element {
    const overflowMenuCloser = useContext(OverflowMenuContext);
    const [menuDisplayed, button, openMenu, closeMenu] = useContextMenu();
    const [tab, setTab] = React.useState<"emoji" | "stickers">("emoji");

    let contextMenu: React.ReactElement | null = null;
    const tabSelector: React.ReactElement | null = null;
    if (menuDisplayed && button.current) {
        const position = menuPosition ?? aboveLeftOf(button.current.getBoundingClientRect());
        const onFinished = (): void => {
            closeMenu();
            overflowMenuCloser?.();
        };

        const contextMenuFactory = (selectedTab: typeof tab): React.JSX.Element => (
                <ContextMenu
                    {...position}
                    onFinished={onFinished}
                    managed={false}
                    menuWidth={342}
                    menuHeight={512}
                    mountAsChild={selectedTab === "stickers"}
                >
                    {selectedTab === "emoji" ? (
                        <EmojiPicker onChoose={addEmoji} onFinished={onFinished} />
                    ) : (
                        <Stickerpicker
                            room={room}
                            threadId={threadId}
                            menuPosition={position}
                            onFinished={onFinished}
                            key="stickers"
                        />
                    )}
                    <div className="mx_EmojiButton_tabs">
                        <Button onClick={() => setTab("emoji")} size="sm" disabled={selectedTab === "emoji"} kind="secondary">
                            Emoji
                        </Button>
                        <Button onClick={() => setTab("stickers")} size="sm" disabled={selectedTab === "stickers"} kind="secondary">
                            Stickers
                        </Button>
                    </div>
                </ContextMenu>
        )

        const stickerPickerTab = contextMenuFactory("stickers");
        const emojiPickerTab = contextMenuFactory("emoji");

        contextMenu = tab === "stickers" ? stickerPickerTab : emojiPickerTab;
    }

    // TODO: replace ContextMenuTooltipButton with a unified representation of
    // the header buttons and the right panel buttons
    return (
        <>
            <CollapsibleButton
                className={classNames("mx_EmojiButton", className)}
                iconClassName="mx_EmojiButton_icon"
                onClick={openMenu}
                title={_t("common|emoji")}
                inputRef={button}
            />

            {contextMenu}
            {tabSelector}
        </>
    );
}
