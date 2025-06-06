/* eslint-disable matrix-org/require-copyright-header */
import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { type EncryptedFile } from "matrix-js-sdk/src/types";
import { type SimpleObservable } from "matrix-widget-api";

import { uploadFile } from "../ContentMessages";
import { type IDestroyable } from "../utils/IDestroyable";
import { Singleflight } from "../utils/Singleflight";
import { Playback } from "./Playback";
import { type IRecordingUpdate, RecordingState, VideoRecording } from "./VideoRecording";

export interface IUpload {
    mxc?: string; // for unencrypted uploads
    encrypted?: EncryptedFile;
}

/**
 * This class can be used to record a single video message.
 */
export class VideoMessageRecording implements IDestroyable {
    private lastUpload?: IUpload;
    private blobs = new Array<Blob>();
    private playback?: Playback;
    private size = 0;

    public constructor(
        private matrixClient: MatrixClient,
        private videoRecording: VideoRecording,
    ) {
        this.videoRecording.onDataAvailable = this.onDataAvailable;
    }

    public async start(): Promise<void> {
        if (this.lastUpload || this.hasRecording) {
            throw new Error("Recording already prepared");
        }

        return this.videoRecording.start();
    }

    public async stop(): Promise<Blob[]> {
        await this.videoRecording.stop();
        return this.blobs;
    }

    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        this.videoRecording.on(event, listener);
        return this;
    }

    public off(event: string | symbol, listener: (...args: any[]) => void): this {
        this.videoRecording.off(event, listener);
        return this;
    }

    public emit(event: string, ...args: any[]): boolean {
        return this.videoRecording.emit(event, ...args);
    }

    public get hasRecording(): boolean {
        return this.blobs.length > 0;
    }

    public get isRecording(): boolean {
        return this.videoRecording.isRecording;
    }

    /**
     * Gets a playback instance for this video recording. Note that the playback will not
     * have been prepared fully, meaning the `prepare()` function needs to be called on it.
     *
     * The same playback instance is returned each time.
     *
     * @returns {Playback} The playback instance.
     */
    public getPlayback(): Playback {
        this.playback = Singleflight.for(this, "playback").do(() => {
            return new Playback(this.size); // cast to ArrayBuffer proper;
        });
        return this.playback;
    }

    public async upload(inRoomId: string): Promise<IUpload> {
        if (!this.hasRecording) {
            throw new Error("No recording available to upload");
        }

        if (this.lastUpload) return this.lastUpload;

        try {
            this.emit(RecordingState.Uploading);
            const { url: mxc, file: encrypted } = await uploadFile(
                this.matrixClient,
                inRoomId,
                new Blob(this.blobs, {
                    type: this.contentType,
                }),
            );
            this.lastUpload = { mxc, encrypted };
            this.emit(RecordingState.Uploaded);
        } catch (e) {
            this.emit(RecordingState.Ended);
            throw e;
        }
        return this.lastUpload;
    }

    public get durationSeconds(): number {
        return this.videoRecording.durationSeconds;
    }

    public get contentType(): string {
        return this.videoRecording.contentType;
    }

    public get contentLength(): number {
        return this.blobs.reduce((acc, blob) => acc + blob.size, 0);
    }

    public get liveData(): SimpleObservable<IRecordingUpdate> {
        return this.videoRecording.liveData;
    }

    public get isSupported(): boolean {
        return this.videoRecording.isSupported;
    }

    public destroy(): void {
        this.playback?.destroy();
        this.videoRecording.destroy();
        this.blobs = [];
        this.size = 0;
    }

    private onDataAvailable = (data: Blob): void => {
        this.blobs.push(data);
        this.size += data.size;
    };
}

export const createVideoMessageRecording = (matrixClient: MatrixClient): VideoMessageRecording => {
    return new VideoMessageRecording(matrixClient, new VideoRecording());
};
