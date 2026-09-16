import { randomUUID, createHash } from "node:crypto";
import { readActiveChatActor } from "./teamRosterService.js";
import { normalizeChatContent, chatError } from "./teamChatContent.js";
import {
  CHAT_MAX_FILES,
  CHAT_BATCH_BYTES,
  CHAT_FILE_BYTES,
} from "../lib/teamChatState.js";

export const CHAT_REACTIONS = [
  "👍",
  "❤️",
  "😂",
  "🎉",
  "👀",
  "🙌",
  "✅",
  "🙏",
  "🔥",
  "💡",
];
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const unique = (values) => {
  if (
    values != null &&
    (!Array.isArray(values) || values.some((v) => typeof v !== "string"))
  )
    throw chatError("Lista inválida.");
  return [...new Set(values || [])];
};
const requestKey = (value) => {
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(value || ""))
    throw chatError("Falta la identidad del envío. Actualiza la plataforma.");
  return value;
};
const checkVersion = (row, version) => {
  if (!Number.isInteger(version) || row.version !== version)
    throw chatError(
      "El mensaje o canal cambió. Revisa la versión actual antes de guardar.",
      409,
    );
};
const cursor = (value) => {
  if (!/^\d{1,18}$/.test(String(value ?? "0")))
    throw chatError("Cursor inválido.");
  return String(value ?? "0");
};

