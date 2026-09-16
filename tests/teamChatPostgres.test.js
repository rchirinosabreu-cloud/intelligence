import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
const schemaUrl = new URL(
  "../scripts/ensure-team-chat-schema.js",
  import.meta.url,
);
const serviceUrl = new URL(
  "../src/services/teamChatService.js",
  import.meta.url,
);
test("team chat has an additive schema and a transaction-backed service", () => {
  assert.ok(fs.existsSync(schemaUrl), "Additive team chat schema is required");
  assert.ok(
    fs.existsSync(serviceUrl),
    "Transaction-backed team chat service is required",
  );
});
const candidate = process.env.TEST_DATABASE_URL;
const target = candidate ? new URL(candidate) : null;
const safe =
  target?.hostname === "127.0.0.1" &&
  target.port === "55448" &&
  target.pathname === "/recognition_test" &&
  target.username === "recognition_test";
if (candidate && !safe)
  throw new Error(
    "Only the explicitly isolated local team chat test cluster is allowed.",
  );
test(
  "real PostgreSQL: delivery, retries, history, mutations, files and channel permissions",
  { skip: !safe, timeout: 120000 },
  async (t) => {
    assert.ok(
      fs.existsSync(schemaUrl) && fs.existsSync(serviceUrl),
      "Chat service and schema must be implemented",
    );
    const { ensureTeamChatSchema } = await import(schemaUrl.href);
    const { createTeamChatService } = await import(serviceUrl.href);
    const schema = `chat_test_${randomUUID().replaceAll("-", "")}`;
    const owner = new pg.Client({ connectionString: candidate });
    await owner.connect();
    await owner.query(`CREATE SCHEMA "${schema}"`);
    const pool = new pg.Pool({
      connectionString: candidate,
      options: `-c search_path=${schema}`,
      max: 8,
    });
    t.after(async () => {
      await pool.end();
      await owner.query(`DROP SCHEMA "${schema}" CASCADE`);
      await owner.end();
    });
    const sql = await pool.connect();
    await sql.query(`CREATE TABLE "User"(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,"isActive" BOOLEAN DEFAULT true,"sessionVersion" INTEGER DEFAULT 0,"mustChangePassword" BOOLEAN DEFAULT false,"avatarUrl" TEXT);
    CREATE TABLE "TeamMember"(id TEXT PRIMARY KEY,"userId" TEXT UNIQUE REFERENCES "User"(id),name TEXT,"avatarUrl" TEXT,"isActive" BOOLEAN DEFAULT true);
    CREATE TABLE "GeneralChatMessage"(id TEXT PRIMARY KEY,content TEXT NOT NULL,"authorId" TEXT REFERENCES "User"(id),"createdAt" TIMESTAMP(3) DEFAULT now());
    CREATE TABLE "Notification"(id TEXT PRIMARY KEY,"userId" TEXT,"message" TEXT,"isRead" BOOLEAN DEFAULT false,"createdAt" TIMESTAMP DEFAULT now(),"type" TEXT,"relatedId" TEXT,"url" TEXT);`);
    const a = { id: randomUUID(), sessionVersion: 0 },
      b = { id: randomUUID(), sessionVersion: 0 },
      c = { id: randomUUID(), sessionVersion: 0 };
    for (const [i, u] of [a, b, c].entries()) {
      await sql.query(
        'INSERT INTO "User"(id,name,email,role) VALUES($1,$2,$3,$4)',
        [
          u.id,
          `Persona ${i}`,
          `${i}@example.invalid`,
          i === 0 ? "ADMIN" : "EDITOR",
        ],
      );
      await sql.query(
        'INSERT INTO "TeamMember"(id,"userId",name) VALUES($1,$2,$3)',
        [randomUUID(), u.id, `Equipo ${i}`],
      );
    }
    const legacyId = randomUUID();
    await sql.query(
      'INSERT INTO "GeneralChatMessage"(id,content,"authorId","createdAt") VALUES($1,$2,$3,$4)',
      [legacyId, "Historial conservado", a.id, "2026-01-01T15:30:00Z"],
    );
    await ensureTeamChatSchema(sql);
    await ensureTeamChatSchema(sql);
    sql.release();
    const service = createTeamChatService({ pool });
    const request = (extra) => ({
      requestId: randomUUID(),
      content: "Hola",
      format: "HTML",
      ...extra,
    });
    await t.test(
      "bootstrap preserves legacy IDs, author, content and date",
      async () => {
        const page = await service.listMessages(a, "general", {});
        const old = page.messages.find((m) => m.id === legacyId);
        assert.equal(old.author.id, a.id);
        assert.match(old.content, /Historial conservado/);
        assert.equal(
          new Date(old.createdAt).toISOString(),
          "2026-01-01T15:30:00.000Z",
        );
      },
    );
    let message;
    await t.test(
      "concurrent retries create one message and one durable event",
      async () => {
        const input = request();
        const results = await Promise.all([
          service.sendMessage(a, "general", input),
          service.sendMessage(a, "general", input),
        ]);
        assert.equal(results[0].id, results[1].id);
        message = results[0];
        assert.equal(
          (
            await pool.query(
              'SELECT * FROM "TeamChatEvent" WHERE "messageId"=$1',
              [message.id],
            )
          ).rowCount,
          1,
        );
        await assert.rejects(
          service.sendMessage(a, "general", { ...input, content: "otro" }),
          (e) => e.statusCode === 409,
        );
        const sync = await service.sync(b, "0");
        assert.ok(sync.events.some((e) => e.message?.id === message.id));
      },
    );
    await t.test(
      "edits require author and current version; deletion survives retries",
      async () => {
        await assert.rejects(
          service.editMessage(b, message.id, request({ version: 1 })),
          (e) => e.statusCode === 403,
        );
        const edited = await service.editMessage(
          a,
          message.id,
          request({ version: 1, content: "<p><u>Editado</u></p>" }),
        );
        assert.equal(edited.version, 2);
        assert.ok(edited.editedAt);
        await assert.rejects(
          service.editMessage(a, message.id, request({ version: 1 })),
          (e) => e.statusCode === 409,
        );
        const input = request({ version: 2 });
        const deleted = await service.deleteMessage(a, message.id, input);
        assert.ok(deleted.deletedAt);
        assert.equal(deleted.content, "");
        assert.equal(
          (await service.deleteMessage(a, message.id, input)).version,
          deleted.version,
        );
      },
    );
    await t.test(
      "reactions are explicit, idempotent and propagated",
      async () => {
        const m = await service.sendMessage(a, "general", request());
        const reaction = request({ emoji: "👍", active: true });
        await Promise.all([
          service.react(b, m.id, reaction),
          service.react(b, m.id, reaction),
        ]);
        let page = await service.listMessages(a, "general", {});
        assert.equal(
          page.messages.find((x) => x.id === m.id).reactions[0].userIds.length,
          1,
        );
        await service.react(b, m.id, request({ emoji: "👍", active: false }));
        page = await service.listMessages(a, "general", {});
        assert.equal(
          page.messages.find((x) => x.id === m.id).reactions.length,
          0,
        );
      },
    );
    await t.test(
      "private access is checked for history, realtime and forwarding",
      async () => {
        const channel = await service.createChannel(a, {
          requestId: randomUUID(),
          name: "Privado",
          isPrivate: true,
          memberIds: [b.id],
        });
        const m = await service.sendMessage(
          b,
          channel.id,
          request({ content: "Privado" }),
        );
        await assert.rejects(
          service.listMessages(c, channel.id, {}),
          (e) => e.statusCode === 403,
        );
        assert.ok(
          !(await service.sync(c, "0")).events.some(
            (e) => e.channelId === channel.id,
          ),
        );
        await assert.rejects(
          service.forwardMessages(b, "general", {
            requestId: randomUUID(),
            messageIds: [m.id],
          }),
          (e) => e.statusCode === 403,
        );
        await service.updateChannel(a, channel.id, {
          requestId: randomUUID(),
          version: channel.version,
          memberIds: [],
        });
        await assert.rejects(
          service.sendMessage(b, channel.id, request()),
          (e) => e.statusCode === 403,
        );
      },
    );
    await t.test(
      "files with the same name keep their identity and forwards retain the correct object",
      async () => {
        const files = [];
        for (let i = 0; i < 2; i++)
          files.push(
            await service.registerUpload(a, "general", {
              requestId: randomUUID(),
              fingerprint: `hash${i}`,
              storageKey: `team-chat/${randomUUID()}`,
              name: "igual.pdf",
              size: 5,
              mimeType: "application/pdf",
            }),
          );
        const m = await service.sendMessage(
          a,
          "general",
          request({
            content: "",
            attachmentIds: files.map((f) => f.attachment.id),
          }),
        );
        assert.equal(m.attachments.length, 2);
        assert.notEqual(m.attachments[0].id, m.attachments[1].id);
        assert.equal(
          (await service.getAttachment(b, m.id, files[1].attachment.id))
            .storageKey,
          files[1].attachment.storageKey,
        );
        const channel = await service.createChannel(a, {
          requestId: randomUUID(),
          name: "Otro",
        });
        const forward = await service.forwardMessages(a, channel.id, {
          requestId: randomUUID(),
          messageIds: [m.id],
        });
        assert.equal(forward[0].attachments[1].id, m.attachments[1].id);
        assert.equal(forward[0].forwarded, true);
        await service.deleteMessage(a, m.id, request({ version: m.version }));
        await assert.rejects(
          service.getAttachment(b, m.id, files[0].attachment.id),
          (e) => e.statusCode === 404,
        );
        assert.equal(
          (
            await service.getAttachment(
              b,
              forward[0].id,
              files[0].attachment.id,
            )
          ).name,
          "igual.pdf",
        );
      },
    );
    await t.test(
      "pagination keeps more than 50 messages and read cursors cannot skip unknown messages",
      async () => {
        for (let i = 0; i < 55; i++)
          await service.sendMessage(
            a,
            "general",
            request({ content: `registro ${i}` }),
          );
        const page = await service.listMessages(b, "general", {});
        assert.equal(page.messages.length, 50);
        assert.ok(page.before);
        const older = await service.listMessages(b, "general", {
          before: page.before,
        });
        assert.ok(older.messages.length);
        assert.ok(
          !older.messages.some((m) => page.messages.some((n) => n.id === m.id)),
        );
        await assert.rejects(
          service.markRead(b, "general", { messageId: "missing" }),
          (e) => e.statusCode === 404,
        );
        await service.markRead(b, "general", {
          messageId: page.messages.at(-1).id,
        });
        assert.equal(
          (await service.listChannels(b)).find((x) => x.id === "general")
            .unread,
          0,
        );
      },
    );
    await t.test(
      "disabled membership revokes existing sessions without erasing history",
      async () => {
        await pool.query(
          'UPDATE "TeamMember" SET "isActive"=false WHERE "userId"=$1',
          [b.id],
        );
        await assert.rejects(service.sync(b, "0"), (e) => e.statusCode === 401);
        await assert.rejects(
          service.sendMessage(b, "general", request()),
          (e) => e.statusCode === 401,
        );
        assert.ok(
          (await service.listMessages(a, "general", {})).messages.length,
        );
      },
    );
  },
);
