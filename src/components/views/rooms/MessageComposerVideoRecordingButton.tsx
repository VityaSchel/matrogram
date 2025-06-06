/* eslint-disable matrix-org/require-copyright-header */
import React from "react";

import { _t } from "../../../languageHandler";
import { CollapsibleButton } from "./CollapsibleButton";

export function MessageComposerVideoRecordingButton(props: {
    onClick: () => void;
    narrow: boolean;
}): React.JSX.Element | null {
    return props.narrow ? null : (
        <CollapsibleButton
            key="message_send"
            className="mx_MessageComposer_button"
            iconClassName="mx_MessageComposer_videoMessage"
            onClick={props.onClick}
            title={_t("composer|send_button_title")}
        />
    );
}
