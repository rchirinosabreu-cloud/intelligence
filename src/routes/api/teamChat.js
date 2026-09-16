import express from "express";
import multer from "multer";
import { tmpdir } from "node:os";
import { unlink } from "node:fs/promises";
import jwt from "jsonwebtoken";
import { createHmac } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { getTeamChatRuntime } from "../../services/teamChatRuntime.js";
import {
  inspectChatFile,
  parseChatRange,
} from "../../services/teamChatMedia.js";
import { CHAT_FILE_BYTES } from "../../lib/teamChatState.js";
import { getJwtSecret, createRateLimiter } from "../../config/security.js";

const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: CHAT_FILE_BYTES, files: 1, fields: 2 },
}).single("file");
// A URL ticket can only open one attachment; it must not be accepted as a login token.
const mediaSecret = () =>
  createHmac("sha256", getJwtSecret())
    .update("brain-team-chat-media-v1")
    .digest();
const report = (res, error) => {
  console.error(
    "[TeamChat API]",
    error.response?.data || error.message || error,
  );
  if (!res.headersSent)
    res
      .status(error.statusCode || 500)
      .json({
        error: error.statusCode
          ? error.message
          : "No se pudo completar la operación. Conservamos tu borrador para reintentar.",
      });
};
const safe = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    report(res, error);
  }
};
const drain = (res) =>
  new Promise((resolve) => {
    const done = () => {
      res.off("drain", done);
      res.off("close", done);
      resolve();
    };
    res.once("drain", done);
    res.once("close", done);
  });
