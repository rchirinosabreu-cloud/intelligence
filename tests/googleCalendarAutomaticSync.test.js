import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Google Calendar schedules an incremental sync every five minutes', async () => {
  const scheduler = await import('../src/services/googleCalendarSyncScheduler.js').catch(() => ({}));
  assert.equal(typeof scheduler.initGoogleCalendarSyncScheduler, 'function');

  const timeouts = [];
  const intervals = [];
  const calls = [];
  const timer = () => ({ unref() {} });
  scheduler.initGoogleCalendarSyncScheduler({
    syncCalendars: async () => calls.push('sync'),
    renewWatchChannels: async () => calls.push('renew'),
    setTimeoutFn: (callback, delay) => {
      timeouts.push({ callback, delay });
      return timer();
    },
    setIntervalFn: (callback, delay) => {
      intervals.push({ callback, delay });
      return timer();
    },
    logger: { info() {}, error() {} }
  });

  assert.equal(timeouts[0].delay, 15_000);
  assert.equal(intervals.find(item => item.delay === 5 * 60_000)?.delay, 5 * 60_000);
  assert.equal(intervals.find(item => item.delay === 12 * 60 * 60_000)?.delay, 12 * 60 * 60_000);

  await timeouts[0].callback();
  assert.deepEqual(calls, ['renew', 'sync']);

  await intervals.find(item => item.delay === 5 * 60_000).callback();
  assert.deepEqual(calls, ['renew', 'sync', 'sync']);
});

test('automatic Google sync never overlaps a still-running execution', async () => {
  const scheduler = await import('../src/services/googleCalendarSyncScheduler.js').catch(() => ({}));
  assert.equal(typeof scheduler.initGoogleCalendarSyncScheduler, 'function');

  const intervals = [];
  let releaseSync;
  let syncCalls = 0;
  const pendingSync = new Promise(resolve => { releaseSync = resolve; });
  scheduler.initGoogleCalendarSyncScheduler({
    syncCalendars: async () => {
      syncCalls += 1;
      await pendingSync;
    },
    renewWatchChannels: async () => {},
    setTimeoutFn: () => ({ unref() {} }),
    setIntervalFn: (callback, delay) => {
      intervals.push({ callback, delay });
      return { unref() {} };
    },
    logger: { info() {}, error() {} }
  });

  const syncInterval = intervals.find(item => item.delay === 5 * 60_000);
  const firstRun = syncInterval.callback();
  await Promise.resolve();
  await syncInterval.callback();
  assert.equal(syncCalls, 1);
  releaseSync();
  await firstRun;
});

test('the Google webhook is public and the automatic scheduler starts with the server', async () => {
  const [routes, server] = await Promise.all([
    read('src/routes/index.js'),
    read('server.js')
  ]);

  const webhookPosition = routes.indexOf("router.post('/activity/google-calendar/webhook'");
  const authPosition = routes.indexOf('router.use(authenticateToken)');
  assert.ok(webhookPosition >= 0, 'falta la ruta del webhook de Google Calendar');
  assert.ok(webhookPosition < authPosition, 'el webhook de Google debe estar antes de la autenticación JWT');
  assert.match(routes, /handleGoogleCalendarWebhook/);
  assert.match(server, /initGoogleCalendarSyncScheduler\(\)/);
});

test('all synchronization entry points share a per-account overlap lock', async () => {
  const { withGoogleCalendarSyncLock } = await import('../src/services/operationalEventService.js');
  let release;
  let calls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const first = withGoogleCalendarSyncLock('account-1', async () => {
    calls += 1;
    await pending;
    return 'done';
  });
  const second = withGoogleCalendarSyncLock('account-1', async () => {
    calls += 1;
    return 'unexpected';
  });

  assert.equal(first, second);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, 'done');
});

test('Google webhooks acknowledge valid notifications before the background sync finishes', async () => {
  const { handleGoogleCalendarWebhook } = await import('../src/services/operationalEventService.js');
  let scheduled = false;
  let syncStarted = false;
  const result = await handleGoogleCalendarWebhook({
    'x-goog-channel-id': 'channel-1',
    'x-goog-channel-token': 'token-1',
    'x-goog-resource-state': 'exists'
  }, {
    findChannel: async () => ({ connectionId: 'account-1' }),
    scheduleSync: callback => {
      scheduled = true;
      void callback().then(() => {});
    },
    syncCalendar: async () => { syncStarted = true; }
  });

  assert.deepEqual(result, { accepted: true });
  assert.equal(scheduled, true);
  await Promise.resolve();
  assert.equal(syncStarted, true);
});
