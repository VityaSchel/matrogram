/* eslint-disable matrix-org/require-copyright-header */
import EventEmitter from "events";
import { logger } from "matrix-js-sdk/src/logger";
import { SimpleObservable } from "matrix-widget-api";

import MediaDeviceHandler from "../MediaDeviceHandler";
import { UPDATE_EVENT } from "../stores/AsyncStore";
import { type IDestroyable } from "../utils/IDestroyable";
import { Singleflight } from "../utils/Singleflight";

export interface IRecordingUpdate {
    noop: string
}

export enum RecordingState {
    Started = "started",
    EndingSoon = "ending_soon", // emits an object with a single numerical value: secondsLeft
    Ended = "ended",
    Uploading = "uploading",
    Uploaded = "uploaded",
}

export class VideoRecording extends EventEmitter implements IDestroyable {
    private recorderContext?: MediaRecorder;
    public recorderStream?: MediaStream;
    private recording = false;
    private startTime = -1;
    private observable?: SimpleObservable<IRecordingUpdate>;
    public onDataAvailable?: (data: Blob) => void;

    public get contentType(): string {
        return "video/mp4";
    }

    public get durationSeconds(): number {
        if (!this.recorderContext || this.startTime === -1) throw new Error("Duration not available without a recording");
        return Date.now() - this.startTime;
    }

    public get isRecording(): boolean {
        return this.recording;
    }

    public emit(event: string, ...args: any[]): boolean {
        super.emit(event, ...args);
        super.emit(UPDATE_EVENT, event, ...args);
        return true; // we don't ever care if the event had listeners, so just return "yes"
    }

    private async makeRecorder(): Promise<void> {
        try {
            this.recorderStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: MediaDeviceHandler.getVideoInput(),
                },
                audio: {
                    deviceId: MediaDeviceHandler.getAudioInput(),
                },
            });
            this.recorderContext = new MediaRecorder(this.recorderStream);

            this.recorderContext.ondataavailable = (ev: BlobEvent) => this.onDataAvailable?.(ev.data);
        } catch (e) {
            logger.error("Error starting recording: ", e);
            if (e instanceof DOMException) {
                // Unhelpful DOMExceptions are common - parse them sanely
                logger.error(`${e.name} (${e.code}): ${e.message}`);
            }

            // Clean up as best as possible
            if (this.recorderStream) this.recorderStream.getTracks().forEach((t) => t.stop());
            if (this.recorderContext) this.recorderContext.stop();

            throw e; // rethrow so upstream can handle it
        }
    }

    public get isSupported(): boolean {
        return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    public async start(): Promise<void> {
        if (this.recording) {
            throw new Error("Recording already in progress");
        }
        if (this.observable) {
            this.observable.close();
        }
        this.observable = new SimpleObservable<IRecordingUpdate>();
        await this.makeRecorder();
        this.recorderContext?.start(100);
        this.recording = true;
        this.startTime = Date.now();
        this.emit(RecordingState.Started);
    }

    public async stop(): Promise<void> {
        return Singleflight.for(this, "stop").do(async (): Promise<void> => {
            if (!this.recording) {
                throw new Error("No recording to stop");
            }

            this.recorderContext?.stop();
            if (this.recorderContext) this.recorderContext.ondataavailable = null;

            // Now stop all the media tracks so we can release them back to the user/OS
            this.recorderStream!.getTracks().forEach((t) => t.stop());

            // Finally do our post-processing and clean up
            this.recording = false;
            this.emit(RecordingState.Ended);
        });
    }

    public destroy(): void {
        // noinspection JSIgnoredPromiseFromCall - not concerned about stop() being called async here
        this.stop();
        this.removeAllListeners();
        this.onDataAvailable = undefined;
        Singleflight.forgetAllFor(this);
        // noinspection JSIgnoredPromiseFromCall - not concerned about being called async here
        this.observable?.close();
        this.startTime = -1;
    }
}
