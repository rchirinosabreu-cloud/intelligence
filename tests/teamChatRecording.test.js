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

test("finishing waits for all recorded bytes and the draft before returning the audio to send", async () => {
  const { startChatRecording } = await api();
  let saved = false;
  const session = await startChatRecording({
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    MediaRecorderCtor: Recorder,
    onFile: async () => { await new Promise(resolve => setTimeout(resolve,10)); saved=true; },
  });
  const result = await session.stop();
  assert.ok(result instanceof File, "Stop returns the final audio, not an unfinished chunk");
  assert.equal(saved,true);
  assert.equal(session.state,"inactive");
  assert.equal(await result.text(),"voice");
  assert.equal(await session.stop(),result,"Repeated finish calls reuse the same recording");
});

test("empty recordings report an error instead of creating an unplayable message", async () => {
  const { startChatRecording } = await api();
  class EmptyRecorder extends Recorder { stop(){this.state='inactive';this.onstop?.();} }
  let error;let files=0;
  const session=await startChatRecording({mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})},MediaRecorderCtor:EmptyRecorder,onFile:()=>files++,onError:e=>error=e});
  assert.equal(await session.stop(),null);
  assert.match(error?.message || '',/vacía|audio|grabación/);
  assert.equal(files,0);
});

test("keeps Opus recording when supported and uses MP4 only as a fallback", async () => {
  const { startChatRecording } = await api();
  class BothRecorder extends Recorder { static isTypeSupported(type){return /audio\/(webm|mp4)/.test(type);} }
  const session = await startChatRecording({mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})},MediaRecorderCtor:BothRecorder});
  const file=await session.stop();
  assert.equal(file.type,'audio/webm');
  assert.match(file.name,/\.webm$/);
});
