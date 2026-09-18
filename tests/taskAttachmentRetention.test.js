import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RETENTION_DAYS,
  retentionCutoff,
  purgeDecision,
  summarizePurgePlan,
  runRetentionSweep,
  retentionEnabled,
  retentionDaysFrom,
  initTaskAttachmentRetentionScheduler,
} from "../src/services/taskAttachmentRetentionService.js";

const now = new Date("2026-09-18T12:00:00Z");
const bucket = "chat-evidence";
const stored = (key) => `https://t3.storageapi.dev/${bucket}/${key}`;

const done = (over) => ({
  id: "a1",
  url: stored("tasks/foto.png"),
  purgeState: "ACTIVE",
  taskStatus: "REALIZADA",
  completedAt: new Date("2026-08-01T12:00:00Z"),
  ...over,
});

const decide = (row) => purgeDecision(row, { now, retentionDays: DEFAULT_RETENTION_DAYS, bucket });

test("the retention window is measured from when the task was completed", () => {
  assert.equal(retentionCutoff(now, 30).toISOString(), "2026-08-19T12:00:00.000Z");
  assert.equal(decide(done()).purge, true);
  assert.equal(
    decide(done({ completedAt: new Date("2026-09-10T12:00:00Z") })).purge,
    false,
    "A task completed nine days ago is still inside the window",
  );
});

test("the boundary belongs to the file: exactly 30 days old is kept", () => {
  assert.equal(decide(done({ completedAt: retentionCutoff(now, 30) })).purge, false);
  assert.equal(
    decide(done({ completedAt: new Date(retentionCutoff(now, 30).getTime() - 1) })).purge,
    true,
  );
});

test("only completed tasks are swept", () => {
  for (const taskStatus of ["PENDIENTE", "EN_PROCESO", "DEVUELTA"]) {
    const decision = decide(done({ taskStatus }));
    assert.equal(decision.purge, false, `${taskStatus} must be kept`);
    assert.equal(decision.reason, "task-not-completed");
  }
});

test("a reopened task is never swept, because completedAt goes back to null", () => {
  const decision = decide(done({ taskStatus: "PENDIENTE", completedAt: null }));
  assert.equal(decision.purge, false);
  assert.equal(decision.reason, "task-not-completed");
});

test("a completed task with no completion date is left alone instead of guessed", () => {
  const decision = decide(done({ completedAt: null }));
  assert.equal(decision.purge, false);
  assert.equal(decision.reason, "no-completion-date");
});

test("work already purged is not touched again", () => {
  assert.equal(decide(done({ purgeState: "PURGED" })).reason, "already-handled");
  assert.equal(decide(done({ purgeState: "DELETING" })).reason, "already-handled");
});

test("only files that live in our own bucket are deleted", () => {
  assert.equal(decide(done({ url: "https://example.com/otro/foto.png" })).purge, false);
  assert.equal(decide(done({ url: "https://t3.storageapi.dev/otro-bucket/foto.png" })).purge, false);
  assert.equal(decide(done({ url: "no es una url" })).reason, "not-our-storage");
  assert.equal(decide(done({ url: null })).reason, "not-our-storage");
});

test("a purgeable row carries the exact storage key to delete", () => {
  const decision = decide(done({ url: stored("tasks/2026/mi%20foto.png") }));
  assert.equal(decision.purge, true);
  assert.equal(decision.storageKey, "tasks/2026/mi foto.png");
});

