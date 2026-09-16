import test from "node:test";
test("docking is offered only during a drag within 24px of the right edge", async () => {
  const { isChatDockTarget } = await api();
  assert.equal(typeof isChatDockTarget, "function");
  for (const x of [0, 16, 640, 1170, 1200, 1255])
    assert.equal(isChatDockTarget({ x, width: 1280, moved: true }), false);
  assert.equal(isChatDockTarget({ x: 1260, width: 1280, moved: true }), true);
  assert.equal(isChatDockTarget({ x: 1279, width: 1280, moved: false }), false);
  assert.equal(isChatDockTarget({ x: 389, width: 390, moved: true }), false);
});
test("deleting a message also removes its quoted preview from loaded replies", async () => {
  const { mergeChatMessages } = await api();
  const parent = {
    id: "p",
    version: 1,
    createdAt: "2026-01-01",
    text: "Contenido anterior",
  };
  const reply = {
    id: "r",
    version: 1,
    createdAt: "2026-01-02",
    reply: { id: "p", text: "Contenido anterior" },
  };
  const merged = mergeChatMessages(
    [parent, reply],
    [{ ...parent, version: 2, deletedAt: "2026-01-03", text: "" }],
  );
  assert.equal(
    merged.find((m) => m.id === "r").reply.text,
    "Mensaje eliminado",
  );
});
test("SSE accepts CRLF split between network chunks", async () => {
  const { createChatEventParser } = await api();
  const events = [];
  const parse = createChatEventParser((e) => events.push(e));
  parse('data: {"ok":true}\r');
  parse("\n\r");
  parse("\n");
  assert.deepEqual(events, [{ ok: true }]);
});
import assert from "node:assert/strict";
import fs from "node:fs";
const url = new URL("../src/lib/teamChatState.js", import.meta.url);
const api = async () => {
  assert.ok(fs.existsSync(url), "Chat state must exist");
  return import(url.href);
};
test("opening a bubble moved to the left keeps the complete panel in the viewport", async () => {
  const { chatFloatingRight } = await api();
  for (const width of [768, 1280, 1920])
    for (const x of [16, width / 2, width - 72]) {
      const right = chatFloatingRight(x, width),
        panelWidth = Math.min(420, width - 32);
      assert.ok(right >= 16 && width - right - panelWidth >= 16);
    }
});
test("HTTP response and realtime event produce one message and never overwrite a newer edit", async () => {
  const { mergeChatMessages } = await api();
  const old = { id: "a", version: 1, createdAt: "2026-01-01", content: "old" };
  const edited = { ...old, version: 2, content: "new" };
  assert.deepEqual(mergeChatMessages([edited], [old, edited]), [edited]);
});
test("a deletion tombstone replaces visible content and cannot be resurrected by an old page", async () => {
  const { mergeChatMessages } = await api();
  const deleted = {
    id: "a",
    version: 3,
    deletedAt: "2026-01-02",
    content: "",
    createdAt: "2026-01-01",
  };
  assert.equal(
    mergeChatMessages(
      [deleted],
      [{ ...deleted, version: 1, deletedAt: null, content: "private" }],
    )[0].content,
    "",
  );
});
test("dock reserves space only when both the workspace and chat fit", async () => {
  const { chatDockWidth, clampChatPosition } = await api();
  assert.equal(chatDockWidth({ open: true, mode: "docked", width: 1440 }), 360);
  assert.equal(chatDockWidth({ open: true, mode: "docked", width: 390 }), 0);
  assert.equal(chatDockWidth({ open: false, mode: "docked", width: 1440 }), 0);
  const p = clampChatPosition({ x: 2000, y: -20 }, 390, 740);
  assert.ok(p.x <= 318 && p.y >= 80);
});
test("stream parser handles split UTF-8 chunks and multiple events without dropping frames", async () => {
  const { createChatEventParser } = await api();
  const events = [];
  const parser = createChatEventParser((e) => events.push(e));
  parser('data: {"type":"cha');
  parser('nge","cursor":"1"}\n\ndata: {"type":"heartbeat"}\n\n');
  assert.equal(events.length, 2);
  assert.equal(events[0].cursor, "1");
});
