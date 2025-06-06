/* eslint-disable matrix-org/require-copyright-header */
import React, { type ReactNode } from "react";

import { PlaybackState } from "../../../video/Playback";
import SeekBar from "./SeekBar";
import VideoPlayerBase, { type IProps as IVideoPlayerBaseProps } from "./VideoPlayerBase";

export enum PlaybackLayout {
    /**
     * Preview before sending
     */
    Preview,

    /**
     * Video message in a timeline
     */
    Timeline,
}

interface IProps extends IVideoPlayerBaseProps {
    layout?: PlaybackLayout; // Defaults to Timeline layout
}

export default class RecordingPlayback extends VideoPlayerBase<IProps> {
    private renderPreviewLook(): ReactNode {
        return (
            <>
                <video ref={this.props.playback.playerRef} src={this.state.src} loop />
                <SeekBar
                    playback={this.props.playback}
                    tabIndex={0} // allow keyboard users to fall into the seek bar
                    disabled={this.state.playbackPhase === PlaybackState.Decoding}
                    ref={this.seekRef}
                />
            </>
        );
    }

    private renderTimelineLook(): ReactNode {
        return (
            <>
                <div className="mx_RecordingPlayback_timelineLayoutMiddle">
                    <SeekBar
                        playback={this.props.playback}
                        tabIndex={0} // allow keyboard users to fall into the seek bar
                        disabled={this.state.playbackPhase === PlaybackState.Decoding}
                        ref={this.seekRef}
                    />
                </div>
            </>
        );
    }

    protected renderComponent(): ReactNode {
        let body: ReactNode;
        switch (this.props.layout) {
            case PlaybackLayout.Preview:
                body = this.renderPreviewLook();
                break;
            case PlaybackLayout.Timeline: // default is timeline, fall through.
            default:
                body = this.renderTimelineLook();
                break;
        }

        return (
            <div className="mx_VideoMessagePrimaryContainer" onKeyDown={this.onKeyDown}>
                {body}
            </div>
        );
    }
}