export function createTeamChatService({ pool, onCommit = () => {} }) {
  async function transaction(actor, work, write = false) {
    const tx = await pool.connect();
    try {
      await tx.query(
        write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      await tx.query("SET LOCAL statement_timeout='20s'");
      // One small ordered commit stream. This prevents sequence allocation/commit inversion.
      if (write) await tx.query("SELECT pg_advisory_xact_lock(20260916,10)");
      const user = await readActiveChatActor(tx, actor);
      const result = await work(tx, user);
      await tx.query("COMMIT");
      if (write) {
        try {
          onCommit();
        } catch (error) {
          console.error(
            "[TeamChat] committed notification wake failed:",
            error.message,
          );
        }
      }
      return result;
    } catch (error) {
      await tx
        .query("ROLLBACK")
        .catch((e) => console.error("[TeamChat] rollback:", e.message));
      throw error;
    } finally {
      tx.release();
    }
  }
  async function channelAccess(tx, user, id, write = false) {
    const row = (
      await tx.query(
        `SELECT c.*,EXISTS(SELECT 1 FROM "TeamChatMember" m WHERE m."channelId"=c.id AND m."userId"=$2) AS member FROM "TeamChatChannel" c WHERE c.id=$1`,
        [id, user.id],
      )
    ).rows[0];
    if (!row) throw chatError("Canal no encontrado.", 404);
    if (row.isPrivate && !row.member)
      throw chatError("No tienes acceso a este canal.", 403);
    if (write && row.isArchived)
      throw chatError("Este canal está archivado.", 409);
    return row;
  }
  async function messageAccess(tx, user, id, write = false) {
    const row = (
      await tx.query('SELECT * FROM "GeneralChatMessage" WHERE id=$1', [id])
    ).rows[0];
    if (!row) throw chatError("Mensaje no encontrado.", 404);
    await channelAccess(tx, user, row.channelId, write);
    return row;
  }
  async function event(tx, channelId, messageId, type) {
    const row = (
      await tx.query(
        'INSERT INTO "TeamChatEvent"("channelId","messageId",type) VALUES($1,$2,$3) RETURNING seq',
        [channelId, messageId, type],
      )
    ).rows[0];
    await tx.query("SELECT pg_notify('brain_team_chat',$1)", [String(row.seq)]);
    return row.seq;
  }
  async function hydrate(tx, ids) {
    if (!ids.length) return [];
    const rows = (
      await tx.query(
        `SELECT m.*,m."createdAt" AT TIME ZONE 'UTC' AS "createdAt",COALESCE(t.name,u.name) AS "authorName",COALESCE(t."avatarUrl",u."avatarUrl") AS "authorAvatar"
      FROM "GeneralChatMessage" m JOIN "User" u ON u.id=m."authorId" LEFT JOIN "TeamMember" t ON t."userId"=u.id WHERE m.id=ANY($1::text[])`,
        [ids],
      )
    ).rows;
    const attachments = (
      await tx.query(
        `SELECT a."messageId",u.id,u.name,u.size,u."mimeType",a.position FROM "TeamChatAttachment" a JOIN "TeamChatUpload" u ON u.id=a."uploadId" WHERE a."messageId"=ANY($1::text[]) ORDER BY a.position`,
        [ids],
      )
    ).rows;
    const reactions = (
      await tx.query(
        'SELECT "messageId",emoji,array_agg("userId" ORDER BY "userId") AS "userIds" FROM "TeamChatReaction" WHERE "messageId"=ANY($1::text[]) GROUP BY "messageId",emoji',
        [ids],
      )
    ).rows;
    const replyIds = unique(rows.map((m) => m.replyToId).filter(Boolean));
    const replies = replyIds.length
      ? (
          await tx.query(
            'SELECT id,"searchText",content,"contentFormat","deletedAt" FROM "GeneralChatMessage" WHERE id=ANY($1::text[])',
            [replyIds],
          )
        ).rows
      : [];
    const map = new Map(
      rows.map((m) => {
        const body = m.deletedAt
          ? { html: "", text: "" }
          : normalizeChatContent(m.content, m.contentFormat, {
              historical: true,
            });
        const reply = replies.find((r) => r.id === m.replyToId);
        return [
          m.id,
          {
            id: m.id,
            channelId: m.channelId,
            content: body.html,
            text: body.text,
            version: m.version,
            sentSeq: String(m.sentSeq),
            createdAt: m.createdAt,
            editedAt: m.editedAt,
            deletedAt: m.deletedAt,
            forwarded: m.forwarded,
            author: {
              id: m.authorId,
              name: m.authorName,
              avatarUrl: m.authorAvatar,
            },
            attachments: m.deletedAt
              ? []
              : attachments
                  .filter((a) => a.messageId === m.id)
                  .map(({ messageId, position, ...a }) => a),
            reactions: m.deletedAt
              ? []
              : reactions
                  .filter((a) => a.messageId === m.id)
                  .map(({ messageId, ...r }) => r),
            reply: reply
              ? {
                  id: reply.id,
                  text: reply.deletedAt
                    ? "Mensaje eliminado"
                    : normalizeChatContent(reply.content, reply.contentFormat, {
                        historical: true,
                      }).text.slice(0, 220),
                }
              : null,
          },
        ];
      }),
    );
    return ids.map((id) => map.get(id)).filter(Boolean);
  }
  async function resolve(tx, result) {
    if (result.messageIds) {
      const messages = await hydrate(tx, result.messageIds);
      return result.single ? messages[0] : messages;
    }
    if (result.channelId)
      return (
        await tx.query('SELECT * FROM "TeamChatChannel" WHERE id=$1', [
          result.channelId,
        ])
      ).rows[0];
    if (result.uploadId)
      return {
        attachment: (
          await tx.query('SELECT * FROM "TeamChatUpload" WHERE id=$1', [
            result.uploadId,
          ])
        ).rows[0],
        reused: false,
      };
    return result;
  }
  const mutate = (actor, operation, input, authorize, work) =>
    transaction(
      actor,
      async (tx, user) => {
        const access = await authorize(tx, user);
        const requestId = requestKey(input.requestId);
        const fingerprint = hash([operation, input]);
        const previous = (
          await tx.query(
            'SELECT fingerprint,result FROM "TeamChatRequest" WHERE "actorId"=$1 AND "requestId"=$2',
            [user.id, requestId],
          )
        ).rows[0];
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            throw chatError(
              "Este intento corresponde a otro contenido. No se envió de nuevo.",
              409,
            );
          return resolve(tx, previous.result);
        }
        const result = await work(tx, user, access);
        await tx.query(
          'INSERT INTO "TeamChatRequest"("actorId","requestId",fingerprint,result) VALUES($1,$2,$3,$4)',
          [user.id, requestId, fingerprint, result],
        );
        return resolve(tx, result);
      },
      true,
    );
  async function listChannelsIn(tx, user) {
    const rows = (
      await tx.query(
        `SELECT c.*,COALESCE(cm.muted,false) AS muted,
      (SELECT count(*)::int FROM "GeneralChatMessage" msg WHERE msg."channelId"=c.id AND msg."deletedAt" IS NULL AND msg."authorId"<>$1 AND msg."sentSeq">COALESCE(cm."readSeq",0)) AS unread
      FROM "TeamChatChannel" c LEFT JOIN "TeamChatMember" cm ON cm."channelId"=c.id AND cm."userId"=$1
      WHERE c."isPrivate"=false OR cm."userId" IS NOT NULL ORDER BY (c.id='general') DESC,c.name,c.id`,
        [user.id],
      )
    ).rows;
    return rows;
  }
  async function insertMessage(
    tx,
    user,
    channelId,
    input,
    { forwarded = false, uploads = null } = {},
  ) {
    const body = normalizeChatContent(
      input.content || "",
      input.format || "HTML",
    );
    const attachmentIds = unique(input.attachmentIds);
    if (attachmentIds.length > CHAT_MAX_FILES)
      throw chatError(`Máximo ${CHAT_MAX_FILES} archivos por mensaje.`);
    let files = uploads;
    if (!files)
      files = attachmentIds.length
        ? (
            await tx.query(
              `SELECT * FROM "TeamChatUpload" WHERE id=ANY($1::text[]) AND "ownerId"=$2 AND "channelId"=$3 AND state='READY'`,
              [attachmentIds, user.id, channelId],
            )
          ).rows
        : [];
    if (!uploads && files.length !== attachmentIds.length)
      throw chatError(
        "Uno de los archivos no está disponible para este envío.",
        409,
      );
    if (files.reduce((s, f) => s + f.size, 0) > CHAT_BATCH_BYTES)
      throw chatError("El mensaje supera 250 MB de adjuntos.");
    if (!body.text && !files.length)
      throw chatError("Escribe un mensaje o añade un archivo.");
    if (input.replyToId) {
      const reply = await messageAccess(tx, user, input.replyToId);
      if (reply.channelId !== channelId || reply.deletedAt)
        throw chatError("La respuesta original ya no está disponible.", 409);
    }
    const id = randomUUID();
    await tx.query(
      `INSERT INTO "GeneralChatMessage"(id,content,"contentFormat","searchText","channelId","authorId","createdAt","replyToId",forwarded)
      VALUES($1,$2,'HTML',$3,$4,$5,$6,$7,$8)`,
      [
        id,
        body.html,
        body.text,
        channelId,
        user.id,
        new Date().toISOString(),
        input.replyToId || null,
        forwarded,
      ],
    );
    const ordered = uploads
      ? files
      : attachmentIds.map((fid) => files.find((f) => f.id === fid));
    for (const [position, file] of ordered.entries())
      await tx.query(
        'INSERT INTO "TeamChatAttachment"("messageId","uploadId",position) VALUES($1,$2,$3)',
        [id, file.id, position],
      );
    const seq = await event(tx, channelId, id, "message");
    await tx.query('UPDATE "GeneralChatMessage" SET "sentSeq"=$2 WHERE id=$1', [
      id,
      seq,
    ]);
    if (body.mentions.length) {
      const targets = (
        await tx.query(
          `SELECT u.id FROM "User" u JOIN "TeamMember" t ON t."userId"=u.id
        JOIN "TeamChatChannel" c ON c.id=$2 LEFT JOIN "TeamChatMember" m ON m."userId"=u.id AND m."channelId"=c.id
        WHERE t.id=ANY($1::text[]) AND u.id<>$3 AND u."isActive"=true AND t."isActive"=true AND (c."isPrivate"=false OR m."userId" IS NOT NULL) AND COALESCE(m.muted,false)=false`,
          [body.mentions, channelId, user.id],
        )
      ).rows;
      for (const target of targets) {
        const nid = randomUUID();
        await tx.query(
          `INSERT INTO "Notification"(id,"userId",message,type,"relatedId",url) VALUES($1,$2,$3,'GENERAL_CHAT_MENTION',$4,$5)`,
          [
            nid,
            target.id,
            `${user.name} te mencionó en un canal`,
            id,
            `/?chatChannel=${encodeURIComponent(channelId)}&chatMessage=${id}`,
          ],
        );
        await tx.query(
          'INSERT INTO "TeamChatPushDelivery"("notificationId") VALUES($1)',
          [nid],
        );
      }
    }
    return id;
  }
  const api = {
    checkActor: (actor) => transaction(actor, async (tx, user) => user),
    assertChannel: (actor, id, write = false) =>
      transaction(actor, (tx, user) => channelAccess(tx, user, id, write)),
    snapshot: (actor) =>
      transaction(actor, async (tx, user) => ({
        cursor: (
          await tx.query(
            'SELECT COALESCE(max(seq),0)::text AS seq FROM "TeamChatEvent"',
          )
        ).rows[0].seq,
        channels: await listChannelsIn(tx, user),
      })),
    listChannels: (actor) => transaction(actor, listChannelsIn),
    roster: (actor) =>
      transaction(
        actor,
        async (tx) =>
          (
            await tx.query(
              `SELECT u.id,t.id AS "memberId",t.name,t."avatarUrl" FROM "User" u JOIN "TeamMember" t ON t."userId"=u.id WHERE u."isActive"=true AND t."isActive"=true ORDER BY t.name`,
            )
          ).rows,
      ),
    listMessages: (
      actor,
      channelId,
      { before, query = "", filesOnly = false } = {},
    ) =>
      transaction(actor, async (tx, user) => {
        await channelAccess(tx, user, channelId);
        const params = [channelId];
        let filter = "";
        if (before) {
          let page;
          try {
            page = JSON.parse(Buffer.from(before, "base64url").toString());
          } catch {
            throw chatError("Página inválida.");
          }
          if (!page?.id || !Number.isFinite(Date.parse(page.date)))
            throw chatError("Página inválida.");
          params.push(page.date, page.id);
          filter += ' AND (m."createdAt",m.id)<($2::timestamp,$3::text)';
        }
        if (query) {
          if (String(query).length > 200)
            throw chatError("La búsqueda es demasiado larga.");
          params.push(`%${String(query).replace(/[\\%_]/g, "\\$&")}%`);
          filter += ` AND m."deletedAt" IS NULL AND (COALESCE(NULLIF(m."searchText",''),m.content) ILIKE $${params.length} OR EXISTS(SELECT 1 FROM "TeamChatAttachment" a JOIN "TeamChatUpload" u ON u.id=a."uploadId" WHERE a."messageId"=m.id AND u.name ILIKE $${params.length}))`;
        }
        if (filesOnly)
          filter +=
            ' AND m."deletedAt" IS NULL AND (EXISTS(SELECT 1 FROM "TeamChatAttachment" a WHERE a."messageId"=m.id) OR m.content ~* \'https?://\')';
        const rows = (
          await tx.query(
            `SELECT m.id,m."createdAt" AT TIME ZONE 'UTC' AS "createdAt" FROM "GeneralChatMessage" m WHERE m."channelId"=$1 ${filter} ORDER BY m."createdAt" DESC,m.id DESC LIMIT 51`,
            params,
          )
        ).rows;
        const more = rows.length > 50;
        const selected = rows.slice(0, 50).reverse();
        const earliest = selected[0];
        return {
          messages: await hydrate(
            tx,
            selected.map((m) => m.id),
          ),
          before: more
            ? Buffer.from(
                JSON.stringify({ id: earliest.id, date: earliest.createdAt }),
              ).toString("base64url")
            : null,
        };
      }),
    getMessage: (actor, id) =>
      transaction(actor, async (tx, user) => {
        await messageAccess(tx, user, id);
        return (await hydrate(tx, [id]))[0];
      }),
    sendMessage: (actor, channelId, input) =>
      mutate(
        actor,
        `send:${channelId}`,
        input,
        (tx, user) => channelAccess(tx, user, channelId, true),
        async (tx, user) => ({
          messageIds: [await insertMessage(tx, user, channelId, input)],
          single: true,
        }),
      ),
    editMessage: (actor, id, input) =>
      mutate(
        actor,
        `edit:${id}`,
        input,
        async (tx, user) => {
          const m = await messageAccess(tx, user, id, true);
          if (m.authorId !== user.id)
            throw chatError("Solo puedes editar tus mensajes.", 403);
          return m;
        },
        async (tx, user, m) => {
          if (m.deletedAt) throw chatError("Este mensaje fue eliminado.", 409);
          checkVersion(m, input.version);
          const body = normalizeChatContent(
            input.content,
            input.format || "HTML",
          );
          if (
            !body.text &&
            !(
              await tx.query(
                'SELECT 1 FROM "TeamChatAttachment" WHERE "messageId"=$1',
                [id],
              )
            ).rowCount
          )
            throw chatError("El mensaje no puede estar vacío.");
          await tx.query(
            'UPDATE "GeneralChatMessage" SET content=$2,"searchText"=$3,"contentFormat"=\'HTML\',version=version+1,"editedAt"=now() WHERE id=$1',
            [id, body.html, body.text],
          );
          await event(tx, m.channelId, id, "edit");
          return { messageIds: [id], single: true };
        },
      ),
    deleteMessage: (actor, id, input) =>
      mutate(
        actor,
        `delete:${id}`,
        input,
        async (tx, user) => {
          const m = await messageAccess(tx, user, id, true);
          if (m.authorId !== user.id)
            throw chatError("Solo puedes eliminar tus mensajes.", 403);
          return m;
        },
        async (tx, user, m) => {
          checkVersion(m, input.version);
          if (!m.deletedAt) {
            await tx.query(
              'UPDATE "GeneralChatMessage" SET content=\'\',"searchText"=\'\',"deletedAt"=now(),version=version+1 WHERE id=$1',
              [id],
            );
            await tx.query(
              'DELETE FROM "TeamChatReaction" WHERE "messageId"=$1',
              [id],
            );
            await event(tx, m.channelId, id, "delete");
          }
          return { messageIds: [id], single: true };
        },
      ),
    react: (actor, id, input) =>
      mutate(
        actor,
        `react:${id}`,
        input,
        (tx, user) => messageAccess(tx, user, id, true),
        async (tx, user, m) => {
          if (m.deletedAt) throw chatError("Este mensaje fue eliminado.", 409);
          if (
            !CHAT_REACTIONS.includes(input.emoji) ||
            typeof input.active !== "boolean"
          )
            throw chatError("Reacción inválida.");
          if (input.active)
            await tx.query(
              'INSERT INTO "TeamChatReaction"("messageId","userId",emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
              [id, user.id, input.emoji],
            );
          else
            await tx.query(
              'DELETE FROM "TeamChatReaction" WHERE "messageId"=$1 AND "userId"=$2 AND emoji=$3',
              [id, user.id, input.emoji],
            );
          await tx.query(
            'UPDATE "GeneralChatMessage" SET version=version+1 WHERE id=$1',
            [id],
          );
          await event(tx, m.channelId, id, "reaction");
          return { messageIds: [id], single: true };
        },
      ),
    createChannel: (actor, input) =>
      mutate(
        actor,
        "channel:create",
        input,
        async (tx, user) => {
          if (user.role !== "ADMIN")
            throw chatError("Solo un administrador puede crear canales.", 403);
        },
        async (tx, user) => {
          const name = String(input.name || "").trim();
          if (!name || name.length > 60)
            throw chatError("El nombre debe tener entre 1 y 60 caracteres.");
          const id = randomUUID();
          await tx.query(
            'INSERT INTO "TeamChatChannel"(id,name,"isPrivate","createdById") VALUES($1,$2,$3,$4)',
            [id, name, input.isPrivate === true, user.id],
          );
          const members = unique([user.id, ...(input.memberIds || [])]);
          await setMembers(tx, id, members);
          await event(tx, id, null, "channel");
          return { channelId: id };
        },
      ),
    updateChannel: (actor, id, input) =>
      mutate(
        actor,
        `channel:${id}`,
        input,
        async (tx, user) => {
          if (user.role !== "ADMIN")
            throw chatError(
              "Solo un administrador puede administrar canales.",
              403,
            );
          return channelAccess(tx, user, id);
        },
        async (tx, user, c) => {
          if (id === "general")
            throw chatError(
              "General permanece disponible para todo el equipo.",
            );
          checkVersion(c, input.version);
          const name =
            input.name === undefined ? c.name : String(input.name).trim();
          if (!name || name.length > 60) throw chatError("Nombre inválido.");
          await tx.query(
            'UPDATE "TeamChatChannel" SET name=$2,"isArchived"=$3,version=version+1 WHERE id=$1',
            [id, name, input.isArchived ?? c.isArchived],
          );
          if (input.memberIds !== undefined)
            await setMembers(tx, id, unique([user.id, ...input.memberIds]));
          await event(tx, id, null, "channel");
          return { channelId: id };
        },
      ),
    channelMembers: (actor, id) =>
      transaction(actor, async (tx, user) => {
        const c = await channelAccess(tx, user, id);
        if (user.role !== "ADMIN" || !c.isPrivate) return [];
        return (
          await tx.query(
            'SELECT "userId" FROM "TeamChatMember" WHERE "channelId"=$1',
            [id],
          )
        ).rows.map((r) => r.userId);
      }),
    registerUpload: (actor, id, input) =>
      transaction(
        actor,
        async (tx, user) => {
          await channelAccess(tx, user, id, true);
          requestKey(input.requestId);
          if (
            !Number.isInteger(input.size) ||
            input.size <= 0 ||
            input.size > CHAT_FILE_BYTES
          )
            throw chatError("Archivo vacío o superior a 100 MB.");
          const previous = (
            await tx.query(
              'SELECT * FROM "TeamChatUpload" WHERE "ownerId"=$1 AND "requestId"=$2',
              [user.id, input.requestId],
            )
          ).rows[0];
          if (previous) {
            if (
              previous.fingerprint !== input.fingerprint ||
              previous.channelId !== id ||
              previous.name !== input.name ||
              previous.state !== "READY"
            )
              throw chatError("Esta carga corresponde a otro archivo.", 409);
            return { attachment: previous, reused: true };
          }
          const fid = randomUUID();
          const row = (
            await tx.query(
              `INSERT INTO "TeamChatUpload"(id,"ownerId","channelId","requestId",fingerprint,"storageKey",name,size,"mimeType") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
              [
                fid,
                user.id,
                id,
                input.requestId,
                input.fingerprint,
                input.storageKey,
                input.name,
                input.size,
                input.mimeType,
              ],
            )
          ).rows[0];
          return { attachment: row, reused: false };
        },
        true,
      ),
    getAttachment: (actor, messageId, attachmentId) =>
      transaction(actor, async (tx, user) => {
        const m = await messageAccess(tx, user, messageId);
        if (m.deletedAt) throw chatError("Adjunto no disponible.", 404);
        const f = (
          await tx.query(
            'SELECT u.* FROM "TeamChatUpload" u JOIN "TeamChatAttachment" a ON a."uploadId"=u.id WHERE a."messageId"=$1 AND u.id=$2',
            [messageId, attachmentId],
          )
        ).rows[0];
        if (!f) throw chatError("Adjunto no encontrado.", 404);
        return f;
      }),
    markRead: (actor, id, { messageId }) =>
      transaction(
        actor,
        async (tx, user) => {
          await channelAccess(tx, user, id);
          const m = await messageAccess(tx, user, messageId);
          if (m.channelId !== id)
            throw chatError("El mensaje no pertenece al canal.");
          await tx.query(
            `INSERT INTO "TeamChatMember"("channelId","userId","readSeq") VALUES($1,$2,$3) ON CONFLICT("channelId","userId") DO UPDATE SET "readSeq"=GREATEST("TeamChatMember"."readSeq",EXCLUDED."readSeq")`,
            [id, user.id, m.sentSeq],
          );
          return { ok: true };
        },
        true,
      ),
    setMuted: (actor, id, muted) =>
      transaction(
        actor,
        async (tx, user) => {
          await channelAccess(tx, user, id);
          if (typeof muted !== "boolean")
            throw chatError("Preferencia inválida.");
          await tx.query(
            'INSERT INTO "TeamChatMember"("channelId","userId",muted) VALUES($1,$2,$3) ON CONFLICT("channelId","userId") DO UPDATE SET muted=EXCLUDED.muted',
            [id, user.id, muted],
          );
          return { muted };
        },
        true,
      ),
    sync: (actor, after = "0") =>
      transaction(actor, async (tx, user) => {
        const watermark = (
          await tx.query(
            'SELECT COALESCE(max(seq),0)::text AS seq FROM "TeamChatEvent"',
          )
        ).rows[0].seq;
        const events = (
          await tx.query(
            `SELECT e.* FROM "TeamChatEvent" e JOIN "TeamChatChannel" c ON c.id=e."channelId"
        WHERE e.seq>$1 AND (c."isPrivate"=false OR EXISTS(SELECT 1 FROM "TeamChatMember" m WHERE m."channelId"=c.id AND m."userId"=$2)) ORDER BY e.seq LIMIT 101`,
            [cursor(after), user.id],
          )
        ).rows;
        const batch = events.slice(0, 100);
        const messages = await hydrate(
          tx,
          unique(batch.map((e) => e.messageId).filter(Boolean)),
        );
        const byId = new Map(messages.map((m) => [m.id, m]));
        return {
          cursor: events.length > 100 ? String(batch.at(-1).seq) : watermark,
          more: events.length > 100,
          events: batch.map((e) => ({
            id: String(e.seq),
            type: e.type,
            channelId: e.channelId,
            message: byId.get(e.messageId) || null,
          })),
          channels: await listChannelsIn(tx, user),
        };
      }),
    forwardMessages: (actor, target, input) =>
      mutate(
        actor,
        `forward:${target}`,
        input,
        async (tx, user) => {
          const dest = await channelAccess(tx, user, target, true);
          const ids = unique(input.messageIds);
          if (!ids.length || ids.length > 20)
            throw chatError("Selecciona entre 1 y 20 mensajes.");
          const source = [];
          for (const id of ids) {
            const m = await messageAccess(tx, user, id);
            if (m.deletedAt)
              throw chatError("Un mensaje seleccionado fue eliminado.", 409);
            const ch = await channelAccess(tx, user, m.channelId);
            if (ch.isPrivate) {
              if (!dest.isPrivate)
                throw chatError(
                  "No se puede reenviar contenido privado a un canal abierto.",
                  403,
                );
              const extra = (
                await tx.query(
                  'SELECT "userId" FROM "TeamChatMember" WHERE "channelId"=$1 EXCEPT SELECT "userId" FROM "TeamChatMember" WHERE "channelId"=$2',
                  [target, ch.id],
                )
              ).rowCount;
              if (extra)
                throw chatError(
                  "El destino incluye personas sin acceso al contenido privado.",
                  403,
                );
            }
            source.push(m);
          }
          return source.sort(
            (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
          );
        },
        async (tx, user, source) => {
          const ids = [];
          for (const m of source) {
            const files = (
              await tx.query(
                'SELECT u.* FROM "TeamChatUpload" u JOIN "TeamChatAttachment" a ON a."uploadId"=u.id WHERE a."messageId"=$1 ORDER BY a.position',
                [m.id],
              )
            ).rows;
            ids.push(
              await insertMessage(
                tx,
                user,
                target,
                { content: m.content, format: m.contentFormat },
                { forwarded: true, uploads: files },
              ),
            );
          }
          return { messageIds: ids };
        },
      ),
  };
  async function setMembers(tx, id, ids) {
    if (!Array.isArray(ids) || ids.length > 500)
      throw chatError("Lista de miembros inválida.");
    const active = (
      await tx.query(
        'SELECT u.id FROM "User" u JOIN "TeamMember" t ON t."userId"=u.id WHERE u.id=ANY($1::text[]) AND u."isActive"=true AND t."isActive"=true',
        [ids],
      )
    ).rows;
    if (active.length !== ids.length)
      throw chatError("Selecciona únicamente personas activas del equipo.");
    await tx.query(
      'DELETE FROM "TeamChatMember" WHERE "channelId"=$1 AND NOT("userId"=ANY($2::text[]))',
      [id, ids],
    );
    for (const uid of ids)
      await tx.query(
        'INSERT INTO "TeamChatMember"("channelId","userId") VALUES($1,$2) ON CONFLICT DO NOTHING',
        [id, uid],
      );
  }
  return api;
}
