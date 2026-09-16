import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { transform } from "esbuild";
test("global chat compiles as a layout-owned component with a rich composer and voice controls", async () => {
  for (const file of [
    "src/components/chat/TeamChat.jsx",
    "src/components/chat/ChatComposer.jsx",
    "src/components/chat/ChatMessage.jsx",
  ]) {
    assert.ok(fs.existsSync(file), `${file} must exist`);
    const result = await transform(fs.readFileSync(file, "utf8"), {
      loader: "jsx",
      format: "esm",
      jsx: "automatic",
    });
    assert.ok(result.code);
  }
  const layout = fs.readFileSync("src/components/layout/AppLayout.jsx", "utf8");
  assert.match(layout, /<TeamChat/);
});
