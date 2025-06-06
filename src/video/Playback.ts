/* eslint-disable matrix-org/require-copyright-header */
import EventEmitter from "events";
import { type SimpleObservable } from "matrix-widget-api";

import { UPDATE_EVENT } from "../stores/AsyncStore";
import { type IDestroyable } from "../utils/IDestroyable";
import { clamp } from "../utils/numbers";
import { PlaybackClock } from "./PlaybackClock";

export enum PlaybackState {
    Decoding = "decoding",
    Stopped = "stopped", // no progress on timeline
    Paused = "paused", // some progress on timeline
    Playing = "playing", // active progress through timeline
}

export interface PlaybackInterface {
    readonly videoPlayer: HTMLVideoElement;
    readonly currentState: PlaybackState;
    readonly liveData: SimpleObservable<number[]>;
    readonly timeSeconds: number;
    readonly durationSeconds: number;
    skipTo(timeSeconds: number): Promise<void>;
}

export class Playback extends EventEmitter implements IDestroyable, PlaybackInterface {
    public readonly videoPlayer: HTMLVideoElement;
    private state = PlaybackState.Decoding;
    private readonly clock: PlaybackClock;
    private readonly fileSize: number;

    /**
     * Creates a new playback instance from a buffer.
     * @param {number} size The buffer size.
     * can be calculated. Contains values between zero and one, inclusive.
     */
    public constructor(
        size: number,
    ) {
        super();
        this.fileSize = size;
        this.videoPlayer = document.createElement("video");
        this.clock = new PlaybackClock(this.videoPlayer);
    }

    /**
     * Size of the video clip in bytes. May be zero if unknown. This is updated
     * when the playback goes through phase changes.
     */
    public get sizeBytes(): number {
        return this.fileSize;
    }

    public get clockInfo(): PlaybackClock {
        return this.clock;
    }

    public get liveData(): SimpleObservable<number[]> {
        return this.clock.liveData;
    }

    public get timeSeconds(): number {
        return this.clock.timeSeconds;
    }

    public get durationSeconds(): number {
        return this.clock.durationSeconds;
    }

    public get currentState(): PlaybackState {
        return this.state;
    }

    public get isPlaying(): boolean {
        return this.currentState === PlaybackState.Playing;
    }

    public emit(event: PlaybackState, ...args: any[]): boolean {
        this.state = event;
        super.emit(event, ...args);
        super.emit(UPDATE_EVENT, event, ...args);
        return true; // we don't ever care if the event had listeners, so just return "yes"
    }

    public destroy(): void {
        // Dev note: It's critical that we call stop() during cleanup to ensure that downstream callers
        // are aware of the final clock position before the user triggered an unload.
        // noinspection JSIgnoredPromiseFromCall - not concerned about being called async here
        this.stop();
        this.removeAllListeners();
        this.clock.destroy();
        // if (this.context) {
        //     URL.revokeObjectURL(this.context.src);
        //     this.context.remove();
        // }
    }

    public async prepare(): Promise<void> {
        if (this.state !== PlaybackState.Decoding) {
            return;
        }

        this.clock.flagLoadTime(); // must happen first because setting the duration fires a clock update
        this.clock.durationSeconds = this.videoPlayer?.duration;

        // Signal that we're not decoding anymore. This is done last to ensure the clock is updated for
        // when the downstream callers try to use it.
        this.emit(PlaybackState.Stopped); // signal that we're not decoding anymore
    }

    private onPlaybackEnd = async (): Promise<void> => {
        this.emit(PlaybackState.Stopped);
    };

    public async play(): Promise<void> {
        if (this.state === PlaybackState.Stopped) {
            await this.videoPlayer.play();
        }

        this.clock.flagStart();
        this.emit(PlaybackState.Playing);
    }

    public async pause(): Promise<void> {
        await this.videoPlayer.pause();
        this.emit(PlaybackState.Paused);
    }

    public async stop(): Promise<void> {
        await this.onPlaybackEnd();
        this.clock.flagStop();
    }

    public async toggle(): Promise<void> {
        if (this.isPlaying) await this.pause();
        else await this.play();
    }

    public async skipTo(timeSeconds: number): Promise<void> {
        timeSeconds = clamp(timeSeconds, 0, this.clock.durationSeconds);

        // Track playing state so we don't cause seeking to start playing the track.
        const isPlaying = this.isPlaying;

        if (isPlaying) {
            // Pause first so we can get an accurate measurement of time
            await this.videoPlayer.pause();
        }

        const now = this.videoPlayer.currentTime;

        this.clock.syncTo(now, timeSeconds);

        this.videoPlayer.currentTime = timeSeconds;
        if (isPlaying) {
            await this.videoPlayer.play();
        } else {
            await this.pause();
        }
    }
}
