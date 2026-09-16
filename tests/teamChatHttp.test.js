import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { createChatEventParser } from "../src/lib/teamChatState.js";
import { createChatSandbox } from "./helpers/teamChatSandbox.js";

test(
  "HTTP + PostgreSQL: two sessions receive committed messages, protected upload bytes and deletion",
  { skip: !process.env.TEST_DATABASE_URL, timeout: 20000 },
  async (t) => {
    const sandbox = await createChatSandbox();
    const server = await new Promise((resolve) => {
      const s = sandbox.app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const abort = new AbortController();
    t.after(async () => {
      abort.abort();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await sandbox.close();
    });
    const api = async (path, body, method = "POST", actor = "demo-ana") => {
      const r = await fetch(base + "/api/team-chat" + path, {
        method,
        headers: {
          Authorization: `Bearer ${actor}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json() };
    };
    const response = await fetch(base + "/api/team-chat/events", {
      headers: { Authorization: "Bearer demo-luis" },
      signal: abort.signal,
    });
    assert.equal(response.status, 200);
    let eventResolve;
    const gotMessage = new Promise((resolve) => {
      eventResolve = resolve;
    });
    const reader = response.body.getReader();
    const parse = createChatEventParser((e) => {
      const event = e.events?.find((x) =>
        x.message?.content.includes("HTTP verificado"),
      );
      if (event) eventResolve(event.message);
    });
    const reading = (async () => {
      const decoder = new TextDecoder();
      try {
        while (true) {
          const r = await reader.read();
          if (r.done) break;
          parse(decoder.decode(r.value, { stream: true }));
        }
      } catch (e) {
        if (!abort.signal.aborted) throw e;
      }
    })();
    const form = new FormData();
    const bytes = "%PDF-1.7 test";
    form.append("requestId", randomUUID());
    form.append(
      "file",
      new Blob([bytes], { type: "application/pdf" }),
      "archivo.pdf",
    );
    const uploaded = await fetch(
      base + "/api/team-chat/channels/general/uploads",
      {
        method: "POST",
        headers: { Authorization: "Bearer demo-ana" },
        body: form,
      },
    );
    assert.equal(uploaded.status, 201);
    const file = await uploaded.json();
    const payload = {
      requestId: randomUUID(),
      content: "<p>HTTP verificado</p>",
      attachmentIds: [file.id],
    };
    const sent = await api("/channels/general/messages", payload);
    assert.equal(sent.status, 200);
    const observed = await gotMessage;
    assert.equal(observed.id, sent.data.id);
    assert.equal(
      (await api("/channels/general/messages", payload)).data.id,
      sent.data.id,
    );
    const access = await api(
      `/messages/${sent.data.id}/attachments/${file.id}/access`,
      undefined,
      "POST",
      "demo-luis",
    );
    assert.equal(access.status, 200);
    const ticket = new URL(access.data.url, base).searchParams.get(
      "access_token",
    );
    assert.throws(
      () => jwt.verify(ticket, process.env.JWT_SECRET),
      /signature/,
      "Media tickets must never authenticate as platform sessions",
    );
    const downloaded = await fetch(base + access.data.url);
    assert.equal(await downloaded.text(), bytes);
    const ranged = await fetch(base + access.data.url, {
      headers: { Range: "bytes=0-3" },
    });
    assert.equal(ranged.status, 206);
    assert.equal(await ranged.text(), "%PDF");
    assert.equal(
      (await fetch(base + access.data.url.replace(file.id, "wrong-id"))).status,
      403,
    );
    assert.equal(
      (
        await api(
          `/messages/${sent.data.id}`,
          { requestId: randomUUID(), version: 1 },
          "DELETE",
          "demo-luis",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await api(
          `/messages/${sent.data.id}`,
          { requestId: randomUUID(), version: 1 },
          "DELETE",
        )
      ).status,
      200,
    );
    assert.equal((await fetch(base + access.data.url)).status, 404);
    abort.abort();
    await reading;
  },
);
