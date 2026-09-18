import pg from 'pg';
// Monthly housekeeping for the shared `chat-evidence` bucket: once a task has
// been finished long enough, its attachments stop earning their storage.
//
// The clock starts at Task.completedAt, never at the file's own date, because
// the rule is about finished work. AGENTS.md couples completedAt to the task
// status, so reopening a task clears the date and takes its files out of the
// sweep on their own. Deleted bytes never come back, so every check here fails
// towards keeping the file.
export const DEFAULT_RETENTION_DAYS = 30;
const COMPLETED_STATUS = "REALIZADA";

export const retentionCutoff = (now, days) =>
  new Date(new Date(now).getTime() - days * 24 * 60 * 60 * 1000);

const storageKeyFor = (rawUrl, bucket) => {
  try {
    const url = new URL(rawUrl);
    const configured = new URL(
      process.env.AWS_ENDPOINT_URL || "https://t3.storageapi.dev",
    ).origin;
    if (![configured, "https://t3.storageapi.dev"].includes(url.origin))
      return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== bucket || parts.length < 2) return null;
    return decodeURIComponent(parts.slice(1).join("/"));
  } catch {
    return null;
  }
};

/** Decide a single attachment. Returns why it is kept so a dry run can explain
 * itself instead of printing a bare number. */
export function purgeDecision(
  attachment,
  { now = new Date(), retentionDays = DEFAULT_RETENTION_DAYS, bucket } = {},
) {
  const keep = (reason) => ({ purge: false, reason, id: attachment?.id });

  if (!attachment) return keep("missing-row");
  if (attachment.purgeState && attachment.purgeState !== "ACTIVE")
    return keep("already-handled");
  if (attachment.taskStatus !== COMPLETED_STATUS)
    return keep("task-not-completed");
  // Only files posted in the conversation. A reference dropped straight on the
  // card is part of the task itself, not of the thread that discussed it.
  if (!attachment.commentId) return keep("not-a-conversation-file");
  if (!attachment.completedAt) return keep("no-completion-date");

  const completedAt = new Date(attachment.completedAt);
  if (Number.isNaN(completedAt.getTime())) return keep("no-completion-date");
  // The boundary belongs to the file: exactly at the cutoff it survives.
  if (completedAt >= retentionCutoff(now, retentionDays))
    return keep("inside-window");

  const storageKey = storageKeyFor(
    attachment.url,
    bucket || process.env.AWS_S3_BUCKET_NAME || "chat-evidence",
  );
  // A file we did not store is not ours to delete.
  if (!storageKey) return keep("not-our-storage");

  return { purge: true, id: attachment.id, storageKey };
}

/** Group a set of candidates without touching storage, so the sweep can be
 * inspected before it is ever allowed to run. */
export function summarizePurgePlan(attachments, options = {}) {
  const purgeable = [];
  const kept = {};
  for (const attachment of attachments || []) {
    const decision = purgeDecision(attachment, options);
    if (decision.purge) purgeable.push(decision);
    else kept[decision.reason] = (kept[decision.reason] || 0) + 1;
  }
  return { purgeable, kept, scanned: (attachments || []).length };
}

export const RETENTION_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Reads the switch without interpreting anything as a yes. Anything other
 * than the exact string "true" leaves the sweep off. */
export const retentionEnabled = (env = process.env) =>
  String(env.TASK_ATTACHMENT_RETENTION_ENABLED || "").trim() === "true";

export const retentionDaysFrom = (env = process.env) => {
  const raw = Number(env.TASK_ATTACHMENT_RETENTION_DAYS);
  return Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_RETENTION_DAYS;
};

const candidateSql = (tracked) => `
  SELECT a.id, a.url, a.name, a."commentId", a.category::text AS category,
         ${tracked ? 'a."purgeState"' : `'ACTIVE' AS "purgeState"`},
         t.status::text AS "taskStatus", t."completedAt"
  FROM "TaskAttachment" a
  JOIN "Task" t ON t.id = a."taskId"
  WHERE ${tracked ? `a."purgeState" = 'ACTIVE' AND ` : ""}t.status::text = $1
    AND a."commentId" IS NOT NULL
    AND t."completedAt" IS NOT NULL
    AND t."completedAt" < $2
  ORDER BY t."completedAt" ASC
  LIMIT $3`;

/** The sweep columns arrive with a deploy, but the report has to work before
 * that: without them nothing has been purged yet, so every row is ACTIVE. */
