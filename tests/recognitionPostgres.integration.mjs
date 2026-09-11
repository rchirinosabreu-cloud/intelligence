import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { ensureRecognitionsSchema } from '../scripts/ensure-recognitions-schema.js';
import { recognitionTransaction, prepareTaskRecognition, finishTaskRecognition, recordPlanRecognition, attachTaskRecognitions, claimRecognition, acknowledgeRecognition } from '../src/services/recognitionService.js';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL required; never load .env.');
const target = new URL(url);
if (target.hostname !== '127.0.0.1' || target.port !== '55448' || target.pathname !== '/recognition_test' || target.username !== 'recognition_test') throw new Error('Refusing non-isolated recognition database.');
const sql = new pg.Client({ connectionString: url });
const db = new PrismaClient({ datasources: { db: { url } } });
const tables = ['User', 'TeamMember', 'Client', 'Task', 'TaskWorkCycle', 'ContentPlan', 'ContentItem', 'TaskComment', 'TaskAttachment', 'TaskFollower', 'TaskWorkSession', 'TaskCommentReaction', 'OperationalTraceEvent', 'Notification', 'PushSubscription', 'ContentItemFinalAsset'];
let member, other, client;
test.before(async () => {
  await sql.connect();
  const ddl = await readFile('output/recognition-test-schema.sql', 'utf8');
  for (const [statement, name] of ddl.matchAll(/CREATE TYPE "([^"]+)" AS ENUM \([\s\S]*?\);/g)) {
    if (!(await sql.query('SELECT 1 FROM pg_type WHERE typname = $1', [name])).rowCount) await sql.query(statement);
  }
  for (const [statement, name] of ddl.matchAll(/CREATE TABLE "([^"]+)" \([\s\S]*?\n\);/g)) {
    if (tables.includes(name) && !(await sql.query('SELECT to_regclass($1) AS r', [`"${name}"`])).rows[0].r) await sql.query(statement);
  }
  await ensureRecognitionsSchema(sql);
  // Destructive reset is limited by the exact dedicated cluster guard above.
  await sql.query('TRUNCATE "RecognitionAward", "RecognitionDebtState", "RecognitionTaskState", "RecognitionPlanState", "TaskWorkCycle", "Task", "ContentItem", "ContentPlan", "TeamMember", "User", "Client", "TaskComment", "TaskAttachment", "TaskFollower", "TaskWorkSession", "TaskCommentReaction", "OperationalTraceEvent", "Notification", "PushSubscription", "ContentItemFinalAsset" CASCADE');
  const user = async name => {
    const u = await db.user.create({ data: { name, email: `${randomUUID()}@example.invalid`, password: 'not-a-login', role: 'EDITOR', modulePermissions: { gestion: true, parrillas: true, dashboard: true } } });
    return db.teamMember.create({ data: { name, role: 'Prueba', userId: u.id } });
  };
  member = await user('Primera persona'); other = await user('Otra persona');
  client = await db.client.create({ data: { name: 'Prueba aislada', slug: randomUUID() } });
});
test.after(async () => { await db.$disconnect(); await sql.end(); });
const task = async (extra = {}) => db.task.create({ data: { title: 'Tarea de prueba', clientId: client.id, assigneeId: member.id, ...extra } });
const mutate = (id, data, at) => recognitionTransaction(db, async tx => {
  const before = await prepareTaskRecognition(tx, id, at);
  const updated = await tx.task.update({ where: { id }, data: { ...data, ...('status' in data ? { completedAt: data.status === 'REALIZADA' ? at : null } : {}) } });
  await finishTaskRecognition(tx, before, updated, at);
  return updated;
});
const complete = (id, at) => mutate(id, { status: 'REALIZADA' }, new Date(at));
const awards = (where = {}) => db.recognitionAward.findMany({ where });

