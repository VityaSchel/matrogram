/* eslint-disable matrix-org/require-copyright-header */
import { MsgType } from "matrix-js-sdk/src/matrix";
import { type EncryptedFile, type RoomMessageEventContent } from "matrix-js-sdk/src/types";

/**
 * @param {string} mxc MXC URL of the file
 * @param {string} mimetype
 * @param {number} duration Duration in milliseconds
 * @param {number} size
 * @param {EncryptedFile} [file] Encrypted file
 */
export const createVideoMessageContent = (
    mxc: string | undefined,
    mimetype: string,
    duration: number,
    size: number,
    file?: EncryptedFile,
): RoomMessageEventContent => {
    return {
        "body": "Video message",
        "msgtype": MsgType.Video,
        "url": mxc,
        "file": file,
        "info": {
            duration,
            mimetype,
            size,
        },
    };
};