export async function purgeColumnsPresent(pool) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'TaskAttachment' AND column_name = 'purgeState' LIMIT 1`,
  );
  return rows.length > 0;
}

/** Read-only. Never writes, never deletes: this is what a dry run reports. */
export async function collectRetentionCandidates(
  pool,
  { now = new Date(), retentionDays = DEFAULT_RETENTION_DAYS, limit = 200, tracked } = {},
) {
  const hasColumns = tracked ?? (await purgeColumnsPresent(pool));
  const { rows } = await pool.query(candidateSql(hasColumns), [
    COMPLETED_STATUS,
    retentionCutoff(now, retentionDays),
    limit,
  ]);
  return rows;
}

/** The decision is re-checked in JS after the query, so a change to the SQL can
 * never widen what gets deleted without the policy tests noticing. */
export async function reportRetentionPlan(pool, options = {}) {
  const rows = await collectRetentionCandidates(pool, options);
  return summarizePurgePlan(rows, options);
}

/** Two phases, like the chat sweep: claim under a lock, then delete. A crash
 * between them leaves a DELETING row, never a message pointing at nothing. */
export async function runRetentionSweep(pool, storage, options = {}) {
  // Without the tracking columns a purge could not be recorded, and an
  // unrecorded purge would be retried forever. Report, never delete.
  const tracked = options.tracked ?? (await purgeColumnsPresent(pool));
  if (!tracked) {
    console.error(
      "[TaskAttachmentRetention] Faltan las columnas de seguimiento; no se borra nada.",
    );
    return { claimed: 0, purged: 0, restored: 0 };
  }
  const { purgeable } = await reportRetentionPlan(pool, { ...options, tracked });
  if (!purgeable.length) return { claimed: 0, purged: 0, restored: 0 };

  const tx = await pool.connect();
  let claimed = [];
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT pg_advisory_xact_lock(20260918, 2)");
    claimed = (
      await tx.query(
        `UPDATE "TaskAttachment" SET "purgeState"='DELETING'
         WHERE id = ANY($1::text[]) AND "purgeState"='ACTIVE'
         RETURNING id`,
        [purgeable.map((p) => p.id)],
      )
    ).rows;
    await tx.query("COMMIT");
  } catch (error) {
    await tx.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    tx.release();
  }

  const keys = new Map(purgeable.map((p) => [p.id, p.storageKey]));
  let purged = 0;
  let restored = 0;
  for (const { id } of claimed) {
    try {
      await storage.remove(keys.get(id));
      await pool.query(
        `UPDATE "TaskAttachment" SET "purgeState"='PURGED', "purgedAt"=now()
         WHERE id=$1 AND "purgeState"='DELETING'`,
        [id],
      );
      purged += 1;
    } catch (error) {
      // An object already gone is the outcome we wanted; anything else goes
      // back to ACTIVE so the next pass retries instead of stalling forever.
      const missing = /NoSuchKey|NotFound|404/.test(
        error?.Code || error?.name || error?.message || "",
      );
      await pool.query(
        `UPDATE "TaskAttachment"
         SET "purgeState"=$2, "purgedAt"=CASE WHEN $2='PURGED' THEN now() ELSE NULL END
         WHERE id=$1 AND "purgeState"='DELETING'`,
        [id, missing ? "PURGED" : "ACTIVE"],
      );
      if (missing) purged += 1;
      else {
        restored += 1;
        console.error("[TaskAttachmentRetention] purge failed:", error?.message);
      }
    }
  }
  return { claimed: claimed.length, purged, restored };
}

/** Off unless TASK_ATTACHMENT_RETENTION_ENABLED is exactly "true". Deployment
 * alone never starts deleting: the first run removes the whole backlog older
 * than the window, so switching it on is a deliberate act. */
export function initTaskAttachmentRetentionScheduler({
  pool,
  storage,
  env = process.env,
  setIntervalFn = setInterval,
} = {}) {
  if (!retentionEnabled(env)) {
    console.log(
      "[TaskAttachmentRetention] Desactivado. Actívalo con TASK_ATTACHMENT_RETENTION_ENABLED=true tras revisar el informe.",
    );
    return null;
  }
  if (!pool || !storage) {
    console.error("[TaskAttachmentRetention] Falta pool o storage; no se programa.");
    return null;
  }
  const retentionDays = retentionDaysFrom(env);
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runRetentionSweep(pool, storage, { retentionDays });
      if (result.claimed)
        console.log(
          `[TaskAttachmentRetention] ${result.purged} archivos eliminados, ${result.restored} reintentables.`,
        );
    } catch (error) {
      console.error("[TaskAttachmentRetention] Barrido fallido:", error.message);
    } finally {
      running = false;
    }
  };
  const timer = setIntervalFn(() => void sweep(), RETENTION_SWEEP_INTERVAL_MS);
  timer.unref?.();
  console.log(
    `[TaskAttachmentRetention] Activo: archivos de tareas realizadas hace mas de ${retentionDays} dias.`,
  );
  return timer;
}

/** Wires the real pool and bucket. Kept separate from the scheduler above so
 * the policy stays testable without a database or a network. */
export function startTaskAttachmentRetention(env = process.env) {
  if (!retentionEnabled(env)) return initTaskAttachmentRetentionScheduler({ env });
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
  pool.on("error", (error) =>
    console.error("[TaskAttachmentRetention] idle connection:", error.message),
  );
  const storage = {
    remove: async (key) => {
      const { deleteFromS3 } = await import("./s3Service.js");
      return deleteFromS3(key);
    },
  };
  return initTaskAttachmentRetentionScheduler({ pool, storage, env });
}

