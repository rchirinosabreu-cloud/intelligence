import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import * as state from '../src/services/briaContentPlanReviewState.js';
import { formatReviewDiagnostic, humanizeReviewRequestError } from '../src/lib/briaReviewDiagnostics.js';

const now = new Date('2026-09-21T14:00:00.000Z');
const lease = { planId: 'plan', token: 'token', requestedAt: new Date('2026-09-21T13:58:00.000Z'), startedAt: now, attempts: 2 };

const fakeDb = ({ diagnostics = null } = {}) => {
  const calls = { updateMany: [], findUnique: [] };
  return {
    calls,
    contentPlan: {
      findUnique: async args => { calls.findUnique.push(args); return { briaReviewDiagnostics: diagnostics }; },
      updateMany: async args => { calls.updateMany.push(args); return { count: 1 }; }
    },
    contentPlanReviewFinding: { updateMany: async args => { calls.updateMany.push({ model: 'finding', ...args }); return { count: 3 }; } }
  };
};

test('a failed attempt records its technical cause next to the human message', async () => {
  const db = fakeDb();
  // A real failure of the work, not an outage: the model answered but the lot was incomplete.
  const error = Object.assign(new Error('Bria no confirmó la revisión completa del lote ' + 'x'.repeat(400)), { code: 'BRIA_REVIEW_INCOMPLETE_BATCH', requestId: 'req-9' });
  await state.failContentPlanReview(lease, error, { db, now });
  const { data } = db.calls.updateMany[0];
  assert.equal(data.briaReviewState, 'PENDING');
  assert.equal(data.briaReviewError, 'Bria reintentará la revisión automáticamente.');
  assert.equal(data.briaReviewDiagnostics.length, 1);
  const [entry] = data.briaReviewDiagnostics;
  assert.equal(entry.attempt, 2);
  assert.equal(entry.at, now.toISOString());
  assert.equal(entry.code, 'BRIA_REVIEW_INCOMPLETE_BATCH');
  assert.equal(entry.status, null);
  assert.equal(entry.requestId, 'req-9');
  assert.equal(entry.retry, true);
  assert.equal('providerUnavailable' in entry, false);
  assert.ok(entry.message.length <= 300);
  assert.ok(entry.message.startsWith('Bria no confirmó'));
});

test('diagnostics keep the last five attempts, newest last, and a permanent failure is marked as final', async () => {
  const previous = Array.from({ length: 5 }, (_, index) => ({ attempt: index + 1, at: now.toISOString(), code: `OLD_${index}`, status: null, message: 'old', requestId: null, retry: true }));
  const db = fakeDb({ diagnostics: previous });
  const error = Object.assign(new Error('Unauthorized'), { status: 401, code: 'invalid_api_key' });
  await state.failContentPlanReview({ ...lease, attempts: 1 }, error, { db, now });
  const { data } = db.calls.updateMany[0];
  assert.equal(data.briaReviewState, 'FAILED');
  assert.equal(data.briaReviewDiagnostics.length, 5);
  assert.deepEqual(data.briaReviewDiagnostics.slice(0, 4).map(entry => entry.code), ['OLD_1', 'OLD_2', 'OLD_3', 'OLD_4']);
  const latest = data.briaReviewDiagnostics.at(-1);
  assert.equal(latest.code, 'invalid_api_key');
  assert.equal(latest.status, 401);
  assert.equal(latest.retry, false);
});

test('an outage of the provider does not spend one of the three attempts', async () => {
  const db = fakeDb();
  const error = Object.assign(new Error('You have no credits remaining.'), { status: 429, code: 'credit_balance_exhausted' });
  await state.failContentPlanReview({ ...lease, attempts: 2 }, error, { db, now });
  const { data } = db.calls.updateMany[0];
  assert.equal(data.briaReviewState, 'PENDING');
  assert.equal(data.briaReviewAttempts, 1, 'the attempt is given back: the work never got a real chance');
  assert.equal(data.briaReviewNextAttemptAt.getTime(), now.getTime() + state.BRIA_REVIEW_PROVIDER_RETRY_MS);
  assert.match(data.briaReviewError, /no está disponible/i);
  const [entry] = data.briaReviewDiagnostics;
  assert.equal(entry.code, 'credit_balance_exhausted');
  assert.equal(entry.providerUnavailable, true);
  assert.equal(entry.retry, true);
});

