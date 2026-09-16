import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const url = new URL("../src/services/teamChatMedia.js", import.meta.url);
const api = async () => {
  assert.ok(fs.existsSync(url), "Private chat media support is required");
  return import(url.href);
};
test("inline media uses verified bytes, not a claimed MIME type", async () => {
  const { detectChatMime } = await api();
  assert.equal(
    detectChatMime(Buffer.from("<script>bad()</script>"), "image/png"),
    "application/octet-stream",
  );
  assert.equal(
    detectChatMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"),
    "image/png",
  );
  assert.equal(
    detectChatMime(Buffer.from("%PDF-1.7"), "application/pdf"),
    "application/pdf",
  );
});
test("ranges include suffix/open-end requests and reject malformed or excessive bounds", async () => {
  const { parseChatRange } = await api();
  assert.deepEqual(parseChatRange("bytes=5-", 10), { start: 5, end: 9 });
  assert.deepEqual(parseChatRange("bytes=-3", 10), { start: 7, end: 9 });
  assert.throws(
    () => parseChatRange("bytes=10-20", 10),
    (e) => e.statusCode === 416,
  );
  assert.throws(
    () => parseChatRange("bytes=1-2,4-5", 10),
    (e) => e.statusCode === 416,
  );
});
