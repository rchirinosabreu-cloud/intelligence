import test from "node:test";
test("historical long content remains readable and pasted headings retain formatting", async () => {
  const { normalizeChatContent } = await api();
  assert.equal(
    normalizeChatContent("a".repeat(40001), "TEXT", { historical: true }).text
      .length,
    40001,
  );
  assert.match(
    normalizeChatContent("<h2>Título</h2><p><mark>Importante</mark></p>").html,
    /<h2>Título<\/h2>/,
  );
});
import assert from "node:assert/strict";
import fs from "node:fs";
const url = new URL("../src/services/teamChatContent.js", import.meta.url);
const api = async () => {
  assert.ok(
    fs.existsSync(url),
    "Chat content normalization must be implemented",
  );
  return import(url.href);
};
test("preserves pasted bold, italic, underline, paragraphs and safe links without active HTML", async () => {
  const { normalizeChatContent } = await api();
  const result = normalizeChatContent(
    '<p><strong>Hola</strong> <em>equipo</em> <u>hoy</u></p><a href="https://example.com/a" onclick="alert(1)">Revisar</a><script>bad()</script><img src=x onerror=bad()>',
    "HTML",
  );
  assert.match(result.html, /<strong>Hola<\/strong>/);
  assert.match(result.html, /<em>equipo<\/em>/);
  assert.match(result.html, /<u>hoy<\/u>/);
  assert.match(result.html, /href="https:\/\/example.com\/a"/);
  assert.doesNotMatch(result.html, /script|onclick|onerror|<img/);
  assert.match(result.text, /Hola equipo hoy/);
});
test("autolinks ordinary text without executing it or nesting links", async () => {
  const { normalizeChatContent } = await api();
  const r = normalizeChatContent(
    "Mira https://example.com/path. <script>x</script>",
    "TEXT",
  );
  assert.match(r.html, /href="https:\/\/example.com\/path"/);
  assert.match(r.html, /&lt;script&gt;/);
  const s = normalizeChatContent(
    '<p><a href="javascript:alert(1)">Malo</a> <a href="https://example.com">https://example.com</a></p>',
    "HTML",
  );
  assert.doesNotMatch(s.html, /javascript:/);
  assert.equal((s.html.match(/href=/g) || []).length, 1);
});
test("preserves valid mention identity and rejects excessive content rather than truncating", async () => {
  const { normalizeChatContent } = await api();
  assert.deepEqual(
    normalizeChatContent(
      '<span data-type="mention" data-id="member-1" data-label="Gema">@Gema</span>',
      "HTML",
    ).mentions,
    ["member-1"],
  );
  assert.throws(
    () => normalizeChatContent("x".repeat(40001), "TEXT"),
    /40.000|largo|extenso/,
  );
});
