/*
Copyright 2024 New Vector Ltd.
Copyright 2020 The Matrix.org Foundation C.I.C.
Copyright 2019 Tulir Asokan <tulir@maunium.net>

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { type Relations, RelationsEvent } from "matrix-js-sdk/src/matrix";

import EmojiPicker from "./EmojiPicker";
import RoomContext from "../../../contexts/RoomContext";
import { getReactionsByUser } from "../../../utils/Reaction";


interface IProps {
    reactions?: Relations | null | undefined;
    onChoose(emoji: string): boolean;
    onFinished(): void;
}

interface IState {
    selectedEmojis: Set<string>;
}

class ReactionPicker extends React.Component<IProps, IState> {
    public static contextType = RoomContext;
    declare public context: React.ContextType<typeof RoomContext>;

    public constructor(props: IProps) {
        super(props);

        this.state = {
            selectedEmojis: new Set(Object.keys(getReactionsByUser(this.props.reactions))),
        };
    }

    public componentDidMount(): void {
        this.addListeners();
    }

    public componentDidUpdate(prevProps: IProps): void {
        if (prevProps.reactions !== this.props.reactions) {
            this.addListeners();
            this.onReactionsChange();
        }
    }

    private addListeners(): void {
        if (this.props.reactions) {
            this.props.reactions.on(RelationsEvent.Add, this.onReactionsChange);
            this.props.reactions.on(RelationsEvent.Remove, this.onReactionsChange);
            this.props.reactions.on(RelationsEvent.Redaction, this.onReactionsChange);
        }
    }

    public componentWillUnmount(): void {
        if (this.props.reactions) {
            this.props.reactions.removeListener(RelationsEvent.Add, this.onReactionsChange);
            this.props.reactions.removeListener(RelationsEvent.Remove, this.onReactionsChange);
            this.props.reactions.removeListener(RelationsEvent.Redaction, this.onReactionsChange);
        }
    }

    private onReactionsChange = (): void => {
        this.setState({
            selectedEmojis: new Set(Object.keys(getReactionsByUser(this.props.reactions))),
        });
    };

    private isEmojiDisabled = (unicode: string): boolean => {
        if (!getReactionsByUser(this.props.reactions)[unicode]) return false;
        if (this.context.canSelfRedact) return false;

        return true;
    };

    public render(): React.ReactNode {
        return (
            <EmojiPicker
                onChoose={this.props.onChoose}
                isEmojiDisabled={this.isEmojiDisabled}
                onFinished={this.props.onFinished}
                selectedEmojis={this.state.selectedEmojis}
            />
        );
    }
}

export default ReactionPicker;
