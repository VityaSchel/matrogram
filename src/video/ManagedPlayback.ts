/*
Copyright 2024 New Vector Ltd.
Copyright 2021 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { Playback } from "./Playback";
import { type PlaybackManager } from "./PlaybackManager";

/**
 * A managed playback is a Playback instance that is guided by a PlaybackManager.
 */
export class ManagedPlayback extends Playback {
    public constructor(
        private manager: PlaybackManager,
        buf: ArrayBuffer
    ) {
        super(buf.byteLength);
    }

    public async play(): Promise<void> {
        this.manager.pauseAllExcept(this);
        return super.play();
    }

    public destroy(): void {
        this.manager.destroyPlaybackInstance(this);
        super.destroy();
    }
}