// A pool double that answers the candidate query and records every write, so
// the two-phase sweep can be checked without a database.
function poolDouble(candidates) {
  const writes = [];
  const state = new Map(candidates.map((c) => [c.id, c.purgeState || "ACTIVE"]));
  const client = {
    query: async (sql, params) => {
      writes.push(sql.trim().split("\n")[0]);
      if (/SET "purgeState"='DELETING'/.test(sql)) {
        const claimed = params[0].filter((id) => state.get(id) === "ACTIVE");
        for (const id of claimed) state.set(id, "DELETING");
        return { rows: claimed.map((id) => ({ id })) };
      }
      return { rows: [] };
    },
    release: () => {},
  };
  return {
    state,
    writes,
    connect: async () => client,
    query: async (sql, params) => {
      if (/FROM "TaskAttachment"/.test(sql) && /SELECT/.test(sql))
        return { rows: candidates };
      if (/SET "purgeState"='PURGED'/.test(sql)) {
        state.set(params[0], "PURGED");
        return { rows: [] };
      }
      if (/SET "purgeState"=\$2/.test(sql)) {
        state.set(params[0], params[1]);
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

test("the sweep claims before deleting, and only then marks the row purged", async () => {
  const pool = poolDouble([done({ id: "1" }), done({ id: "2", url: stored("b.pdf") })]);
  const removed = [];
  const result = await runRetentionSweep(
    pool,
    { remove: async (key) => removed.push(key) },
    { now, retentionDays: DEFAULT_RETENTION_DAYS, bucket },
  );

  assert.deepEqual(result, { claimed: 2, purged: 2, restored: 0 });
  assert.deepEqual(removed, ["tasks/foto.png", "b.pdf"]);
  assert.equal(pool.state.get("1"), "PURGED");
  assert.ok(
    pool.writes.some((w) => /pg_advisory_xact_lock/.test(w)),
    "The claim runs under the same kind of lock the chat sweep uses",
  );
});

test("a storage failure puts the row back so the next pass retries it", async () => {
  const pool = poolDouble([done({ id: "1" })]);
  const result = await runRetentionSweep(
    pool,
    { remove: async () => { throw new Error("connection reset"); } },
    { now, retentionDays: DEFAULT_RETENTION_DAYS, bucket },
  );

  assert.deepEqual(result, { claimed: 1, purged: 0, restored: 1 });
  assert.equal(pool.state.get("1"), "ACTIVE", "It is never left stuck in DELETING");
});

test("an object already gone counts as done instead of retrying forever", async () => {
  const pool = poolDouble([done({ id: "1" })]);
  const result = await runRetentionSweep(
    pool,
    { remove: async () => { throw Object.assign(new Error("gone"), { Code: "NoSuchKey" }); } },
    { now, retentionDays: DEFAULT_RETENTION_DAYS, bucket },
  );

  assert.equal(result.purged, 1);
  assert.equal(pool.state.get("1"), "PURGED");
});

test("nothing is claimed when no file has aged out", async () => {
  const pool = poolDouble([done({ id: "1", taskStatus: "PENDIENTE" })]);
  let touched = false;
  const result = await runRetentionSweep(
    pool,
    { remove: async () => { touched = true; } },
    { now, retentionDays: DEFAULT_RETENTION_DAYS, bucket },
  );

  assert.deepEqual(result, { claimed: 0, purged: 0, restored: 0 });
  assert.equal(touched, false, "Storage is never called on an empty plan");
});

test("the plan can be summarized without deleting anything", () => {
  const plan = summarizePurgePlan(
    [
      done({ id: "1" }),
      done({ id: "2", url: stored("tasks/otro.pdf") }),
      done({ id: "3", taskStatus: "PENDIENTE" }),
      done({ id: "4", purgeState: "PURGED" }),
    ],
    { now, retentionDays: DEFAULT_RETENTION_DAYS, bucket },
  );

  assert.equal(plan.purgeable.length, 2);
  assert.deepEqual(plan.purgeable.map((p) => p.id), ["1", "2"]);
  assert.equal(plan.kept["task-not-completed"], 1);
  assert.equal(plan.kept["already-handled"], 1);
});

test("deleting is off unless it is switched on explicitly", () => {
  assert.equal(retentionEnabled({}), false, "Deploying alone never starts deleting");
  for (const value of ["", "false", "0", "no", "TRUE", "yes", "1"])
    assert.equal(retentionEnabled({ TASK_ATTACHMENT_RETENTION_ENABLED: value }), false, value);
  assert.equal(retentionEnabled({ TASK_ATTACHMENT_RETENTION_ENABLED: "true" }), true);
  // Stray whitespace around an env var must not silently disable the switch.
  assert.equal(retentionEnabled({ TASK_ATTACHMENT_RETENTION_ENABLED: " true " }), true);
});

test("an unusable retention setting falls back to the default instead of zero", () => {
  assert.equal(retentionDaysFrom({}), DEFAULT_RETENTION_DAYS);
  for (const value of ["", "abc", "0", "-5"])
    assert.equal(retentionDaysFrom({ TASK_ATTACHMENT_RETENTION_DAYS: value }), DEFAULT_RETENTION_DAYS, value);
  assert.equal(retentionDaysFrom({ TASK_ATTACHMENT_RETENTION_DAYS: "180" }), 180);
});

test("the scheduler stays idle while the switch is off", () => {
  let scheduled = 0;
  const timer = initTaskAttachmentRetentionScheduler({
    pool: {}, storage: {}, env: {},
    setIntervalFn: () => { scheduled += 1; return { unref() {} }; },
  });
  assert.equal(timer, null);
  assert.equal(scheduled, 0, "Nothing is scheduled, so nothing can delete");
});

test("the scheduler refuses to run without a pool and storage", () => {
  const env = { TASK_ATTACHMENT_RETENTION_ENABLED: "true" };
  const setIntervalFn = () => ({ unref() {} });
  assert.equal(initTaskAttachmentRetentionScheduler({ env, setIntervalFn, storage: {} }), null);
  assert.equal(initTaskAttachmentRetentionScheduler({ env, setIntervalFn, pool: {} }), null);
  assert.notEqual(
    initTaskAttachmentRetentionScheduler({ env, setIntervalFn, pool: {}, storage: {} }),
    null,
    "With the switch on and both dependencies it does schedule",
  );
});
