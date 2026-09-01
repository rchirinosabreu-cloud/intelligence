import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildMinuteStorageKey,
  getMeetingMinutes,
  parseMinuteAnalysis,
  syncFirefliesMinutes
} from '../src/services/minuteAutomationService.js';
import {
  FIREFLIES_MINUTES_INTERVAL_MS,
  initAutomatedMinutesScheduler
} from '../src/services/automatedMinutesScheduler.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('minute analysis accepts JSON wrapped in markdown fences', () => {
  assert.deepEqual(
    parseMinuteAnalysis('```json\n{"executiveSummary":"Acuerdo principal","actionItems":[]}\n```'),
    { executiveSummary: 'Acuerdo principal', actionItems: [] }
  );
});

test('minute artifacts use a stable Bria Drive path', () => {
  assert.equal(
    buildMinuteStorageKey({ meetingId: 'meeting/123', meetingAt: '2026-08-31T15:00:00.000Z', fileName: 'minute.json' }),
    'bria/minutes/2026/meeting_123/minute.json'
  );
});

test('Fireflies synchronization persists searchable data and two Railway artifacts', async () => {
  const writes = [];
  const uploads = [];
  const records = new Map();
  const db = {
    meetingMinute: {
      findUnique: async ({ where }) => records.get(where.externalId) || null,
      create: async ({ data }) => {
        const record = { id: 'minute-1', ...data };
        records.set(data.externalId, record);
        writes.push({ operation: 'create', data });
        return record;
      },
      update: async ({ where, data }) => {
        const current = [...records.values()].find(item => item.id === where.id);
        const record = { ...current, ...data };
        records.set(record.externalId, record);
        writes.push({ operation: 'update', data });
        return record;
      }
    }
  };
  const fireflies = {
    listTranscripts: async () => [{
      id: 'ff-1', title: 'Reunión de campaña', date: '2026-08-31T15:00:00.000Z',
      duration: 3600, organizer_email: 'social@brainstudio.com'
    }],
    getTranscript: async () => ({
      id: 'ff-1', title: 'Reunión de campaña', date: '2026-08-31T15:00:00.000Z',
      duration: 3600, organizer_email: 'social@brainstudio.com',
      participants: ['Ana'], sentences: [{ speaker_name: 'Ana', text: 'Publicamos el viernes.' }]
    })
  };
  const ai = {
    generate: async () => ({
      text: '```json\n{"executiveSummary":"Se acordó publicar el viernes.","participants":[{"name":"Ana","role":null}],"topics":["Campaña"],"decisions":["Publicar el viernes"],"actionItems":[{"task":"Publicar","owner":"Ana","dueDate":"2026-09-04","priority":"ALTA"}],"risks":[],"opportunities":[],"observerSignals":[]}\n```',
      model: 'gpt-5.6-luna',
      requestId: 'req-1'
    })
  };
  const storage = {
    uploadJson: async ({ key, value }) => {
      uploads.push({ key, value });
      return { key, size: Buffer.byteLength(JSON.stringify(value)), mimeType: 'application/json' };
    }
  };

  const result = await syncFirefliesMinutes({ db, fireflies, ai, storage, limit: 10, logger: { info() {}, error() {} } });

  assert.deepEqual(result, { discovered: 1, processed: 1, skipped: 0, failed: 0 });
  assert.equal(uploads.length, 2);
  assert.match(uploads[0].key, /transcript\.json$/);
  assert.match(uploads[1].key, /minute\.json$/);
  assert.equal(writes.at(-1).data.status, 'READY');
  assert.equal(writes.at(-1).data.executiveSummary, 'Se acordó publicar el viernes.');
  assert.equal(writes.at(-1).data.aiModel, 'gpt-5.6-luna');
  assert.equal(writes.at(-1).data.storageProvider, 'RAILWAY');
});

test('Fireflies synchronization is idempotent for ready meetings', async () => {
  let detailCalls = 0;
  const db = {
    meetingMinute: {
      findUnique: async () => ({ id: 'minute-1', externalId: 'ff-1', status: 'READY' })
    }
  };
  const result = await syncFirefliesMinutes({
    db,
    fireflies: {
      listTranscripts: async () => [{ id: 'ff-1' }],
      getTranscript: async () => { detailCalls += 1; }
    },
    ai: {},
    storage: {},
    logger: { info() {}, error() {} }
  });

  assert.deepEqual(result, { discovered: 0, processed: 0, skipped: 1, failed: 0 });
  assert.equal(detailCalls, 0);
});

