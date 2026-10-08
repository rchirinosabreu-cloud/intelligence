import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceHealthProbes } from '../src/services/serviceHealthProbes.js';

// Cada comprobación es de solo lectura y no se cobra: nunca envía contenido a un proveedor ni manda un correo.

const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('Bria attachments have a dedicated read-only storage probe without shared credentials', async () => {
  let input;
  const probes = createServiceHealthProbes({ env: { BRIA_CHAT_STORAGE_ENDPOINT: 'https://example.test', BRIA_CHAT_STORAGE_BUCKET: 'bria-chat-files', BRIA_CHAT_STORAGE_ACCESS_KEY_ID: 'bria', BRIA_CHAT_STORAGE_SECRET_ACCESS_KEY: 'fixture' }, createS3Client: config => ({ send: async command => { input = { config, command: command.constructor.name, bucket: command.input.Bucket }; return {}; } }) });
  assert.equal((await probes['storage-bria']()).status, 'OK');
  assert.equal(input.bucket, 'bria-chat-files'); assert.equal(input.command, 'HeadBucketCommand'); assert.equal(input.config.accessKeyId, 'bria');
});

test('OpenAI health also checks the independently configured Bria model without generating content', async () => {
  const { probes, requests } = build({ env: { ...baseEnv, BRIA_CHAT_MODEL: 'gpt-6-luna' } });
  assert.equal((await probes.openai()).status, 'OK');
  assert.ok(requests.some(row => row.url === 'https://api.openai.com/v1/models/gpt-6-luna'));
  assert.ok(requests.every(row => row.options?.method === 'GET'));
});

const baseEnv = {
  OPENAI_API_KEY: 'sk-test',
  FIREFLIES_API_KEY: 'ff-test',
  META_SYSTEM_USER_TOKEN: 'meta-test',
  GOOGLE_OAUTH_CLIENT_ID: 'id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
  GOOGLE_APPLICATION_CREDENTIALS_JSON: '{"client_email":"x@y.z"}',
  GOOGLE_CLOUD_PROJECT: 'project',
  GCS_BUCKET_NAME: 'bucket-gcs',
  AWS_ACCESS_KEY_ID: 'a',
  AWS_SECRET_ACCESS_KEY: 'b',
  AWS_S3_BUCKET_NAME: 'chat-evidence',
  BRIA_STORAGE_BUCKET: 'agency-memory',
  FINANCIAL_EVIDENCE_BUCKET_NAME: 'financial-evidence',
  FINANCIAL_EVIDENCE_ACCESS_KEY_ID: 'c',
  FINANCIAL_EVIDENCE_SECRET_ACCESS_KEY: 'd',
  SMTP_USER: 'mail@brainstudio.test',
  SMTP_PASS: 'pass',
  WEB_PUSH_PUBLIC_KEY: 'pub',
  WEB_PUSH_PRIVATE_KEY: 'priv',
  WEB_PUSH_SUBJECT: 'mailto:hola@brainstudio.test'
};

const fakeDb = (overrides = {}) => ({
  $queryRaw: async () => [{ ok: 1 }],
  aiUsageEvent: { groupBy: async () => [] },
  meetingMinute: { count: async () => 0 },
  googleCalendarConnection: {
    findMany: async () => [{ email: 'coordinador@brainstudio.test', isActive: true, lastSyncedAt: new Date('2026-10-04T14:58:00.000Z') }]
  },
  clientSocialAccount: { count: async () => 0 },
  pushSubscription: { count: async ({ where }) => (where.failureCount ? 0 : 7) },
  ...overrides
});

const build = ({ env = baseEnv, fetchImpl, db = fakeDb(), s3 = {}, gcs, mail, trm, clock } = {}) => {
  const requests = [];
  const probes = createServiceHealthProbes({
    env,
    db,
    now: () => new Date('2026-10-04T15:00:00.000Z'),
    clock: clock || (() => 0),
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      return fetchImpl ? fetchImpl(String(url), options) : jsonResponse(200, {});
    },
    createS3Client: (config) => ({
      send: async (command) => {
        requests.push({ s3: config, bucket: command.input.Bucket });
        if (s3[command.input.Bucket]) throw s3[command.input.Bucket];
        return {};
      }
    }),
    createGcsClient: () => ({ bucket: () => ({ exists: async () => (gcs ? gcs() : [true]) }) }),
    createMailTransport: () => ({ verify: async () => (mail ? mail() : true) }),
    fetchTrm: trm || (async () => ({ rate: 3900, validFrom: '2026-10-03T00:00:00.000' }))
  });
  return { probes, requests };
};

