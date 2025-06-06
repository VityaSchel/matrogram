/* eslint-disable matrix-org/require-copyright-header */
import { type Optional } from "matrix-events-sdk";
import { logger } from "matrix-js-sdk/src/logger";
import { type IEventRelation, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";
import React, { type ReactNode } from "react";

import RoomContext from "../../../contexts/RoomContext";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { _t } from "../../../languageHandler";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import MediaDeviceHandler, { MediaDeviceKindEnum } from "../../../MediaDeviceHandler";
import Modal from "../../../Modal";
import { UPDATE_EVENT } from "../../../stores/AsyncStore";
import { NotificationLevel } from "../../../stores/notifications/NotificationLevel";
import { StaticNotificationState } from "../../../stores/notifications/StaticNotificationState";
import { VideoRecordingStore } from "../../../stores/VideoRecordingStore";
import { createVideoMessageContent } from "../../../utils/createVideoMessageContent";
import { doMaybeLocalRoomAction } from "../../../utils/local-room";
import { addReplyToMessageContent } from "../../../utils/Reply";
import { PlaybackManager } from "../../../video/PlaybackManager";
import { type IUpload, type VideoMessageRecording } from "../../../video/VideoMessageRecording";
import { RecordingState } from "../../../video/VideoRecording";
import ErrorDialog from "../dialogs/ErrorDialog";
import AccessibleButton from "../elements/AccessibleButton";
import InlineSpinner from "../elements/InlineSpinner";
import LiveRecordingPreview from "../video_messages/LiveRecordingPreview";
import RecordingPlayback, { PlaybackLayout } from "../video_messages/RecordingPlayback";
import NotificationBadge from "./NotificationBadge";
import { attachMentions, attachRelation } from "./SendMessageComposer";

interface IProps {
    room: Room;
    relation?: IEventRelation;
    replyToEvent?: MatrixEvent;
}

interface IState {
    recorder?: VideoMessageRecording;
    recordingPhase?: RecordingState;
    didUploadFail?: boolean;
}

/**
 * Container tile for rendering the video message recorder in the composer.
 */
export default class VideoRecordComposerTile extends React.PureComponent<IProps, IState> {
    public static contextType = RoomContext;
    declare public context: React.ContextType<typeof RoomContext>;
    private videoRecordingId: string;

    public constructor(props: IProps) {
        super(props);

        this.state = {};

        this.videoRecordingId = VideoRecordingStore.getVideoRecordingId(this.props.room, this.props.relation);
    }

    public componentDidMount(): void {
        const recorder = VideoRecordingStore.instance.getActiveRecording(this.videoRecordingId);
        if (recorder) {
            if (recorder.isRecording || !recorder.hasRecording) {
                logger.warn("Cached recording hasn't ended yet and might cause issues");
            }
            this.bindNewRecorder(recorder);
            this.setState({ recorder, recordingPhase: RecordingState.Ended });
        }
    }

    public async componentWillUnmount(): Promise<void> {
        // Stop recording, but keep the recording memory (don't dispose it). This is to let the user
        // come back and finish working with it.
        const recording = VideoRecordingStore.instance.getActiveRecording(this.videoRecordingId);
        await recording?.stop();

        // Clean up our listeners by binding a falsy recorder
        this.bindNewRecorder(null);
    }

    // called by composer
    public async send(): Promise<void> {
        if (!this.state.recorder) {
            throw new Error("No recording started - cannot send anything");
        }

        const { replyToEvent, relation } = this.props;

        await this.state.recorder.stop();

        let upload: IUpload;
        try {
            upload = await this.state.recorder.upload(this.videoRecordingId);
        } catch (e) {
            logger.error("Error uploading video message:", e);

            // Flag error and move on. The recording phase will be reset by the upload function.
            this.setState({ didUploadFail: true });

            return; // don't dispose the recording: the user has a chance to re-upload
        }

        try {
            // noinspection ES6MissingAwait - we don't care if it fails, it'll get queued.
            const content = createVideoMessageContent(
                upload.mxc,
                this.state.recorder.contentType,
                Math.round(this.state.recorder.durationSeconds * 1000),
                this.state.recorder.contentLength,
                upload.encrypted,
            );

            // Attach mentions, which really only applies if there's a replyToEvent.
            attachMentions(MatrixClientPeg.safeGet().getSafeUserId(), content, null, replyToEvent);
            attachRelation(content, relation);
            if (replyToEvent) {
                addReplyToMessageContent(content, replyToEvent);
                // Clear reply_to_event as we put the message into the queue
                // if the send fails, retry will handle resending.
                defaultDispatcher.dispatch({
                    action: "reply_to_event",
                    event: null,
                    context: this.context.timelineRenderingType,
                });
            }

            doMaybeLocalRoomAction(
                this.props.room.roomId,
                (actualRoomId: string) => MatrixClientPeg.safeGet().sendMessage(actualRoomId, content),
                this.props.room.client,
            );
        } catch (e) {
            logger.error("Error sending video message:", e);

            // Video message should be in the timeline at this point, so let other things take care
            // of error handling. We also shouldn't need the recording anymore, so fall through to
            // disposal.
        }
        await this.disposeRecording();
    }

    private async disposeRecording(): Promise<void> {
        await VideoRecordingStore.instance.disposeRecording(this.videoRecordingId);

        // Reset back to no recording, which means no phase (ie: restart component entirely)
        this.setState({ recorder: undefined, recordingPhase: undefined, didUploadFail: false });
    }

    private onCancel = async (): Promise<void> => {
        await this.disposeRecording();
    };

    public onRecordStartEndClick = async (): Promise<void> => {
        if (this.state.recorder) {
            await this.state.recorder.stop();
            return;
        }

        const accessError = (): void => {
            Modal.createDialog(ErrorDialog, {
                title: "Can't access microphone or camera",
                description: <p>Please allow this website to use your microphone and camera</p>,
            });
        };

        try {
            const devices = await MediaDeviceHandler.getDevices();
            if (!devices?.[MediaDeviceKindEnum.VideoInput]?.length) {
                Modal.createDialog(ErrorDialog, {
                    title: "No video input found",
                    description: <p>Ensure you have video camera enabled</p>,
                });
                return;
            }
            // else we probably have a device that is good enough
        } catch (e) {
            logger.error("Error getting devices: ", e);
            accessError();
            return;
        }

        try {
            // stop any noises which might be happening
            PlaybackManager.instance.pauseAllExcept();
            const recorder = VideoRecordingStore.instance.startRecording(this.videoRecordingId);
            await recorder.start();

            this.bindNewRecorder(recorder);

            this.setState({ recorder, recordingPhase: RecordingState.Started });
        } catch (e) {
            logger.error("Error starting recording: ", e);
            accessError();

            // noinspection ES6MissingAwait - if this goes wrong we don't want it to affect the call stack
            VideoRecordingStore.instance.disposeRecording(this.videoRecordingId);
        }
    };

    private bindNewRecorder(recorder: Optional<VideoMessageRecording>): void {
        if (this.state.recorder) {
            this.state.recorder.off(UPDATE_EVENT, this.onRecordingUpdate);
        }
        if (recorder) {
            recorder.on(UPDATE_EVENT, this.onRecordingUpdate);
        }
    }

    private onRecordingUpdate = (ev: RecordingState): void => {
        if (ev === RecordingState.EndingSoon) return; // ignore this state: it has no UI purpose here
        this.setState({ recordingPhase: ev });
    };

    private renderPreview(): ReactNode {
        if (!this.state.recorder) return null; // no recorder means we're not recording: no preview

        if (this.state.recordingPhase !== RecordingState.Started) {
            return <RecordingPlayback playback={this.state.recorder.getPlayback()} layout={PlaybackLayout.Preview} />;
        }

        // only other UI is the recording-in-progress UI
        return (
            <div className="mx_VideoMessagePrimaryContainer mx_VideoRecordComposerTile_recording">
                <LiveRecordingPreview recorder={this.state.recorder} />
            </div>
        );
    }

    public render(): ReactNode {
        if (!this.state.recordingPhase) return null;

        let stopBtn;
        let deleteButton;
        if (this.state.recordingPhase === RecordingState.Started) {
            let tooltip = _t("composer|send_button_title");
            if (!!this.state.recorder) {
                tooltip = _t("composer|stop_voice_message");
            }

            stopBtn = (
                <AccessibleButton
                    className="mx_VideoRecordComposerTile_stop"
                    onClick={this.onRecordStartEndClick}
                    title={tooltip}
                />
            );
            if (this.state.recorder && !this.state.recorder?.isRecording) {
                stopBtn = null;
            }
        }

        if (this.state.recorder && this.state.recordingPhase !== RecordingState.Uploading) {
            deleteButton = (
                <AccessibleButton
                    className="mx_VideoRecordComposerTile_delete"
                    title={_t("action|delete")}
                    onClick={this.onCancel}
                />
            );
        }

        let uploadIndicator;
        let uploadButton;
        if (this.state.recordingPhase === RecordingState.Uploading) {
            uploadIndicator = (
                <span className="mx_VideoRecordComposerTile_uploadingState">
                    <InlineSpinner w={16} h={16} />
                </span>
            );
        } else if (this.state.didUploadFail && this.state.recordingPhase === RecordingState.Ended) {
            uploadIndicator = (
                <span className="mx_VideoRecordComposerTile_failedState">
                    <span className="mx_VideoRecordComposerTile_uploadState_badge">
                        {/* Need to stick the badge in a span to ensure it doesn't create a block component */}
                        <NotificationBadge
                            notification={StaticNotificationState.forSymbol("!", NotificationLevel.Highlight)}
                        />
                    </span>
                    <span className="text-warning">{_t("timeline|send_state_failed")}</span>
                </span>
            );
        } else if (this.state.recordingPhase === RecordingState.Ended) {
            uploadButton = (
                <AccessibleButton
                    className="mx_VideoRecordComposerTile_upload"
                    title={_t("composer|send_button_title")}
                    onClick={this.send.bind(this)}
                />
            );
        }

        return (
            <div className="mv_VideoRecordContainer">
                {this.renderPreview()}
                <div className="mx__VideoRecordComposerControls">
                    {uploadIndicator}
                    {deleteButton}
                    {uploadButton}
                    {stopBtn}
                </div>
            </div>
        );
    }
}
