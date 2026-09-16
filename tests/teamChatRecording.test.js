import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const url = new URL("../src/lib/teamChatRecording.js", import.meta.url);
const api = async () => {
  assert.ok(fs.existsSync(url), "Voice capture lifecycle must be implemented");
  return import(url.href);
};
class Recorder {
  static isTypeSupported(type) {
    return type === "audio/mp4";
  }
  constructor(stream, options) {
    this.mimeType = options.mimeType;
    this.state = "inactive";
  }
  start() {
    this.state = "recording";
  }
  pause() {
    this.state = "paused";
  }
  resume() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["voice"], { type: this.mimeType }),
    });
    this.onstop?.();
  }
}
test("voice capture negotiates format, pauses, previews a file and always releases the microphone", async () => {
  const { startChatRecording } = await api();
  let stops = 0;
  const files = [];
  const session = await startChatRecording({
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop: () => stops++ }],
      }),
    },
    MediaRecorderCtor: Recorder,
    onFile: (f) => files.push(f),
  });
  session.pause();
  session.resume();
  session.stop();
  assert.equal(stops, 1);
  assert.equal(files.length, 1);
  assert.equal(files[0].type, "audio/mp4");
  assert.match(files[0].name, /\.m4a$/);
});
test("cancel releases the microphone and never sends or retains recorded audio", async () => {
  const { startChatRecording } = await api();
  let stops = 0;
  const files = [];
  const session = await startChatRecording({
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop: () => stops++ }],
      }),
    },
    MediaRecorderCtor: Recorder,
    onFile: (f) => files.push(f),
  });
  session.cancel();
  assert.equal(stops, 1);
  assert.equal(files.length, 0);
});
