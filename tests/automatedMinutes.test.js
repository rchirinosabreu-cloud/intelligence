import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildMinuteStorageKey,
  getMeetingMinutes,
  parseMinuteAnalysis,
  permanentlyDeleteMeetingMinute,
  restoreMeetingMinute,
  trashMeetingMinute,
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

test('future minute analysis separates durable knowledge from genuinely actionable Observer alerts', async () => {
  const automationSource = await read('src/services/minuteAutomationService.js');

  assert.match(automationSource, /knowledgeItems/);
  assert.match(automationSource, /CLIENT_PREFERENCE/);
  assert.match(automationSource, /BRAND_RULE/);
  assert.match(automationSource, /actionable/);
  assert.match(automationSource, /suggestedAction/);
  assert.match(automationSource, /Solo marca actionable como true/i);
  assert.match(automationSource, /conocimiento histórico/i);
});

test('minute artifacts use a stable Bria Drive path', () => {
  assert.equal(
    buildMinuteStorageKey({ meetingId: 'meeting/123', meetingAt: '2026-08-31T15:00:00.000Z', fileName: 'minute.json' }),
    'bria/minutes/2026/meeting_123/minute.json'
  );
});

test('ready minutes are editorially complete only with titles and brief subtitles', async () => {
  const automation = await import('../src/services/minuteAutomationService.js');
  assert.equal(typeof automation.hasEditorialMinuteMetadata, 'function');
  assert.equal(automation.hasEditorialMinuteMetadata({ executiveSummary: 'Resumen anterior' }), false);
  assert.equal(automation.hasEditorialMinuteMetadata({
    summaryTitle: 'Decisiones de campaña',
    summarySubtitle: 'Acuerdos clave para el próximo lanzamiento',
    analysisTitle: 'Ritmo y dependencias',
    analysisSubtitle: 'La ejecución depende de validar el material final'
  }), true);
});

test('Fireflies synchronization persists searchable data, JSON and two PDF artifacts', async () => {
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
    },
    uploadBuffer: async ({ key, body, mimeType }) => {
      uploads.push({ key, body, mimeType });
      return { key, size: body.length, mimeType };
    }
  };

  const result = await syncFirefliesMinutes({ db, fireflies, ai, storage, limit: 10, logger: { info() {}, error() {} } });

  assert.deepEqual(result, { discovered: 1, processed: 1, skipped: 0, failed: 0 });
  assert.equal(uploads.length, 4);
  assert.match(uploads[0].key, /transcript\.json$/);
  assert.match(uploads[1].key, /minute\.json$/);
  assert.match(uploads[2].key, /summary\.pdf$/);
  assert.match(uploads[3].key, /analysis\.pdf$/);
  assert.equal(writes.at(-1).data.status, 'READY');
  assert.equal(writes.at(-1).data.executiveSummary, 'Se acordó publicar el viernes.');
  assert.equal(writes.at(-1).data.aiModel, 'gpt-5.6-luna');
  assert.equal(writes.at(-1).data.storageProvider, 'RAILWAY');
  assert.match(writes.at(-1).data.summaryPdfStorageKey, /summary\.pdf$/);
  assert.match(writes.at(-1).data.analysisPdfStorageKey, /analysis\.pdf$/);
});