test('every service in the catalog has its probe, and there is no probe for a service outside it', async () => {
  const { SERVICE_CATALOG } = await import('../src/lib/serviceHealth.js');
  const { probes } = build();
  assert.deepEqual(Object.keys(probes).sort(), SERVICE_CATALOG.map((service) => service.id).sort());
});

test('OpenAI is checked by reading the model, never by asking it something', async () => {
  const { probes, requests } = build({ fetchImpl: () => jsonResponse(200, { id: 'gpt' }) });
  const result = await probes.openai();
  assert.equal(result.status, 'OK');
  assert.equal(requests[0].options.method || 'GET', 'GET');
  assert.match(requests[0].url, /^https:\/\/api\.openai\.com\/v1\/models\//);
  assert.equal(requests[0].options.body, undefined);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer sk-test');
});

test('OpenAI without credit is red at once and says so', async () => {
  const { probes } = build({ fetchImpl: () => jsonResponse(429, { error: { code: 'insufficient_quota', message: 'quota' } }) });
  const result = await probes.openai();
  assert.equal(result.status, 'FAIL');
  assert.equal(result.critical, true);
  assert.match(result.message, /crédito/);
});

test('OpenAI that answers but fails real calls is yellow with the share of failures', async () => {
  const db = fakeDb({ aiUsageEvent: { groupBy: async () => [{ outcome: 'ALLOWED', _count: { _all: 6 } }, { outcome: 'ERROR', _count: { _all: 4 } }] } });
  const { probes } = build({ db, fetchImpl: () => jsonResponse(200, {}) });
  const result = await probes.openai();
  assert.equal(result.status, 'WARN');
  assert.match(result.message, /4 de 10/);
});

test('minutes waiting for the AI provider turn OpenAI yellow', async () => {
  const db = fakeDb({ meetingMinute: { count: async ({ where }) => (where.status === 'PENDING_PROVIDER' ? 3 : 0) } });
  const { probes } = build({ db, fetchImpl: () => jsonResponse(200, {}) });
  const result = await probes.openai();
  assert.equal(result.status, 'WARN');
  assert.match(result.message, /3 minutas/);
});

test('a missing key is "not configured", never a failure', async () => {
  const { probes, requests } = build({ env: { ...baseEnv, OPENAI_API_KEY: '', META_SYSTEM_USER_TOKEN: '', SMTP_USER: '' } });
  assert.equal((await probes.openai()).status, 'NOT_CONFIGURED');
  assert.equal((await probes.meta()).status, 'NOT_CONFIGURED');
  assert.equal((await probes.email()).status, 'NOT_CONFIGURED');
  assert.equal(requests.length, 0);
});

test('Fireflies is asked only who the user is, and an auth error is critical', async () => {
  const ok = build({ fetchImpl: () => jsonResponse(200, { data: { user: { user_id: 'u1' } } }) });
  assert.equal((await ok.probes.fireflies()).status, 'OK');
  assert.match(ok.requests[0].options.body, /user/);
  assert.doesNotMatch(ok.requests[0].options.body, /transcript/);

  const denied = build({ fetchImpl: () => jsonResponse(200, { errors: [{ message: 'Invalid API key', extensions: { code: 'invalid_api_key' } }] }) });
  const result = await denied.probes.fireflies();
  assert.equal(result.status, 'FAIL');
  assert.equal(result.critical, true);
});

test('Meta checks the system token and warns about client accounts that ask to reconnect', async () => {
  const ok = build({ fetchImpl: () => jsonResponse(200, { id: '1', name: 'Brainstudio' }) });
  const okResult = await ok.probes.meta();
  assert.equal(okResult.status, 'OK');
  assert.doesNotMatch(ok.requests[0].url, /meta-test/, 'el token nunca va en la URL');
  assert.equal(ok.requests[0].options.headers.Authorization, 'Bearer meta-test');

  const expired = build({ fetchImpl: () => jsonResponse(400, { error: { code: 190, message: 'Session has expired' } }) });
  const expiredResult = await expired.probes.meta();
  assert.equal(expiredResult.status, 'FAIL');
  assert.equal(expiredResult.critical, true);

  const reconnect = build({ db: fakeDb({ clientSocialAccount: { count: async () => 2 } }), fetchImpl: () => jsonResponse(200, { id: '1' }) });
  const reconnectResult = await reconnect.probes.meta();
  assert.equal(reconnectResult.status, 'WARN');
  assert.match(reconnectResult.message, /2 cuentas/);
});

test('Google Calendar reads the connections: none active is red, one asking to reconnect is yellow, stale sync is yellow', async () => {
  const allDown = build({ db: fakeDb({ googleCalendarConnection: { findMany: async () => [{ email: 'a@b.c', isActive: false, lastSyncedAt: null }] } }) });
  const down = await allDown.probes['google-calendar']();
  assert.equal(down.status, 'FAIL');
  assert.equal(down.critical, true);

  const one = build({ db: fakeDb({ googleCalendarConnection: { findMany: async () => [
    { email: 'a@b.c', isActive: true, lastSyncedAt: new Date('2026-10-04T14:58:00.000Z') },
    { email: 'otra@b.c', isActive: false, lastSyncedAt: null }
  ] } }) });
  const partial = await one.probes['google-calendar']();
  assert.equal(partial.status, 'WARN');
  assert.match(partial.message, /otra@b\.c/);

  const stale = build({ db: fakeDb({ googleCalendarConnection: { findMany: async () => [{ email: 'a@b.c', isActive: true, lastSyncedAt: new Date('2026-10-04T13:00:00.000Z') }] } }) });
  assert.equal((await stale.probes['google-calendar']()).status, 'WARN');

  assert.equal((await build().probes['google-calendar']()).status, 'OK');
});

test('each bucket is checked with its own credentials and a missing bucket is critical', async () => {
  const { probes, requests } = build();
  assert.equal((await probes['storage-chat']()).status, 'OK');
  assert.equal((await probes['storage-memory']()).status, 'OK');
  assert.equal((await probes['storage-financial']()).status, 'OK');
  assert.deepEqual(requests.map((request) => request.bucket), ['chat-evidence', 'agency-memory', 'financial-evidence']);
  assert.equal(requests[2].s3.accessKeyId, 'c');

  const missing = build({ s3: { 'agency-memory': Object.assign(new Error('NotFound'), { $metadata: { httpStatusCode: 404 } }) } });
  const result = await missing.probes['storage-memory']();
  assert.equal(result.status, 'FAIL');
  assert.equal(result.critical, true);
});

test('agency memory without its own bucket is yellow, because the shared one is purged', async () => {
  const { probes } = build({ env: { ...baseEnv, BRIA_STORAGE_BUCKET: '' } });
  const result = await probes['storage-memory']();
  assert.equal(result.status, 'WARN');
  assert.match(result.message, /compartido/);
});

test('email only connects and authenticates; a rejected login is critical', async () => {
  assert.equal((await build().probes.email()).status, 'OK');
  const rejected = build({ mail: () => { throw Object.assign(new Error('Invalid login'), { code: 'EAUTH' }); } });
  const result = await rejected.probes.email();
  assert.equal(result.status, 'FAIL');
  assert.equal(result.critical, true);
});

test('push reports the registered devices and warns when most of them fail', async () => {
  const ok = await build().probes.push();
  assert.equal(ok.status, 'OK');
  assert.match(ok.message, /7 dispositivos/);
  const failing = build({ db: fakeDb({ pushSubscription: { count: async ({ where }) => (where.failureCount ? 6 : 8) } }) });
  assert.equal((await failing.probes.push()).status, 'WARN');
});

test('the TRM warns when the last published rate is old', async () => {
  assert.equal((await build().probes.trm()).status, 'OK');
  const old = build({ trm: async () => ({ rate: 3900, validFrom: '2026-09-20T00:00:00.000' }) });
  assert.equal((await old.probes.trm()).status, 'WARN');
});

test('the database is checked with a trivial query and a slow answer is yellow', async () => {
  let tick = 0;
  const { probes } = build({ clock: () => (tick += 2500) });
  const result = await probes.database();
  assert.equal(result.status, 'WARN');
  assert.match(result.message, /lent/);
});

test('a probe that throws becomes a failure with a human message, never a crash', async () => {
  const { probes } = build({ fetchImpl: () => { throw Object.assign(new Error('fetch failed'), { name: 'TypeError' }); } });
  const result = await probes.openai();
  assert.equal(result.status, 'FAIL');
  assert.equal(result.errorCode, 'NETWORK');
  assert.equal(result.critical, false);
});
