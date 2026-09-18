import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_CUE_CLOSED,
  CHAT_CUE_OPEN,
  chatCueForIncoming,
  createChatCuePlayer,
} from "../src/lib/teamChatSound.js";

const other = { id: "m1", channelId: "general", author: { id: "luis" } };
const mine = { id: "m2", channelId: "general", author: { id: "ana" } };
const base = { userId: "ana", panelOpen: false, muted: false, hydrating: false };

test("an arriving message from someone else cues the closed panel", () => {
  assert.equal(chatCueForIncoming({ ...base, messages: [other] }), CHAT_CUE_CLOSED);
});

test("the open panel uses its own quieter cue", () => {
  assert.equal(
    chatCueForIncoming({ ...base, panelOpen: true, messages: [other] }),
    CHAT_CUE_OPEN,
  );
});

test("your own message never rings, even alongside someone else's", () => {
  assert.equal(chatCueForIncoming({ ...base, messages: [mine] }), null);
  assert.equal(
    chatCueForIncoming({ ...base, messages: [mine, other] }),
    CHAT_CUE_CLOSED,
    "A batch that also carries someone else's message still rings once",
  );
});

test("muting silences the cue without touching anything else", () => {
  assert.equal(chatCueForIncoming({ ...base, muted: true, messages: [other] }), null);
  assert.equal(
    chatCueForIncoming({ ...base, muted: true, panelOpen: true, messages: [other] }),
    null,
  );
});

test("restoring history on connect is not an arrival", () => {
  assert.equal(chatCueForIncoming({ ...base, hydrating: true, messages: [other] }), null);
});

test("a channel the person already silenced never rings", () => {
  const noisy = { id: "m3", channelId: "ruido", author: { id: "luis" } };
  const mutedChannels = new Set(["ruido"]);

  assert.equal(chatCueForIncoming({ ...base, mutedChannels, messages: [noisy] }), null);
  assert.equal(
    chatCueForIncoming({ ...base, mutedChannels, messages: [noisy, other] }),
    CHAT_CUE_CLOSED,
    "A batch that also reaches an unmuted channel still rings",
  );
});

test("an empty or malformed batch stays silent", () => {
  assert.equal(chatCueForIncoming({ ...base, messages: [] }), null);
  assert.equal(chatCueForIncoming({ ...base, messages: undefined }), null);
  assert.equal(chatCueForIncoming({ ...base, messages: [null, {}, { author: {} }] }), null);
});

test("the closed cue is audible and the open cue is quieter and shorter", () => {
  const played = [];
  const player = createChatCuePlayer(() => audioContextDouble(played));

  player(CHAT_CUE_CLOSED);
  player(CHAT_CUE_OPEN);

  const [closed, open] = played;
  assert.ok(open.peakGain < closed.peakGain, "The open panel is more discreet");
  assert.ok(open.duration < closed.duration, "The open panel cue is shorter");
  assert.ok(closed.peakGain <= 0.08, "Even the closed cue stays subtle");
  assert.ok(closed.stopped && open.stopped, "Every cue releases its oscillator");
});

test("a browser without usable audio never breaks the chat", () => {
  assert.doesNotThrow(() => createChatCuePlayer(() => null)(CHAT_CUE_CLOSED));
  assert.doesNotThrow(() =>
    createChatCuePlayer(() => {
      throw new Error("blocked by autoplay policy");
    })(CHAT_CUE_CLOSED),
  );
  assert.doesNotThrow(() => createChatCuePlayer(() => audioContextDouble([]))("unknown-cue"));
});

// One AudioContext serves the whole tab, so each cue is recorded from the
// oscillator/gain pair it builds rather than from the context itself.
function audioContextDouble(played) {
  let current = null;
  return {
    currentTime: 0,
    state: "running",
    resume() {},
    destination: {},
    createOscillator: () => {
      current = { peakGain: 0, duration: 0, stopped: false };
      played.push(current);
      const record = current;
      return {
        type: "sine",
        frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop(at) {
          record.duration = at;
          record.stopped = true;
        },
      };
    },
    createGain: () => {
      const record = current;
      return {
        gain: {
          setValueAtTime(value) {
            record.peakGain = Math.max(record.peakGain, value);
          },
          linearRampToValueAtTime(value) {
            record.peakGain = Math.max(record.peakGain, value);
          },
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
    },
  };
}
