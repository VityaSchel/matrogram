/* eslint-disable matrix-org/require-copyright-header */
import React, { createRef } from "react";

import { MarkedExecution } from "../../../utils/MarkedExecution";
import { type VideoMessageRecording } from "../../../video/VideoMessageRecording";

interface IProps {
    recorder: VideoMessageRecording;
}

/**
 * A live video message preview
 */
export default class LiveRecordingPreview extends React.PureComponent<IProps> {
    private videoRef = createRef<HTMLVideoElement>();

    public static defaultProps = {
        progress: 1,
    };

    private scheduledUpdate: MarkedExecution = new MarkedExecution(
        () => {},
        () => requestAnimationFrame(() => this.scheduledUpdate.trigger()),
    );

    public constructor(props: IProps) {
        super(props);
        this.state = {};
    }

    public componentDidMount(): void {
        if (this.videoRef.current) {
            if (this.props.recorder.stream) {
                this.videoRef.current.srcObject = this.props.recorder.stream;
                this.videoRef.current.play();
            } else {
                console.warn("No stream available for LiveRecordingPreview");
            }
        } else {
            console.warn("Video element not available in LiveRecordingPreview");
        }
    }

    public render(): React.ReactNode {
        return (
            <div className="mx_LiveRecordingPreview">
                <video ref={this.videoRef} />
            </div>
        );
    }
}
