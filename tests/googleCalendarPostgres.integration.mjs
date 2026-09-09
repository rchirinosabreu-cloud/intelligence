// Opt-in only: never use .env or DATABASE_URL as a test database fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { spawn } from 'node:child_process';
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('TEST_DATABASE_URL is required (isolated localhost test DB only).');
const target = new URL(testUrl);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/calendar_sync_test' || target.port !== '55439') {
  throw new Error('Refusing a database outside the dedicated local calendar test container.');
}
process.env.DATABASE_URL = testUrl;
const { default: db } = await import('../src/lib/prisma.js');
const { withCalendarSyncLock } = await import('../src/services/calendarSyncLock.js');
const service = await import('../src/services/operationalEventService.js');
const repair = await import('../src/services/calendarDuplicateRepair.js');
const pool = new pg.Pool({ connectionString: testUrl });
const prefix = `integration-${Date.now()}`;
const connection = async suffix => db.googleCalendarConnection.create({ data: {
  id: `${prefix}-${suffix}`, email: `${prefix}-${suffix}@example.test`, encryptedTokens: 'unused', calendarId: 'primary'
} });
const googleEvent = suffix => ({ id: `${prefix}-event-${suffix}`, iCalUID: `${prefix}-uid-${suffix}`,
  summary: 'Isolated Calendar integration', start: { dateTime: '2026-09-10T14:00:00Z' },
  end: { dateTime: '2026-09-10T15:00:00Z' }, updated: '2026-09-07T10:00:00Z', etag: 'v1',
  organizer: { email: 'organizer@example.test' }, attendees: [] });

test.after(async () => {
  await db.operationalEvent.deleteMany({ where: { OR: [{ googleICalUID: { startsWith: prefix } }, { requestId: { startsWith: prefix } }] } });
  await db.googleCalendarConnection.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.$disconnect(); await pool.end();
});

test('PostgreSQL rejects a competing process while a shared calendar lock is held', async () => {
  await withCalendarSyncLock(async () => {
    const childCode = `import { withCalendarSyncLock } from './src/services/calendarSyncLock.js';
      try { await withCalendarSyncLock(async()=>{}); process.exitCode=2; }
      catch(e) { process.exitCode=e.code==='GOOGLE_CALENDAR_BUSY'?0:3; }`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', childCode], { env: { ...process.env, DATABASE_URL: testUrl }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    assert.equal(code, 0, output);
  });
  await withCalendarSyncLock(async () => assert.ok(true));
});

test('two account notifications import one row and two links with real unique constraints', async () => {
  const a = await connection('a'); const b = await connection('b'); const event = googleEvent('shared');
  const attempt = candidate => withCalendarSyncLock(() => service.importGoogleCalendarEvent(event, candidate, [], db));
  const firstPass = await Promise.allSettled([attempt(a), attempt(b)]);
  assert.ok(firstPass.some(result => result.status === 'fulfilled'));
  if (firstPass[0].status === 'rejected') await attempt(a);
  if (firstPass[1].status === 'rejected') await attempt(b);
  const rows = await db.operationalEvent.findMany({ where: { googleICalUID: event.iCalUID }, include: { googleLinks: true } });
  assert.equal(rows.length, 1); assert.equal(rows[0].googleLinks.length, 2);
});

test('event/link import rolls back when PostgreSQL rejects the link foreign key', async () => {
  const event = googleEvent('rollback');
  await assert.rejects(withCalendarSyncLock(() => service.importGoogleCalendarEvent(event, { id: `${prefix}-missing`, email: 'missing@example.test', calendarId: 'primary' }, [], db)));
  assert.equal(await db.operationalEvent.count({ where: { googleICalUID: event.iCalUID } }), 0);
});

test('durable request retries return the same row after local and remote persistence', async () => {
  const a = await connection('write'); let inserts = 0; const remote = new Map();
  const authorize = async () => ({ connection: a });
  const calendar = { events: {
    get: async ({ eventId }) => { if (!remote.has(eventId)) throw { code: 404 }; return { data: remote.get(eventId) }; },
    insert: async ({ requestBody }) => { inserts++; const result = { ...requestBody, iCalUID: `${prefix}-write`, etag: 'etag', organizer: { email: a.email } }; remote.set(result.id, result); throw { code: 'ECONNRESET' }; }
  } };
  const deps = { db, authorize, resolveCreationTarget: async () => ({ calendarId: 'primary' }), now: () => new Date('2026-09-01T00:00:00Z'), syncToGoogle: event => service.syncOperationalEventToGoogle(event, { db, authorize, createCalendar: () => calendar }) };
  const input = { requestId: `${prefix}-request`, googleConnectionId: a.id, title: 'Intent', type: 'PROJECT', startAt: '2026-09-10T14:00:00Z', endAt: '2026-09-10T15:00:00Z' };
  const first = await service.createOperationalEvent(input, null, deps);
  const second = await service.createOperationalEvent(input, null, deps);
  assert.equal(first.googleSyncStatus, 'SYNCED'); assert.equal(first.id, second.id); assert.equal(inserts, 1);
  assert.equal(await db.operationalEvent.count({ where: { requestId: input.requestId } }), 1);
});

test('duplicate repair and reversal preserve every row and link in PostgreSQL', async () => {
  const a = await connection('repair-a'); const b = await connection('repair-b'); const event = googleEvent('repair');
  await withCalendarSyncLock(() => service.importGoogleCalendarEvent(event, a, [], db));
  const original = await db.operationalEvent.findFirst({ where: { googleICalUID: event.iCalUID } });
  const duplicate = await db.operationalEvent.create({ data: { ...original, id: `${prefix}-copy`, googleConnectionId: b.id } });
  await db.googleCalendarEventLink.create({ data: { operationalEventId: duplicate.id, connectionId: b.id, calendarId: 'primary', googleEventId: event.id, googleICalUID: event.iCalUID } });
  const read = () => db.operationalEvent.findMany({ where: { googleICalUID: event.iCalUID }, include: { googleLinks: true } });
  const plan = repair.planCalendarDuplicateRepair(await read());
  assert.equal(plan.mergeCount, 1);
  const receipt = await repair.applyCalendarDuplicateRepair(plan, { db });
  const merged = await read(); assert.equal(merged.length, 2); assert.equal(merged.filter(row => row.googleSyncStatus === 'MERGED').length, 1);
  assert.equal(merged.flatMap(row => row.googleLinks).length, 2);
  await repair.revertCalendarDuplicateRepair(receipt, { db });
  assert.ok((await read()).every(row => row.googleSyncStatus === 'SYNCED' && row.googleLinks.length === 1));
});
