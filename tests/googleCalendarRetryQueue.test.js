import test from 'node:test';
import assert from 'node:assert/strict';
import { retryPendingGoogleCalendarWrites } from '../src/services/operationalEventService.js';

const NOW = new Date('2026-09-11T14:00Z');
const row = extra => ({ id: 'pending', googleSyncStatus: 'PENDING', googleSyncAttempts: 0, googleNextRetryAt: new Date('2026-09-11T12:00Z'), ...extra });
const matches = (current, expected) => Object.entries(expected).every(([key, value]) => value instanceof Date ? current[key]?.getTime() === value.getTime() : current[key] === value);
const logger = { error() {} };

test('twenty revoked-account jobs cannot starve a healthy job later in the retry queue', async () => {
  const rows = [...Array.from({ length: 20 }, (_, index) => row({ id: `revoked-${index}` })), row({ id: 'healthy' })];
  const calls = [];
  const deps = {
    now: NOW, logger,
    findPending: async query => rows.filter(event => query.where.googleSyncStatus.in.includes(event.googleSyncStatus) && (!event.googleNextRetryAt || event.googleNextRetryAt <= NOW)).slice(0, query.take).map(event => structuredClone(event)),
    retry: async id => { calls.push(id); if (id !== 'healthy') throw Object.assign(new Error('La cuenta requiere reconexión'), { code: 'GOOGLE_CALENDAR_NOT_CONNECTED' }); rows.find(event => event.id === id).googleSyncStatus = 'SYNCED'; return { googleSyncStatus: 'SYNCED' }; },
    persistFailure: async ({ where, data }) => { const event = rows.find(event => matches(event, where)); if (!event) return { count: 0 }; Object.assign(event, data); return { count: 1 }; }
  };
  await retryPendingGoogleCalendarWrites(deps);
  await retryPendingGoogleCalendarWrites(deps);
  assert.ok(calls.includes('healthy'));
  assert.equal(calls.filter(id => id === 'revoked-0').length, 1);
  assert.equal(rows[0].googleSyncStatus, 'ERROR');
});

test('authorization failures preserve pending deletion intent and move its retry into the future', async () => {
  let saved;
  await retryPendingGoogleCalendarWrites({
    now: NOW, logger, findPending: async () => [row({ googleSyncStatus: 'PENDING_DELETE' })],
    retry: async () => { throw Object.assign(new Error('invalid_grant'), { code: 'invalid_grant' }); },
    persistFailure: async query => { saved = query; return { count: 1 }; }
  });
  assert.equal(saved?.data.googleSyncStatus, 'PENDING_DELETE');
  assert.ok(saved.data.googleNextRetryAt > NOW);
  assert.equal(saved.data.googleSyncAttempts, 1);
});

test('transient failures before the sync handler receive backoff without losing the event', async () => {
  let saved;
  await retryPendingGoogleCalendarWrites({
    now: NOW, logger, findPending: async () => [row({})],
    retry: async () => { throw Object.assign(new Error('transport unavailable'), { code: 'ECONNRESET' }); },
    persistFailure: async query => { saved = query; return { count: 1 }; }
  });
  assert.equal(saved?.data.googleSyncStatus, 'PENDING');
  assert.ok(saved.data.googleNextRetryAt > NOW);
});

test('fallback retry bookkeeping cannot overwrite state persisted by the sync handler', async () => {
  const current = row({});
  let fallback;
  await retryPendingGoogleCalendarWrites({
    now: NOW, logger, findPending: async () => [structuredClone(current)],
    retry: async () => { current.googleSyncAttempts = 1; current.googleNextRetryAt = new Date('2026-09-11T15:00Z'); throw new Error('handler already scheduled retry'); },
    persistFailure: async ({ where, data }) => { fallback = where; if (matches(current, where)) Object.assign(current, data); return { count: 0 }; }
  });
  assert.equal(fallback?.googleSyncAttempts, 0);
  assert.equal(fallback.googleSyncStatus, 'PENDING');
  assert.equal(fallback.googleNextRetryAt.toISOString(), '2026-09-11T12:00:00.000Z');
  assert.equal(current.googleNextRetryAt.toISOString(), '2026-09-11T15:00:00.000Z');
});
