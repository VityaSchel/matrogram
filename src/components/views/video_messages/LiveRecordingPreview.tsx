/* eslint-disable matrix-org/require-copyright-header */
import React from "react";

import { MarkedExecution } from "../../../utils/MarkedExecution";
import { type VideoMessageRecording } from "../../../video/VideoMessageRecording";
import { type IRecordingUpdate } from "../../../video/VideoRecording";

interface IProps {
    recorder: VideoMessageRecording;
}

/**
 * A live video message preview
 */
export default class LiveRecordingPreview extends React.PureComponent<IProps> {
    public static defaultProps = {
        progress: 1,
    };

    private scheduledUpdate: MarkedExecution = new MarkedExecution(
        () => {},
        () => requestAnimationFrame(() => this.scheduledUpdate.trigger()),
    );

    public constructor(props: IProps) {
        super(props);
    }

    public componentDidMount(): void {
        this.props.recorder.liveData.onUpdate((update: IRecordingUpdate) => {
            this.scheduledUpdate.mark();
        });
    }

    public render(): React.ReactNode {
        return (
            <div className="mx_LiveRecordingPreview">
                <video />
            </div>
        );
    }
}
