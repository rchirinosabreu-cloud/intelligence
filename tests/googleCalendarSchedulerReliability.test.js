import test from 'node:test';
import assert from 'node:assert/strict';
import { initGoogleCalendarSyncScheduler } from '../src/services/googleCalendarSyncScheduler.js';

function scheduler(options = {}) {
  const intervals = [];
  const messages = [];
  initGoogleCalendarSyncScheduler({
    retryWrites: async () => [], syncCalendars: async () => [], renewWatchChannels: async () => [],
    setTimeoutFn: () => ({ unref() {} }),
    setIntervalFn: (callback, delay) => { intervals.push({ callback, delay }); return { unref() {} }; },
    logger: { info: (...args) => messages.push(['info', ...args]), error: (...args) => messages.push(['error', ...args]) }, ...options
  });
  return { run: intervals.find(item => item.delay === 300000).callback, messages };
}

test('automatic recovery drains durable writes before pulling remote event changes', async () => {
  const calls = [];
  const { run } = scheduler({ retryWrites: async () => { calls.push('retry'); return []; }, syncCalendars: async () => { calls.push('pull'); return []; } });
  await run();
  assert.deepEqual(calls, ['retry', 'pull']);
});

test('partial account failures cannot be logged as an automatic sync success', async () => {
  const { run, messages } = scheduler({ syncCalendars: async () => [{ email: 'account@example.com', connected: false, error: 'Google unavailable' }] });
  await run();
  assert.equal(messages.some(([level, text]) => level === 'error' && /account@example.com|incompleta/i.test(text)), true);
  assert.equal(messages.some(([level, text]) => level === 'info' && /completada/i.test(text)), false);
});

test('failed recovery does not stop pulling healthy independent accounts', async () => {
  let pulled = false;
  const { run } = scheduler({ retryWrites: async () => { throw new Error('retry unavailable'); }, syncCalendars: async () => { pulled = true; return []; } });
  await run();
  assert.equal(pulled, true);
});

test('recovery counts that still contain pending writes are reported as incomplete', async () => {
  const { run, messages } = scheduler({ retryWrites: async () => ({ synced: 1, failed: 1, pending: 2 }) });
  await run();
  assert.equal(messages.some(([level, text]) => level === 'error' && /pendientes/i.test(text)), true);
  assert.equal(messages.some(([level, text]) => level === 'info' && /completada/i.test(text)), false);
});
