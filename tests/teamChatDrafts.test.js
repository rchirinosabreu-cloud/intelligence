import test from "node:test";
import assert from "node:assert/strict";
import { prepareChatSend, changeChatDraft } from "../src/lib/teamChatDrafts.js";
test("chat placement is scoped to the signed-in user and validates restored state", async () => {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const { readChatUi, writeChatUi } = await import(
    "../src/lib/teamChatDrafts.js"
  );
  writeChatUi("a", {
    open: true,
    mode: "docked",
    channelId: "general",
    position: { x: 20, y: 90 },
  });
  assert.equal(readChatUi("a").mode, "docked");
  assert.equal(readChatUi("b").open, false);
  assert.equal(readChatUi("a").muted, false, "Sound is on until it is muted");
  writeChatUi("a", { mode: "docked", muted: true });
  assert.equal(readChatUi("a").muted, true, "Muting survives a reload");
  assert.equal(readChatUi("b").muted, false, "Muting is scoped to the user");
  writeChatUi("a", { mode: "invalid" });
  assert.equal(readChatUi("a").mode, "floating");
  delete globalThis.sessionStorage;
});
test("an uncertain send keeps its exact request until acknowledged", () => {
  const draft = {
    content: "Hola",
    files: [{ localId: "f", upload: { id: "upload" } }],
    reply: { id: "original" },
  };
  const first = prepareChatSend(draft, "request");
  assert.equal(prepareChatSend(first, "other").pending.requestId, "request");
  assert.deepEqual(first.pending.attachmentIds, ["upload"]);
  assert.throws(() => changeChatDraft(first, { content: "Otro" }), /pendiente/);
  assert.equal(changeChatDraft(draft, { content: "Otro" }).content, "Otro");
});
