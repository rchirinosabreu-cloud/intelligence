import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createChatSandbox } from "./helpers/teamChatSandbox.js";

test(
  "durable mentions, cleanup and reconnect use committed database state",
  { skip: !process.env.TEST_DATABASE_URL, timeout: 20000 },
  async (t) => {
    const s = await createChatSandbox();
    t.after(() => s.close());
    const [a, b] = s.actors;
    const input = {
      requestId: randomUUID(),
      content:
        '<p><span data-type="mention" data-id="member-demo-luis" data-label="Luis">@Luis</span> revisión</p>',
    };
    const m = await s.runtime.service.sendMessage(a, "general", input);
    await s.runtime.service.sendMessage(a, "general", input);
    assert.equal(
      (
        await s.pool.query(
          'SELECT * FROM "Notification" WHERE "relatedId"=$1',
          [m.id],
        )
      ).rowCount,
      1,
    );
    assert.equal(
      (await s.pool.query('SELECT * FROM "TeamChatPushDelivery"')).rowCount,
      1,
    );
    const cursor = (await s.runtime.service.snapshot(b)).cursor;
    const changed = await s.runtime.service.editMessage(a, m.id, {
      requestId: randomUUID(),
      version: m.version,
      content: "<p>Corregido mientras la otra sesión estaba desconectada</p>",
    });
    const reconnect = await s.runtime.service.sync(b, cursor);
    assert.equal(
      reconnect.events.find((e) => e.message?.id === m.id).message.content,
      changed.content,
    );
    const makeUpload = () =>
      s.runtime.service.registerUpload(a, "general", {
        requestId: randomUUID(),
        fingerprint: randomUUID(),
        storageKey: randomUUID(),
        name: "prueba.txt",
        size: 4,
        mimeType: "text/plain",
      });
    const abandoned = await makeUpload(),
      attached = await makeUpload();
    s.objects.set(abandoned.attachment.storageKey, Buffer.from("test"));
    s.objects.set(attached.attachment.storageKey, Buffer.from("test"));
    await s.runtime.service.sendMessage(a, "general", {
      requestId: randomUUID(),
      attachmentIds: [attached.attachment.id],
    });
    await s.pool.query(
      'UPDATE "TeamChatUpload" SET "createdAt"=now()-interval \'25 hours\'',
    );
    await s.runtime.maintenance();
    assert.equal(s.objects.has(abandoned.attachment.storageKey), false);
    assert.equal(s.objects.has(attached.attachment.storageKey), true);
    await s.pool.query('UPDATE "User" SET "sessionVersion"=1 WHERE id=$1', [
      b.id,
    ]);
    await assert.rejects(
      s.runtime.service.sync(b, cursor),
      (e) => e.statusCode === 401,
    );
  },
);
