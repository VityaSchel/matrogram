/*
Copyright 2024 New Vector Ltd.
Copyright 2021 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { SimpleObservable } from "matrix-widget-api";
import { type MatrixEvent } from "matrix-js-sdk/src/matrix";

import { type IDestroyable } from "../utils/IDestroyable";

export class PlaybackClock implements IDestroyable {
    private clipStart = 0;
    private stopped = true;
    private lastCheck = 0;
    private observable = new SimpleObservable<number[]>();
    private timerId?: number;
    private clipDuration = 0;
    private placeholderDuration = 0;

    public constructor(private context: HTMLMediaElement) {}

    public get durationSeconds(): number {
        return this.clipDuration || this.placeholderDuration;
    }

    public set durationSeconds(val: number) {
        this.clipDuration = val;
        this.observable.update([this.timeSeconds, this.clipDuration]);
    }

    public get timeSeconds(): number {
        return (this.context.currentTime - this.clipStart) % this.clipDuration;
    }

    public get liveData(): SimpleObservable<number[]> {
        return this.observable;
    }

    private checkTime = (force = false): void => {
        const now = this.timeSeconds; // calculated dynamically
        if (this.lastCheck !== now || force) {
            this.observable.update([now, this.durationSeconds]);
            this.lastCheck = now;
        }
    };

    public populatePlaceholdersFrom(event: MatrixEvent): void {
        const durationMs = Number(event.getContent()["info"]?.["duration"]);
        if (Number.isFinite(durationMs)) this.placeholderDuration = durationMs / 1000;
    }

    public flagLoadTime(): void {
        this.clipStart = this.context.currentTime;
    }

    public flagStart(): void {
        if (this.stopped) {
            this.clipStart = this.context.currentTime;
            this.stopped = false;
        }

        if (!this.timerId) {
            // 100ms interval to make sure the time is as accurate as possible without being overly insane
            this.timerId = window.setInterval(this.checkTime, 100);
        }
    }

    public flagStop(): void {
        this.stopped = true;

        // Reset the clock time now so that the update going out will trigger components
        // to check their seek/position information (alongside the clock).
        this.clipStart = this.context.currentTime;
    }

    public syncTo(contextTime: number, clipTime: number): void {
        this.clipStart = contextTime - clipTime;
        this.stopped = false; // count as a mid-stream pause (if we were stopped)
        this.checkTime(true);
    }

    public destroy(): void {
        this.observable.close();
        if (this.timerId) clearInterval(this.timerId);
    }
}