test('an outage on the last attempt still leaves the plan recoverable instead of permanently failed', async () => {
  const db = fakeDb();
  const error = Object.assign(new Error('Service unavailable'), { status: 503 });
  await state.failContentPlanReview({ ...lease, attempts: 3 }, error, { db, now });
  const { data } = db.calls.updateMany[0];
  assert.equal(data.briaReviewState, 'PENDING');
  assert.equal(data.briaReviewAttempts, 2);
});

test('a real failure still spends its attempt and ends in a visible failure', async () => {
  const db = fakeDb();
  const error = Object.assign(new Error('bad request'), { status: 400 });
  await state.failContentPlanReview({ ...lease, attempts: 3 }, error, { db, now });
  const { data } = db.calls.updateMany[0];
  assert.equal(data.briaReviewState, 'FAILED');
  assert.equal('briaReviewAttempts' in data, false, 'attempts are consumed at claim time and stay consumed');
});

test('a superseded review is not a failure: no diagnostic is written and the plan returns to pending', async () => {
  const db = fakeDb();
  await state.failContentPlanReview(lease, state.supersededReviewError(), { db, now });
  const { data } = db.calls.updateMany[0];
  assert.equal(data.briaReviewState, 'PENDING');
  assert.equal('briaReviewDiagnostics' in data, false);
  assert.equal(db.calls.findUnique.length, 0);
});

test('completing a review clears the diagnostics of the attempts that failed before', async () => {
  const db = fakeDb();
  await state.completeContentPlanReviewLease(db, lease, now);
  assert.equal(db.calls.updateMany[0].data.briaReviewDiagnostics, Prisma.DbNull);
});

test('finalized or deleted plans archive their open findings and stop pretending a review is pending', async () => {
  const db = fakeDb();
  const result = await state.archiveStaleContentPlanReviews({ db, now });
  const findings = db.calls.updateMany.find(call => call.model === 'finding');
  assert.deepEqual(findings.where, { status: 'OPEN', plan: { OR: [{ status: 'FINALIZADO' }, { deletedAt: { not: null } }] } });
  assert.deepEqual(findings.data, { status: 'STALE', actionReason: 'Parrilla finalizada', lastActionAt: now, lastActionById: null });
  const plans = db.calls.updateMany.find(call => !call.model);
  assert.deepEqual(plans.where, { status: 'FINALIZADO', deletedAt: null, briaReviewState: 'PENDING', briaReviewFindings: { none: { status: 'VERIFYING' } } });
  assert.deepEqual(plans.data, { briaReviewState: 'STALE', briaReviewLeaseToken: null, briaReviewNextAttemptAt: null, briaReviewStartedAt: null });
  assert.deepEqual(result, { findings: 3, plans: 1 });
});

test('a raw error code from the server is never shown to the team as the explanation', () => {
  const fallback = 'Bria no pudo completar la revisión en este intento.';
  assert.equal(humanizeReviewRequestError({ error: 'INTERNAL_SERVER_ERROR', code: 'BRIA_REVIEW_INCOMPLETE_BATCH' }, fallback), fallback);
  assert.equal(humanizeReviewRequestError({ error: 'BRIA_UPSTREAM_UNAVAILABLE' }, fallback), fallback);
  assert.equal(humanizeReviewRequestError({ error: 'La parrilla no existe o ya no está disponible.' }, fallback), 'La parrilla no existe o ya no está disponible.');
  assert.equal(humanizeReviewRequestError(undefined, fallback), fallback);
  assert.equal(humanizeReviewRequestError({ error: '' }, fallback), fallback);
});

test('the technical cause is shown in one short line the team can read', () => {
  const line = formatReviewDiagnostic({ attempt: 3, at: '2026-09-21T14:02:00.000Z', code: 'OPENAI_TIMEOUT', status: 504, message: 'OpenAI superó el tiempo máximo de respuesta.', retry: false }, { maxAttempts: 3 });
  assert.match(line, /Intento 3 de 3/);
  assert.match(line, /OPENAI_TIMEOUT/);
  assert.match(line, /HTTP 504/);
  assert.match(line, /tiempo máximo/);
  assert.match(line, /09:02/);
  assert.equal(formatReviewDiagnostic(null), '');
  assert.match(formatReviewDiagnostic({ attempt: 1, at: 'not-a-date', code: null, status: null, message: '' }), /Intento 1/);
});
