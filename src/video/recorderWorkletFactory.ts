/* eslint-disable matrix-org/require-copyright-header */
import mxRecorderWorkletPath from "./RecorderWorklet";

export default function recorderWorkletFactory(context: AudioContext): Promise<void> {
    // In future we should be using the built-in worklet support in Webpack 5 with the syntax
    // described in https://github.com/webpack/webpack.js.org/issues/6869:
    // addModule(/* webpackChunkName: "recorder.worklet" */ new URL("./RecorderWorklet.ts", import.meta.url));
    return context.audioWorklet.addModule(mxRecorderWorkletPath);
}