test('additive bootstrap preserves task history, seeds first completions and emits no retroactive award', async () => {
  const old = await task({ status: 'REALIZADA', completedAt: new Date('2026-09-01T16:00:00Z') });
  await ensureRecognitionsSchema(sql); await ensureRecognitionsSchema(sql);
  assert.equal((await db.task.findUnique({ where: { id: old.id } })).completedAt.toISOString(), '2026-09-01T16:00:00.000Z');
  assert.equal((await awards()).length, 0);
  await mutate(old.id, { status: 'PENDIENTE' }, new Date('2026-09-02T12:00:00Z'));
  await complete(old.id, '2026-09-02T13:00:00Z');
  assert.equal((await awards({ taskId: old.id })).length, 0);
});
test('concurrent completion has one team opener and rolls back an award with its task', async () => {
  const a = await task(), b = await task({ assigneeId: other.id });
  await Promise.all([complete(a.id, '2026-10-01T13:00:00Z'), complete(b.id, '2026-10-01T13:00:00Z')]);
  assert.equal((await awards({ kind: 'FIRST_TASK', dayKey: '2026-10-01' })).length, 1);
  const c = await task();
  await assert.rejects(recognitionTransaction(db, async tx => {
    const at = new Date('2026-10-02T13:00:00Z');
    const before = await prepareTaskRecognition(tx, c.id, at);
    const after = await tx.task.update({ where: { id: c.id }, data: { status: 'REALIZADA', completedAt: at } });
    await finishTaskRecognition(tx, before, after, at);
    throw new Error('Rollback intentionally');
  }), /Rollback intentionally/);
  assert.equal((await awards({ taskId: c.id })).length, 0);
  assert.equal((await db.task.findUnique({ where: { id: c.id } })).status, 'PENDIENTE');
});
test('eight daily and fifty weekly count distinct first completions, never reopens or reassignments', async () => {
  const ids = [];
  for (let i = 0; i < 50; i++) {
    const t = await task(); ids.push(t.id);
    await complete(t.id, `2026-11-${String(2 + Math.floor(i / 10)).padStart(2, '0')}T15:00:00Z`);
    if (i === 6) assert.equal((await awards({ kind: 'DAILY_EIGHT', dayKey: '2026-11-02' })).length, 0);
    if (i === 48) assert.equal((await awards({ kind: 'WEEKLY_FIFTY', weekKey: '2026-11-02' })).length, 0);
  }
  assert.equal((await awards({ kind: 'DAILY_EIGHT', dayKey: '2026-11-02' })).length, 1);
  assert.equal((await awards({ kind: 'WEEKLY_FIFTY', weekKey: '2026-11-02' })).length, 1);
  await mutate(ids[0], { status: 'PENDIENTE' }, new Date('2026-11-07T15:00:00Z'));
  await complete(ids[0], '2026-11-07T16:00:00Z');
  await mutate(ids[1], { assigneeId: other.id }, new Date('2026-11-07T17:00:00Z'));
  assert.equal(await db.recognitionTaskState.count({ where: { recipientId: member.userId, weekKey: '2026-11-02' } }), 50);
  assert.equal((await awards({ kind: 'FIRST_TASK', dayKey: '2026-11-07' })).length, 0);
});
test('early delivery requires an earlier calendar day and cannot be manufactured by moving the deadline', async () => {
  const early = await task({ dueDate: new Date('2026-12-03T00:00:00Z') });
  await complete(early.id, '2026-12-02T15:00:00Z');
  assert.equal((await awards({ kind: 'EARLY_DELIVERY', taskId: early.id })).length, 1);
  const same = await task({ dueDate: new Date('2026-12-02T00:00:00Z') });
  await mutate(same.id, { dueDate: new Date('2026-12-10T00:00:00Z'), status: 'REALIZADA' }, new Date('2026-12-02T15:00:00Z'));
  assert.equal((await awards({ kind: 'EARLY_DELIVERY', taskId: same.id })).length, 0);
});
test('caught up requires completing the overdue set, not deleting, postponing or reassigning it', async () => {
  const run = async (day, invalidation) => {
    const a = await task({ dueDate: new Date(`2027-01-${String(day - 1).padStart(2, '0')}T00:00:00Z`) });
    const b = await task({ dueDate: a.dueDate });
    const at = new Date(`2027-01-${day}T15:00:00Z`);
    if (invalidation === 'delete') await recognitionTransaction(db, async tx => { const before = await prepareTaskRecognition(tx, a.id, at); await tx.task.delete({ where: { id: a.id } }); await finishTaskRecognition(tx, before, null, at); });
    else if (invalidation === 'postpone') await mutate(a.id, { dueDate: new Date('2027-02-01T00:00:00Z') }, at);
    else if (invalidation === 'reassign') await mutate(a.id, { assigneeId: other.id }, at);
    else await complete(a.id, at);
    await complete(b.id, at);
    assert.equal((await awards({ kind: 'CAUGHT_UP', dayKey: `2027-01-${day}`, recipientId: member.userId })).length, invalidation ? 0 : 1);
    // Isolated fixtures no longer participate in later episodes.
    await db.task.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  };
  await run(10); await run(11, 'delete'); await run(12, 'postpone'); await run(13, 'reassign');
});
test('plan approval is persisted once for the owner, never empty/partial/deleted/ownerless', async () => {
  const plan = await db.contentPlan.create({ data: { clientId: client.id, month: 2, year: 2027, ownerId: member.id } });
  const piece = async status => db.contentItem.create({ data: { planId: plan.id, objective: 'Pieza', format: 'Post', copyText: '', captionText: '', publishDate: new Date(), status } });
  const a = await piece('EN_REVISION'), b = await piece('EN_REVISION');
  const approve = id => recognitionTransaction(db, async tx => {
    const item = await tx.contentItem.update({ where: { id }, data: { status: 'APROBADO' } });
    await recordPlanRecognition(tx, item.planId, new Date('2027-02-01T15:00:00Z'));
  });
  await approve(a.id); assert.equal((await awards({ planId: plan.id })).length, 0);
  await Promise.all([approve(b.id), approve(b.id)]);
  const stored = await awards({ planId: plan.id });
  assert.equal(stored.length, 1); assert.equal(stored[0].recipientId, member.userId); assert.equal(stored[0].taskId, null);
  await approve(a.id); assert.equal((await awards({ planId: plan.id })).length, 1);
  const ownerless = await db.contentPlan.create({ data: { clientId: client.id, month: 3, year: 2027 } });
  await recognitionTransaction(db, tx => recordPlanRecognition(tx, ownerless.id));
  assert.equal((await awards({ planId: ownerless.id })).length, 0);
});
test('history labels use explicit task and user identity and preserve plain tasks', async () => {
  const t = await task(); await complete(t.id, '2027-03-02T13:00:00Z');
  const plain = await task();
  const rows = await db.task.findMany({ where: { id: { in: [t.id, plain.id] } }, include: { assignee: true } });
  const decorated = await attachTaskRecognitions(db, rows);
  assert.equal(decorated.find(x => x.id === t.id).recognitions[0].kind, 'FIRST_TASK');
  assert.deepEqual(decorated.find(x => x.id === plain.id).recognitions, []);
  await db.task.update({ where: { id: t.id }, data: { assigneeId: other.id } });
  const moved = await db.task.findUnique({ where: { id: t.id }, include: { assignee: true } });
  assert.deepEqual((await attachTaskRecognitions(db, [moved]))[0].recognitions, []);
});
test('delivery claims are per recipient, exclusive across sessions, acknowledged persistently and retry expired leases', async () => {
  const at = new Date();
  const t = await task(); await complete(t.id, at);
  const [a, b] = await Promise.all([claimRecognition(db, member.userId, at), claimRecognition(db, member.userId, at)]);
  const claimed = a || b;
  assert.ok(claimed); assert.equal([a, b].filter(Boolean).length, 1);
  await assert.rejects(acknowledgeRecognition(db, other.userId, claimed.id, claimed.leaseToken, at), error => error.statusCode === 404);
  await assert.rejects(acknowledgeRecognition(db, member.userId, claimed.id, 'wrong-token', at), error => error.statusCode === 409);
  await acknowledgeRecognition(db, member.userId, claimed.id, claimed.leaseToken, at);
  assert.ok((await db.recognitionAward.findUnique({ where: { id: claimed.id } })).seenAt);
  assert.equal(await claimRecognition(db, member.userId, at), null, 'no old or future awards replayed');

  const later = new Date(at.getTime() + 120000);
  const pending = await task({ dueDate: new Date(later.getTime() + 172800000) });
  await complete(pending.id, later);
  const lease = await claimRecognition(db, member.userId, later);
  assert.ok(lease);
  const expiredAt = new Date(later.getTime() + 61000);
  await assert.rejects(acknowledgeRecognition(db, member.userId, lease.id, lease.leaseToken, expiredAt), error => error.statusCode === 409);
  const retried = await claimRecognition(db, member.userId, expiredAt);
  assert.equal(retried.id, lease.id); assert.notEqual(retried.leaseToken, lease.leaseToken);
  await db.task.update({ where: { id: pending.id }, data: { status: 'PENDIENTE', completedAt: null } });
  await assert.rejects(acknowledgeRecognition(db, member.userId, retried.id, retried.leaseToken, expiredAt), error => error.statusCode === 409);
  assert.equal((await db.recognitionAward.findUnique({ where: { id: retried.id } })).seenAt, null);
});