test('Fireflies synchronization is idempotent for ready meetings', async () => {
  let detailCalls = 0;
  const db = {
    meetingMinute: {
      findUnique: async () => ({
        id: 'minute-1', externalId: 'ff-1', status: 'READY',
        analysis: {
          summaryTitle: 'Campaña aprobada', summarySubtitle: 'Próximo lanzamiento',
          analysisTitle: 'Lectura operativa', analysisSubtitle: 'Ejecución preparada'
        }
      })
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
  assert.equal(query.where.deletedAt, null);
  assert.deepEqual(query.orderBy, { meetingAt: 'desc' });
  assert.equal(query.take, 20);
  assert.equal(query.select.transcriptText, undefined);
  assert.deepEqual(result, rows);
});

test('the default minute archive excludes trash and permanent-exclusion tombstones', async () => {
  let query;
  await getMeetingMinutes({
    db: {
      meetingMinute: {
        findMany: async (args) => { query = args; return []; }
      }
    }
  });

  assert.equal(query.where.deletedAt, null);
  assert.deepEqual(query.where.status, { not: 'EXCLUDED' });
});

test('minutes can move to recoverable trash and return without changing their processing status', async () => {
  const writes = [];
  const memoryEvents = [];
  const db = {
    meetingMinute: {
      update: async ({ where, data }) => {
        writes.push({ where, data });
        return { id: where.id, status: 'READY', ...data };
      }
    }
  };

  const memory = {
    exclude: async (id) => memoryEvents.push(`exclude:${id}`),
    reindex: async (id) => memoryEvents.push(`reindex:${id}`)
  };
  const trashed = await trashMeetingMinute({ id: 'minute-1', db, memory });
  assert.ok(trashed.deletedAt instanceof Date);
  assert.equal(writes[0].data.status, undefined);

  const restored = await restoreMeetingMinute({ id: 'minute-1', db, memory });
  assert.equal(restored.deletedAt, null);
  assert.equal(writes[1].data.status, undefined);
  assert.deepEqual(memoryEvents, ['exclude:minute-1', 'reindex:minute-1']);
});

test('permanent minute deletion removes both bucket objects and leaves only an exclusion tombstone', async () => {
  const writes = [];
  const deletedKeys = [];
  const record = {
    id: 'minute-1',
    externalId: 'ff-private',
    title: 'Devocional alabanza',
    deletedAt: new Date('2026-08-31T12:00:00Z'),
    transcriptStorageKey: 'bria/minutes/2026/ff-private/transcript.json',
    minuteStorageKey: 'bria/minutes/2026/ff-private/minute.json'
  };
  const db = {
    meetingMinute: {
      findFirst: async ({ where }) => where.id === record.id && where.deletedAt?.not === null ? record : null,
      update: async ({ where, data }) => {
        writes.push({ where, data });
        return { ...record, ...data };
      }
    }
  };

  const result = await permanentlyDeleteMeetingMinute({
    id: record.id,
    db,
    storage: { deleteMany: async ({ keys }) => { deletedKeys.push(...keys); } },
    memory: { forget: async (id) => writes.push({ operation: 'forget-memory', id }) }
  });

  assert.deepEqual(deletedKeys, [record.transcriptStorageKey, record.minuteStorageKey]);
  assert.equal(result.status, 'EXCLUDED');
  assert.equal(result.title, 'Reunión excluida');
  assert.equal(result.transcriptText, '');
  assert.equal(result.transcriptStorageKey, null);
  assert.equal(result.minuteStorageKey, null);
  assert.equal(result.deletedAt, null);
  const tombstoneWrite = writes.find((entry) => entry.data?.status === 'EXCLUDED');
  assert.equal(tombstoneWrite.data.analysis, null);
  assert.equal(tombstoneWrite.data.observerSignals, null);
  assert.ok(writes.some((entry) => entry.operation === 'forget-memory' && entry.id === record.id));
});

test('Fireflies synchronization never reimports trashed or permanently excluded meetings', async () => {
  for (const record of [
    { id: 'minute-1', externalId: 'ff-1', status: 'READY', deletedAt: new Date() },
    { id: 'minute-2', externalId: 'ff-1', status: 'EXCLUDED', deletedAt: null }
  ]) {
    let detailCalls = 0;
    const result = await syncFirefliesMinutes({
      db: { meetingMinute: { findUnique: async () => record } },
      fireflies: {
        listTranscripts: async () => [{ id: 'ff-1' }],
        getTranscript: async () => { detailCalls += 1; }
      },
      ai: {},
      storage: {},
      logger: { info() {}, error() {} }
    });

    assert.equal(result.skipped, 1);
    assert.equal(detailCalls, 0);
  }
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
  assert.match(archive, /aria-expanded=/);
  assert.match(archive, /Mostrar archivo/);
  assert.match(archive, /Papelera/);
  assert.match(archive, /trashAutomatedMinute/);
  assert.match(archive, /restoreAutomatedMinute/);
  assert.match(archive, /permanentlyDeleteAutomatedMinute/);
});

test('minutes API exposes manager-only trash, restore and permanent deletion actions', async () => {
  const [routes, controller, api] = await Promise.all([
    read('src/routes/api/minutes.js'),
    read('src/controllers/minutesController.js'),
    read('src/services/frontendApiService.js')
  ]);

  assert.match(routes, /router\.delete\('\/:id',\s*requireManagerRole,\s*minutesController\.trash/);
  assert.match(routes, /router\.patch\('\/:id\/restore',\s*requireManagerRole,\s*minutesController\.restore/);
  assert.match(routes, /router\.delete\('\/:id\/permanent',\s*requireManagerRole,\s*minutesController\.removePermanently/);
  assert.match(routes, /router\.get\('\/trash',\s*requireManagerRole,\s*minutesController\.listTrash/);
  assert.match(controller, /permanentlyDeleteMeetingMinute/);
  assert.match(api, /trashAutomatedMinute/);
  assert.match(api, /restoreAutomatedMinute/);
  assert.match(api, /permanentlyDeleteAutomatedMinute/);
});
