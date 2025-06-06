/* eslint-disable matrix-org/require-copyright-header */
import { type Optional } from "matrix-events-sdk";
import { type Room, type IEventRelation, RelationType } from "matrix-js-sdk/src/matrix";

import { AsyncStoreWithClient } from "./AsyncStoreWithClient";
import defaultDispatcher from "../dispatcher/dispatcher";
import { type ActionPayload } from "../dispatcher/payloads";
import { createVideoMessageRecording, type VideoMessageRecording } from "../video/VideoMessageRecording";

const SEPARATOR = "|";

interface IState {
    [videoRecordingId: string]: Optional<VideoMessageRecording>;
}

export class VideoRecordingStore extends AsyncStoreWithClient<IState> {
    private static internalInstance: VideoRecordingStore;

    public constructor() {
        super(defaultDispatcher, {});
    }

    public static get instance(): VideoRecordingStore {
        if (!this.internalInstance) {
            this.internalInstance = new VideoRecordingStore();
            this.internalInstance.start();
        }
        return this.internalInstance;
    }

    protected async onAction(payload: ActionPayload): Promise<void> {
        // Nothing to do, but we're required to override the function
        return;
    }

    public static getVideoRecordingId(room: Room, relation?: IEventRelation): string {
        if (relation?.rel_type === "io.element.thread" || relation?.rel_type === RelationType.Thread) {
            return room.roomId + SEPARATOR + relation.event_id;
        } else {
            return room.roomId;
        }
    }

    /**
     * Gets the active recording instance, if any.
     * @param {string} videoRecordingId The room ID (with optionally the thread ID if in one) to get the recording in.
     * @returns {Optional<VideoRecording>} The recording, if any.
     */
    public getActiveRecording(videoRecordingId: string): Optional<VideoMessageRecording> {
        return this.state[videoRecordingId];
    }

    /**
     * Starts a new recording if one isn't already in progress. Note that this simply
     * creates a recording instance - whether or not recording is actively in progress
     * can be seen via the VideoRecording class.
     * @param {string} videoRecordingId The room ID (with optionally the thread ID if in one) to start recording in.
     * @returns {VideoRecording} The recording.
     */
    public startRecording(videoRecordingId?: string): VideoMessageRecording {
        if (!this.matrixClient) throw new Error("Cannot start a recording without a MatrixClient");
        if (!videoRecordingId) throw new Error("Recording must be associated with a room");
        if (this.state[videoRecordingId]) throw new Error("A recording is already in progress");

        const recording = createVideoMessageRecording(this.matrixClient);

        // noinspection JSIgnoredPromiseFromCall - we can safely run this async
        this.updateState({ ...this.state, [videoRecordingId]: recording });

        return recording;
    }

    /**
     * Disposes of the current recording, no matter the state of it.
     * @param {string} videoRecordingId The room ID (with optionally the thread ID if in one) to dispose of the recording in.
     * @returns {Promise<void>} Resolves when complete.
     */
    public disposeRecording(videoRecordingId: string): Promise<void> {
        this.state[videoRecordingId]?.destroy(); // stops internally

        const {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            [videoRecordingId]: _toDelete,
            ...newState
        } = this.state;
        // unexpectedly AsyncStore.updateState merges state
        // AsyncStore.reset actually just *sets*
        return this.reset(newState);
    }
}

window.mxVideoRecordingStore = VideoRecordingStore.instance;