test('real native task completion reaches authenticated API and production popup, survives reload without replay', async () => {
  globalThis.prisma = db;
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = 'isolated-recognition-test-secret-not-for-production-2026';
  const { updateTask } = await import('../src/services/nativeTaskService.js');
  const { updateContentItem, addClientComment } = await import('../src/services/contentService.js');
  const { authenticateToken } = await import('../src/middlewares/authMiddleware.js');
  const { createRecognitionHandlers } = await import('../src/controllers/recognitionController.js');
  const { default: express } = await import('express');
  const { default: jwt } = await import('jsonwebtoken');
  const { createServer } = await import('vite');
  const { chromium } = await import('playwright-core');
  const { mkdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const u = await db.user.create({ data: { name: 'Rodny · Prueba aislada', email: `${randomUUID()}@example.invalid`, password: 'not-a-login', role: 'EDITOR', modulePermissions: { gestion: true } } });
  const m = await db.teamMember.create({ data: { name: u.name, role: 'Prueba', userId: u.id } });
  const plan = await db.contentPlan.create({ data: { clientId: client.id, month: 9, year: 2028, ownerId: m.id } });
  const piece = status => db.contentItem.create({ data: { planId: plan.id, objective: 'Integración de aprobación', format: 'Post', copyText: '', captionText: '', publishDate: new Date(), status } });
  const a = await piece('EN_REVISION'), b = await piece('EN_REVISION');
  await updateContentItem(a.id, { status: 'APROBADO' });
  assert.equal((await awards({ planId: plan.id })).length, 0);
  await addClientComment(a.id, 'Necesita un ajuste');
  assert.deepEqual((await db.recognitionPlanState.findUnique({ where: { planId: plan.id } })).approvedIds, []);
  await updateContentItem(a.id, { status: 'EN_PRODUCCION' });
  await updateContentItem(b.id, { status: 'APROBADO' });
  assert.equal((await awards({ planId: plan.id })).length, 0, 'production is not proof of approval after a return');
  await updateContentItem(a.id, { status: 'APROBADO' });
  assert.equal((await awards({ planId: plan.id, recipientId: u.id })).length, 1);
  assert.equal(await claimRecognition(db, u.id), null, 'no plan notice without current parrillas permission');
  const t = await task({ assigneeId: m.id, dueDate: new Date(Date.now() + 172800000) });
  const updated = await updateTask(t.id, { status: 'Realizado' }, u.id);
  assert.equal(updated.status, 'REALIZADA');
  const saved = await awards({ taskId: t.id, kind: 'EARLY_DELIVERY' });
  assert.equal(saved.length, 1);
  const api = express(); api.use(express.json());
  api.get('/test/session', (_req, res) => res.json({ userId: u.id, token: jwt.sign({ userId: u.id, sessionVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '10m' }) }));
  const handlers = createRecognitionHandlers(db);
  api.post('/api/recognitions/claim', authenticateToken, handlers.claim);
  api.post('/api/recognitions/:id/acknowledge', authenticateToken, handlers.acknowledge);
  const vite = await createServer({ configFile: false, root: process.cwd(), envDir: path.resolve('tests/fixtures'), cacheDir: path.resolve('node_modules/.vite-recognition-live-test'), logLevel: 'error', appType: 'mpa',
    define: { 'import.meta.env.VITE_API_URL': 'window.location.origin' }, resolve: { alias: { '@': path.resolve('src') } }, esbuild: { jsx: 'automatic' },
    server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'live-api', configureServer(server) { server.middlewares.use(api); } }] });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/tests/fixtures/recognition-live.html`);
    const notice = page.getByRole('status', { name: 'Reconocimiento personal' });
    await notice.waitFor({ timeout: 45000 });
    assert.match(await notice.innerText(), /Entrega anticipada/);
    assert.doesNotMatch(await notice.innerText(), /Ejemplo local/);
    assert.ok((await db.recognitionAward.findUnique({ where: { id: saved[0].id } })).seenAt);
    await mkdir('output/recognitions', { recursive: true });
    await page.screenshot({ path: 'output/recognitions/real-api-popup.png' });
    await page.getByRole('button', { name: 'Cerrar reconocimiento' }).click();
    await notice.waitFor({ state: 'hidden' });
    await page.reload();
    await page.getByText('Integración real · Base de prueba', { exact: true }).waitFor();
    await page.waitForTimeout(4500);
    assert.equal(await notice.count(), 0);
    assert.deepEqual(errors, []);
    const unauthenticated = await fetch(`${origin}/api/recognitions/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(unauthenticated.status, 401);
  } finally { await browser.close(); await vite.close(); }
});
