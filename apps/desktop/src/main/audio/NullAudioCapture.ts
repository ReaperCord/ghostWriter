import { AudioCapture } from "./AudioCapture";

export class NullAudioCapture implements AudioCapture {
  start() {
    console.log("[AudioCapture] START (noop)");
  }

  stop() {
    console.log("[AudioCapture] STOP (noop)");
  }
}
