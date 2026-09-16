import pg from "pg";
import { EventEmitter } from "node:events";
import { createTeamChatService } from "./teamChatService.js";
import { createChatStorage } from "./teamChatMedia.js";

export function createTeamChatRuntime({
  pool,
  storage = createChatStorage(),
  pushDelivery,
} = {}) {
  const signals = new EventEmitter();
  signals.setMaxListeners(200);
  const service = createTeamChatService({
    pool,
    onCommit: () => signals.emit("change"),
  });
  let listener = null,
    closed = false,
    reconnect = null,
    maintenanceTimer = null,
    maintaining = false;
  const connect = async () => {
    if (closed || listener) return;
    try {
      const client = await pool.connect();
      if (closed) {
        client.release();
        return;
      }
      listener = client;
      const lost = (error) => {
        console.error(
          "[TeamChat] realtime listener:",
          error?.message || "connection closed",
        );
        if (listener !== client) return;
        listener = null;
        client.release(true);
        if (!closed) {
          reconnect = setTimeout(connect, 5000);
          reconnect.unref?.();
        }
      };
      client.on("error", lost);
      client.on("end", lost);
      client.on("notification", () => signals.emit("change"));
      await client.query("LISTEN brain_team_chat");
    } catch (error) {
      console.error("[TeamChat] realtime listener unavailable:", error.message);
      if (listener) {
        listener.release(true);
        listener = null;
      }
      if (!closed) {
        reconnect = setTimeout(connect, 5000);
        reconnect.unref?.();
      }
    }
  };
  const maintenance = async () => {
    if (maintaining || closed) return;
    maintaining = true;
    try {
      // Claim only unreferenced staged objects. A message transaction cannot attach DELETING objects.
      const tx = await pool.connect();
      let abandoned = [];
      try {
        await tx.query("BEGIN");
        await tx.query("SELECT pg_advisory_xact_lock(20260916,10)");
        abandoned = (
          await tx.query(
            `UPDATE "TeamChatUpload" SET state='DELETING' WHERE id IN (SELECT u.id FROM "TeamChatUpload" u WHERE u."createdAt"<now()-interval '24 hours' AND NOT EXISTS(SELECT 1 FROM "TeamChatAttachment" a WHERE a."uploadId"=u.id) LIMIT 20) RETURNING id,"storageKey"`,
          )
        ).rows;
        await tx.query("COMMIT");
      } catch (error) {
        await tx.query("ROLLBACK");
        throw error;
      } finally {
        tx.release();
      }
      for (const file of abandoned) {
        try {
          await storage.remove(file.storageKey);
          await pool.query(
            "DELETE FROM \"TeamChatUpload\" WHERE id=$1 AND state='DELETING'",
            [file.id],
          );
        } catch (error) {
          console.error("[TeamChat] staged cleanup:", error.message);
        }
      }
      if (pushDelivery) {
        const jobs = (
          await pool.query(
            `UPDATE "TeamChatPushDelivery" SET "nextAttemptAt"=now()+interval '2 minutes',attempts=attempts+1 WHERE "notificationId" IN (SELECT "notificationId" FROM "TeamChatPushDelivery" WHERE "deliveredAt" IS NULL AND "nextAttemptAt"<=now() AND attempts<8 FOR UPDATE SKIP LOCKED LIMIT 10) RETURNING "notificationId"`,
          )
        ).rows;
        for (const job of jobs) {
          try {
            const notification = (
              await pool.query('SELECT * FROM "Notification" WHERE id=$1', [
                job.notificationId,
              ])
            ).rows[0];
            const m =
              notification &&
              (
                await pool.query(
                  `SELECT m."deletedAt",c."isPrivate",cm.muted,cm."userId" FROM "GeneralChatMessage" m JOIN "TeamChatChannel" c ON c.id=m."channelId" LEFT JOIN "TeamChatMember" cm ON cm."channelId"=c.id AND cm."userId"=$2 WHERE m.id=$1`,
                  [notification.relatedId, notification.userId],
                )
              ).rows[0];
            if (m && !m.deletedAt && !m.muted && (!m.isPrivate || m.userId)) {
              const result = await pushDelivery(notification);
              if (result.attempted > result.delivered + result.removed)
                throw new Error("Push delivery will retry.");
            }
            await pool.query(
              'UPDATE "TeamChatPushDelivery" SET "deliveredAt"=now() WHERE "notificationId"=$1',
              [job.notificationId],
            );
          } catch (error) {
            console.error("[TeamChat] push will retry:", error.message);
          }
        }
      }
    } catch (error) {
      console.error("[TeamChat] maintenance:", error.message);
    } finally {
      maintaining = false;
    }
  };
  return {
    pool,
    service,
    storage,
    signals,
    start() {
      void connect();
      maintenanceTimer = setInterval(maintenance, 30000);
      maintenanceTimer.unref?.();
    },
    async close() {
      closed = true;
      clearTimeout(reconnect);
      clearInterval(maintenanceTimer);
      signals.emit("change");
      if (listener) {
        const client = listener;
        listener = null;
        await client.query("UNLISTEN brain_team_chat");
        client.release();
      }
    },
    maintenance,
  };
}
let runtime;
export function getTeamChatRuntime() {
  if (!runtime) {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    });
    pool.on("error", (error) =>
      console.error("[TeamChat] idle connection:", error.message),
    );
    runtime = createTeamChatRuntime({
      pool,
      pushDelivery: async (notification) => {
        const { sendPushForNotification } = await import(
          "./pushNotificationService.js"
        );
        return sendPushForNotification(notification);
      },
    });
    runtime.start();
  }
  return runtime;
}