const waitForChange = (signals, res) => {
  let settle;
  const promise = new Promise((resolve) => {
    settle = resolve;
  });
  const finish = () => {
    clearTimeout(timer);
    signals.off("change", finish);
    res.off("close", finish);
    settle();
  };
  const timer = setTimeout(finish, 2000);
  timer.unref?.();
  signals.once("change", finish);
  res.once("close", finish);
  return { promise, cancel: finish };
};
export function createTeamChatRouter(runtimeProvider = getTeamChatRuntime) {
  const router = express.Router();
  router.use((req, res, next) => {
    req.chat = runtimeProvider();
    next();
  });
  router.use((req, res, next) =>
    req.method === "GET" ? next() : writeLimit(req, res, next),
  );
  const run = (fn) =>
    safe(async (req, res) => res.json(await fn(req.chat.service, req)));
  router.get(
    "/channels",
    run((s, r) => s.listChannels(r.user)),
  );
  router.get(
    "/roster",
    run((s, r) => s.roster(r.user)),
  );
  router.post(
    "/channels",
    run((s, r) => s.createChannel(r.user, r.body)),
  );
  router.patch(
    "/channels/:id",
    run((s, r) => s.updateChannel(r.user, r.params.id, r.body)),
  );
  router.get(
    "/channels/:id/members",
    run((s, r) => s.channelMembers(r.user, r.params.id)),
  );
  router.get(
    "/channels/:id/messages",
    run((s, r) =>
      s.listMessages(r.user, r.params.id, {
        before: r.query.before,
        query: r.query.q,
        filesOnly: r.query.files === "1",
      }),
    ),
  );
  router.post(
    "/channels/:id/messages",
    run((s, r) => s.sendMessage(r.user, r.params.id, r.body)),
  );
  router.post(
    "/channels/:id/forward",
    run((s, r) => s.forwardMessages(r.user, r.params.id, r.body)),
  );
  router.post(
    "/channels/:id/read",
    run((s, r) => s.markRead(r.user, r.params.id, r.body)),
  );
  router.put(
    "/channels/:id/muted",
    run((s, r) => s.setMuted(r.user, r.params.id, r.body.muted)),
  );
  router.get(
    "/messages/:id",
    run((s, r) => s.getMessage(r.user, r.params.id)),
  );
  router.patch(
    "/messages/:id",
    run((s, r) => s.editMessage(r.user, r.params.id, r.body)),
  );
  router.delete(
    "/messages/:id",
    run((s, r) => s.deleteMessage(r.user, r.params.id, r.body)),
  );
  router.put(
    "/messages/:id/reactions",
    run((s, r) => s.react(r.user, r.params.id, r.body)),
  );
  router.get(
    "/events",
    safe(async (req, res) => {
      const { service, signals } = req.chat;
      let after = req.query.after;
      // Authenticate before opening a long-lived response; every sync checks session/roster again.
      await service.checkActor(req.user);
      if (after === undefined) {
        const initial = await service.snapshot(req.user);
        after = initial.cursor;
        res.set({
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        });
        res.flushHeaders();
        res.write(`data: ${JSON.stringify({ type: "ready", ...initial })}\n\n`);
      } else {
        res.set({
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        });
        res.flushHeaders();
      }
      let gone = false;
      res.once("close", () => {
        gone = true;
      });
      while (!gone) {
        const wake = waitForChange(signals, res);
        try {
          const change = await service.sync(req.user, after);
          after = change.cursor;
          if (gone) break;
          const accepted = res.write(
            `data: ${JSON.stringify({ type: "sync", ...change })}\n\n`,
          );
          if (!accepted) {
            await drain(res);
            if (gone) break;
          }
          if (change.more) {
            wake.cancel();
            continue;
          }
          await wake.promise;
        } catch (error) {
          console.error("[TeamChat stream]", error.message);
          if (!gone) {
            res.write(
              `data: ${JSON.stringify({ type: error.statusCode === 401 ? "expired" : "retry" })}\n\n`,
            );
            res.end();
          }
          break;
        } finally {
          wake.cancel();
        }
      }
    }),
  );
  router.post(
    "/channels/:id/uploads",
    safe(async (req, res) => {
      // Reject inaccessible channels before accepting their file bytes.
      await req.chat.service.assertChannel(req.user, req.params.id, true);
      await new Promise((resolve, reject) =>
        upload(req, res, (error) =>
          error
            ? reject(
                Object.assign(error, {
                  statusCode: 400,
                  message:
                    error.code === "LIMIT_FILE_SIZE"
                      ? "El archivo supera 100 MB."
                      : error.message,
                }),
              )
            : resolve(),
        ),
      );
      let key = null,
        committed = false;
      try {
        if (!req.file)
          throw Object.assign(new Error("Selecciona un archivo."), {
            statusCode: 400,
          });
        const metadata = await inspectChatFile(req.file);
        key = await req.chat.storage.upload(req.file, metadata);
        const result = await req.chat.service.registerUpload(
          req.user,
          req.params.id,
          { ...metadata, storageKey: key, requestId: req.body.requestId },
        );
        committed = !result.reused;
        if (result.reused) {
          await req.chat.storage.remove(key);
          key = null;
        }
        const { id, name, size, mimeType } = result.attachment;
        res.status(201).json({ id, name, size, mimeType });
      } finally {
        if (key && !committed)
          await req.chat.storage
            .remove(key)
            .catch((e) =>
              console.error("[TeamChat upload] cleanup:", e.message),
            );
        if (req.file?.path)
          await unlink(req.file.path).catch((e) =>
            console.error("[TeamChat upload] temp cleanup:", e.message),
          );
      }
    }),
  );
  router.post(
    "/messages/:messageId/attachments/:attachmentId/access",
    safe(async (req, res) => {
      const file = await req.chat.service.getAttachment(
        req.user,
        req.params.messageId,
        req.params.attachmentId,
      );
      const expiresIn = Math.max(
        1,
        Math.min(
          600,
          (req.user.exp || Math.floor(Date.now() / 1000) + 600) -
            Math.floor(Date.now() / 1000),
        ),
      );
      const access = jwt.sign(
        {
          userId: req.user.userId || req.user.id,
          sessionVersion: req.user.sessionVersion || 0,
          messageId: req.params.messageId,
          attachmentId: file.id,
        },
        mediaSecret(),
        { audience: "team-chat-media", expiresIn },
      );
      res.json({
        url: `/api/team-chat-media/${encodeURIComponent(req.params.messageId)}/${encodeURIComponent(file.id)}?access_token=${encodeURIComponent(access)}`,
        mimeType: file.mimeType,
      });
    }),
  );
  return router;
}
const writeLimit = createRateLimiter({
  max: 180,
  windowMs: 60000,
  keyGenerator: (req) => req.user.userId || req.user.id,
});
export function createTeamChatMediaRouter(
  runtimeProvider = getTeamChatRuntime,
) {
  const router = express.Router();
  router.get(
    "/:messageId/:attachmentId",
    safe(async (req, res) => {
      let actor;
      try {
        actor = jwt.verify(
          String(req.query.access_token || ""),
          mediaSecret(),
          { audience: "team-chat-media", algorithms: ["HS256"] },
        );
      } catch (error) {
        console.error("[TeamChat media] authorization:", error.message);
        return res
          .status(401)
          .json({ error: "El acceso al archivo venció. Ábrelo de nuevo." });
      }
      if (
        actor.messageId !== req.params.messageId ||
        actor.attachmentId !== req.params.attachmentId
      )
        return res.status(403).json({ error: "Archivo no autorizado." });
      const runtime = runtimeProvider();
      const file = await runtime.service.getAttachment(
        actor,
        req.params.messageId,
        req.params.attachmentId,
      );
      let range;
      try {
        range = parseChatRange(req.headers.range, file.size);
      } catch (error) {
        res.set("Content-Range", `bytes */${file.size}`);
        throw error;
      }
      const object = await runtime.storage.get(file.storageKey, range);
      const inline =
        /^(image\/(png|jpeg|gif|webp)|audio\/(mpeg|mp4|webm|ogg|wav)|video\/(mp4|webm))$/.test(
          file.mimeType,
        ) && req.query.download !== "1";
      res.set({
        "Content-Type": inline ? file.mimeType : "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Accept-Ranges": "bytes",
        "Content-Length": String(
          range ? range.end - range.start + 1 : file.size,
        ),
      });
      if (range) {
        res.status(206);
        res.set(
          "Content-Range",
          `bytes ${range.start}-${range.end}/${file.size}`,
        );
      }
      try {
        await pipeline(object.Body, res);
      } catch (error) {
        console.error("[TeamChat media] stream:", error.message);
        res.destroy();
      }
    }),
  );
  return router;
}
export default createTeamChatRouter;
