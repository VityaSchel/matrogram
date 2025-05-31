/* eslint-disable matrix-org/require-copyright-header */
import React from "react";

import { CollapsibleButton } from "./CollapsibleButton";
import { _t } from "../../../languageHandler";

export function MessageComposerVoiceRecordingButton(
    props: { onClick: () => void, narrow: boolean },
): React.JSX.Element | null {
    // XXX: recording UI does not work well in narrow mode, so hide for now
    return props.narrow ? null : (
        <CollapsibleButton
            key="voice_message_send"
            className="mx_MessageComposer_button"
            iconClassName="mx_MessageComposer_voiceMessage"
            onClick={props.onClick}
            title={_t("composer|voice_message_button")}
        />
    );
}