test('automatic synchronization does not retry an exhausted failed meeting', async () => {
  let detailCalls = 0;
  const result = await syncFirefliesMinutes({
    db: {
      meetingMinute: {
        findUnique: async () => ({ id: 'minute-1', externalId: 'ff-1', status: 'FAILED', retryCount: 3 })
      }
    },
    fireflies: {
      listTranscripts: async () => [{ id: 'ff-1' }],
      getTranscript: async () => { detailCalls += 1; }
    },
    ai: {},
    storage: {},
    logger: { info() {}, error() {} }
  });

  assert.deepEqual(result, { discovered: 0, processed: 0, skipped: 1, failed: 0 });
  assert.equal(detailCalls, 0);
});

test('manual and scheduled synchronization share one in-flight execution', async () => {
  let listCalls = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const options = {
    db: { meetingMinute: { findUnique: async () => null } },
    fireflies: {
      listTranscripts: async () => { listCalls += 1; await pending; return []; }
    },
    ai: {},
    storage: {},
    logger: { info() {}, error() {} }
  };

  const scheduled = syncFirefliesMinutes(options);
  await Promise.resolve();
  const manual = syncFirefliesMinutes(options);
  assert.equal(listCalls, 1);
  release();
  const [scheduledResult, manualResult] = await Promise.all([scheduled, manual]);
  assert.deepEqual(manualResult, scheduledResult);
});

test('minute archive returns newest records without the full transcript payload', async () => {
  let query;
  const rows = [{ id: 'm1', title: 'Reunión', meetingAt: new Date('2026-08-31T15:00:00Z'), status: 'READY' }];
  const result = await getMeetingMinutes({
    status: 'READY',
    limit: 20,
    db: {
      meetingMinute: {
        findMany: async (args) => { query = args; return rows; }
      }
    }
  });

  assert.equal(query.where.status, 'READY');
  assert.deepEqual(query.orderBy, { meetingAt: 'desc' });
  assert.equal(query.take, 20);
  assert.equal(query.select.transcriptText, undefined);
  assert.deepEqual(result, rows);
});

test('automatic minutes poll Fireflies every ten minutes without overlapping runs', async () => {
  assert.equal(FIREFLIES_MINUTES_INTERVAL_MS, 10 * 60_000);
  const intervals = [];
  const timeouts = [];
  let calls = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const timer = () => ({ unref() {} });
  initAutomatedMinutesScheduler({
    syncMinutes: async () => { calls += 1; await pending; },
    setTimeoutFn: (callback, delay) => { timeouts.push({ callback, delay }); return timer(); },
    setIntervalFn: (callback, delay) => { intervals.push({ callback, delay }); return timer(); },
    logger: { info() {}, error() {} }
  });

  assert.equal(timeouts[0].delay, 30_000);
  const interval = intervals.find(item => item.delay === 10 * 60_000);
  const first = interval.callback();
  await Promise.resolve();
  await interval.callback();
  assert.equal(calls, 1);
  release();
  await first;
});

test('minutes schema, protected API and server scheduler are wired', async () => {
  const [schema, routes, server, packageJson, schemaScript] = await Promise.all([
    read('prisma/schema.prisma'),
    read('src/routes/index.js'),
    read('server.js'),
    read('package.json'),
    read('scripts/ensure-meeting-minutes-schema.js')
  ]);
  assert.match(schema, /model MeetingMinute \{/);
  assert.match(schema, /externalId\s+String\s+@unique/);
  assert.match(schema, /transcriptText\s+String/);
  assert.match(routes, /router\.use\('\/minutes',\s*requireModulePermission\('minutas'\),\s*minutesRouter\)/);
  assert.match(server, /initAutomatedMinutesScheduler\(\)/);
  assert.match(packageJson, /ensure-meeting-minutes-schema\.js/);
  assert.match(schemaScript, /CREATE TABLE IF NOT EXISTS "MeetingMinute"/);
  assert.doesNotMatch(schemaScript, /DROP\s+(TABLE|COLUMN)/i);
});

test('Minutes UI presents an automatic Bria archive', async () => {
  const [layout, archive] = await Promise.all([
    read('src/components/modules/Minutes/MinutesLayout.jsx'),
    read('src/components/modules/Minutes/AutomaticMinutesPanel.jsx')
  ]);
  assert.match(layout, /AutomaticMinutesPanel/);
  assert.match(archive, /Archivo automático de Bria/);
  assert.match(archive, /Sincronizar ahora/);
  assert.match(archive, /getAutomatedMinutes/);
});
