import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { getSafeTestDatabaseUrl } from './helpers/testDatabase.js';
import * as state from '../src/services/briaContentPlanReviewState.js';
import * as scheduler from '../src/services/briaContentPlanReviewScheduler.js';
import { updateContentPlanReviewFinding, getContentPlanReview, createContentPlanReviewRepository } from '../src/services/briaContentPlanReviewService.js';
import { reviewPayload } from './helpers/briaReview.js';

const databaseUrl = getSafeTestDatabaseUrl();
const start = new Date('2026-09-05T15:00:00Z');
const rawReview = { summary: 'Revisión de prueba.', verdict: 'ALINEADA', findings: [], dimensions: Object.fromEntries(
  ['ESTRATEGIA', 'MARCA', 'GRAMATICA', 'CONSISTENCIA'].map(key => [key, { score: 80, confidence: 0.8, assessable: true, note: 'Verificado.' }])) };

test('review jobs preserve ownership and recover safely with real PostgreSQL', { skip: !databaseUrl }, async t => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const createdClients = [];
  const fixture = async () => {
    const key = randomUUID();
    const client = await db.client.create({ data: { name: `Review test ${key}`, slug: `review-test-${key}` } });
    createdClients.push(client.id);
    return db.contentPlan.create({ data: { clientId: client.id, month: 9, year: 2026, briaReviewRequestedAt: new Date(start.getTime() - 60000) } });
  };
  const options = planId => ({ planId, db, now: () => start, reviewOptions: {
    getPlan: id => db.contentPlan.findUnique({ where: { id }, include: { client: true, contentItems: true } }),
    searchMemory: async () => [], ai: { generate: async request => ({ text: JSON.stringify(request.responseSchema.properties.verifications ? { verifications: [] } : reviewPayload(request, rawReview)), requestId: 'fixture' }) }
  } });
  const findingFixture = async () => {
    const plan = await fixture();
    const item = await db.contentItem.create({ data: { planId: plan.id, objective: 'Objetivo', format: 'Reel', copyText: 'Texto corregido', captionText: '', publishDate: start } });
    const config = options(plan.id);
    config.reviewOptions.ai.generate = async request => ({ text: JSON.stringify({ ...reviewPayload(request, rawReview), findings: [{
      ruleKey: 'TEXT_ERROR', field: 'copyText', itemId: item.id, category: 'GRAMATICA', severity: 'INFO', title: 'Revisar texto', detail: 'Error en el texto', recommendation: 'Corregir el texto', evidenceIds: []
    }] }) });
    const result = await scheduler.runContentPlanReviewJob(config);
    return { plan, item, finding: result.result.review.findings[0], config: options(plan.id) };
  };
  try {
    await t.test('completed batches survive a transient failure and only the complete result is published', async () => {
      const plan = await fixture();
      await db.contentItem.createMany({ data: Array.from({ length: 13 }, (_, i) => ({ planId: plan.id, objective: `Pieza ${i}`, format: 'Reel', copyText: 'Texto', captionText: '', publishDate: start })) });
      const config = { ...options(plan.id), logger: { error() {} } };
      let calls = 0;
      config.reviewOptions.ai.generate = async request => {
        if (++calls === 2) throw Object.assign(new Error('upstream fixture'), { status: 503 });
        return { text: JSON.stringify(reviewPayload(request)) };
      };
      assert.equal((await scheduler.runContentPlanReviewJob(config)).status, 'FAILED');
      const pending = await db.contentPlan.findUnique({ where: { id: plan.id } });
      assert.equal(pending.briaReviewCheckpoint.completed.length, 1);
      assert.equal(await db.contentPlanReview.count({ where: { planId: plan.id } }), 0);
      const pendingApi = await getContentPlanReview(plan.id, { db });
      assert.deepEqual(pendingApi.meta.progress, { completedBatches: 1, totalBatches: 2, reviewedItems: 12, totalItems: 13 });
      calls = 0;
      config.reviewOptions.ai.generate = async request => { calls++; return { text: JSON.stringify(reviewPayload(request)) }; };
      config.now = () => new Date(start.getTime() + 120000);
      const resumed = await scheduler.runContentPlanReviewJob(config);
      assert.equal(resumed.status, 'COMPLETED');
      assert.equal(calls, 1);
      assert.equal(resumed.result.review.scope.reviewedItems, 13);
      assert.equal((await db.contentPlan.findUnique({ where: { id: plan.id } })).briaReviewCheckpoint, null);
      assert.equal((await getContentPlanReview(plan.id, { db })).review.scope.reviewedItems, 13);
    });
    await t.test('edits clear partial progress and old workers cannot write another checkpoint', async () => {
      const plan = await fixture();
      const lease = await state.claimContentPlanReview(plan.id, { db, now: start, trigger: 'MANUAL' });
      const repository = createContentPlanReviewRepository(db);
      const checkpoint = { analysisHash: 'old', completed: [], totalItems: 13, totalBatches: 2 };
      await repository.saveCheckpoint(plan.id, checkpoint, { execution: lease, now: () => start });
      await state.markContentPlanReviewPending(plan.id, { db, requestedAt: new Date(start.getTime() + 1) });
      await assert.rejects(repository.saveCheckpoint(plan.id, checkpoint, { execution: lease, now: () => start }), { code: 'BRIA_REVIEW_SUPERSEDED' });
      assert.equal((await db.contentPlan.findUnique({ where: { id: plan.id } })).briaReviewCheckpoint, null);
    });
    await t.test('marking corrected queues verification atomically; a queue failure rolls back the finding', async () => {
      const { plan, finding } = await findingFixture();
      const broken = { $transaction: fn => db.$transaction(tx => fn(new Proxy(tx, { get(target, key) {
        if (key === 'contentPlan') return new Proxy(tx.contentPlan, { get(model, op) {
          if (op === 'update') return args => {
            if (args.data.briaReviewState === 'PENDING') throw new Error('queue failure fixture');
            return model.update(args);
          };
          return model[op];
        } });
        return target[key];
      } }))) };
      await assert.rejects(updateContentPlanReviewFinding({ planId: plan.id, findingId: finding.id, action: 'MARK_CORRECTED', db: broken, now: start }), /queue failure fixture/);
      assert.equal((await db.contentPlanReviewFinding.findUnique({ where: { id: finding.id } })).status, 'OPEN');
      await updateContentPlanReviewFinding({ planId: plan.id, findingId: finding.id, action: 'MARK_CORRECTED', db, now: start });
      assert.equal((await db.contentPlan.findUnique({ where: { id: plan.id } })).briaReviewState, 'PENDING');
    });
    await t.test('an omitted verification stays actionable rather than silently resolving', async () => {
      const { plan, finding, config } = await findingFixture();
      await updateContentPlanReviewFinding({ planId: plan.id, findingId: finding.id, action: 'MARK_CORRECTED', db, now: start });
      assert.equal((await scheduler.runContentPlanReviewJob(config)).status, 'COMPLETED');
      const updated = await db.contentPlanReviewFinding.findUnique({ where: { id: finding.id } });
      assert.equal(updated.status, 'OPEN');
      assert.equal(updated.verification.outcome, 'INCONCLUSIVE');
      assert.equal(updated.resolvedAt, null);
    });
    await t.test('explicit supported verification resolves the original finding and persists its conclusion', async () => {
      const { plan, item, finding, config } = await findingFixture();
      await updateContentPlanReviewFinding({ planId: plan.id, findingId: finding.id, action: 'MARK_CORRECTED', db, now: start });
      let call = 0;
      config.reviewOptions.ai.generate = async request => ({ text: JSON.stringify(++call === 1 ? reviewPayload(request, rawReview) : { verifications: [{ findingId: finding.id, outcome: 'RESOLVED', reason: 'El texto actual está corregido.', evidence: [{ itemId: item.id, field: 'copyText', quote: 'Texto corregido' }] }] }) });
      const outcome = await scheduler.runContentPlanReviewJob(config);
      assert.equal(outcome.status, 'COMPLETED');
      const updated = await db.contentPlanReviewFinding.findUnique({ where: { id: finding.id } });
      assert.equal(updated.status, 'RESOLVED');
      assert.equal(updated.verification.outcome, 'RESOLVED');
      assert.equal(updated.verification.revisionHash, outcome.result.meta.revisionHash);
    });
    await t.test('undo during AI work invalidates the old verification and keeps the finding open', async () => {
      const { plan, finding, config } = await findingFixture();
      await updateContentPlanReviewFinding({ planId: plan.id, findingId: finding.id, action: 'MARK_CORRECTED', db, now: start });
      let first = true;
      config.reviewOptions.ai.generate = async request => {
        if (first) {
          first = false;
          await updateContentPlanReviewFinding({ planId: plan.id, findingId: finding.id, action: 'UNDO_CORRECTION', db, now: new Date(start.getTime() + 1) });
        }
        return { text: JSON.stringify(reviewPayload(request, rawReview)) };
      };
      assert.equal((await scheduler.runContentPlanReviewJob(config)).status, 'SUPERSEDED');
      assert.equal((await db.contentPlanReviewFinding.findUnique({ where: { id: finding.id } })).status, 'OPEN');
    });
    await t.test('a human verification request also runs for a finalized plan', async () => {
      const { plan, finding, config } = await findingFixture();
      await db.contentPlan.update({ where: { id: plan.id }, data: { status: 'FINALIZADO' } });
      await updateContentPlanReviewFinding({ planId: plan.id, findingId: finding.id, action: 'MARK_CORRECTED', db, now: start });
      const outcomes = await scheduler.reconcilePendingContentPlanReviews({ db, now: () => new Date(start.getTime() + 60000), limit: 100, reviewOptions: config.reviewOptions });
      assert.equal(outcomes.find(outcome => outcome.planId === plan.id)?.status, 'COMPLETED');
    });
    await t.test('conflicting general review cannot silently certify a correction', async () => {
      const { plan, finding, item, config } = await findingFixture();
      await updateContentPlanReviewFinding({ planId: plan.id, findingId: finding.id, action: 'MARK_CORRECTED', db, now: start });
      let call = 0;
      config.reviewOptions.ai.generate = async request => ({ text: JSON.stringify(++call === 1 ? { ...reviewPayload(request, rawReview), findings: [finding] } : { verifications: [{ findingId: finding.id, outcome: 'RESOLVED', reason: 'Corregido', evidence: [{ itemId: item.id, field: 'copyText', quote: 'Texto corregido' }] }] }) });
      assert.equal((await scheduler.runContentPlanReviewJob(config)).status, 'COMPLETED');
      const current = await db.contentPlanReviewFinding.findUnique({ where: { id: finding.id } });
      assert.equal(current.status, 'OPEN');
      assert.equal(current.verification.outcome, 'INCONCLUSIVE');
    });
    await t.test('a finding detected again does not retain an obsolete resolved conclusion', async () => {
      const { plan, finding, config } = await findingFixture();
      await db.contentPlanReviewFinding.update({ where: { id: finding.id }, data: {
        status: 'RESOLVED', resolvedAt: start, verification: { outcome: 'RESOLVED', reason: 'Older content', revisionHash: 'old' }
      } });
      await state.markContentPlanReviewPending(plan.id, { db, requestedAt: start });
      config.reviewOptions.force = true;
      config.reviewOptions.ai.generate = async request => ({ text: JSON.stringify({ ...reviewPayload(request, rawReview), findings: [finding] }) });
      assert.equal((await scheduler.runContentPlanReviewJob(config)).status, 'COMPLETED');
      const current = await db.contentPlanReviewFinding.findUnique({ where: { id: finding.id } });
      assert.equal(current.status, 'OPEN');
      assert.equal(current.verification, null);
    });
    await t.test('dismissal during verification is retained and never converted to a correction', async () => {
      const { plan, item, finding, config } = await findingFixture();
      await updateContentPlanReviewFinding({ planId: plan.id, findingId: finding.id, action: 'MARK_CORRECTED', db, now: start });
      let call = 0;
      config.reviewOptions.ai.generate = async request => {
        if (++call === 1) return { text: JSON.stringify(reviewPayload(request, rawReview)) };
        await updateContentPlanReviewFinding({ planId: plan.id, findingId: finding.id, action: 'DISMISS', reason: 'Decisión estratégica consciente', db, now: new Date(start.getTime() + 1) });
        return { text: JSON.stringify({ verifications: [{ findingId: finding.id, outcome: 'RESOLVED', reason: 'Corregido', evidence: [{ itemId: item.id, field: 'copyText', quote: 'Texto corregido' }] }] }) };
      };
      assert.equal((await scheduler.runContentPlanReviewJob(config)).status, 'COMPLETED');
      const current = await db.contentPlanReviewFinding.findUnique({ where: { id: finding.id } });
      assert.equal(current.status, 'DISMISSED');
      assert.equal(current.actionReason, 'Decisión estratégica consciente');
      assert.equal(current.resolvedAt, null);
    });
    await t.test('two competing workers claim one review only', async () => {
      assert.equal(typeof state.claimContentPlanReview, 'function');
      const plan = await fixture();
      const claims = await Promise.all(Array.from({ length: 5 }, () => state.claimContentPlanReview(plan.id, { db, now: start, trigger: 'MANUAL' })));
      assert.equal(claims.filter(Boolean).length, 1);
      const current = await db.contentPlan.findUnique({ where: { id: plan.id } });
      assert.equal(current.briaReviewState, 'RUNNING');
      assert.equal(current.briaReviewAttempts, 1);
    });
    await t.test('a successful review persists the shared score and releases its lease', async () => {
      assert.equal(typeof scheduler.runContentPlanReviewJob, 'function');
      const plan = await fixture();
      const outcome = await scheduler.runContentPlanReviewJob(options(plan.id));
      assert.equal(outcome.status, 'COMPLETED');
      assert.equal(outcome.result.review.score, 80);
      const current = await db.contentPlan.findUnique({ where: { id: plan.id } });
      assert.equal(current.briaReviewState, 'CURRENT');
      assert.equal(current.briaReviewLeaseToken, null);
      assert.equal(await db.contentPlanReview.count({ where: { planId: plan.id } }), 1);
    });
    await t.test('soft-deleted pieces do not restart a completed review forever (Aristea regression)', async () => {
      const plan = await fixture();
      await db.contentItem.create({ data: { planId: plan.id, objective: 'Deleted piece', format: 'Reel', copyText: '', captionText: '', publishDate: start, deletedAt: start } });
      const config = options(plan.id);
      config.reviewOptions.getPlan = id => db.contentPlan.findUnique({ where: { id }, include: {
        client: true, contentItems: { where: { deletedAt: null } }
      } });
      assert.equal((await scheduler.runContentPlanReviewJob(config)).status, 'COMPLETED');
      assert.equal((await db.contentPlan.findUnique({ where: { id: plan.id } })).briaReviewState, 'CURRENT');
    });
    await t.test('manual clicks and an automatic worker coalesce into one AI call', async () => {
      const plan = await fixture();
      const config = options(plan.id);
      let calls = 0;
      let release;
      let entered;
      const ready = new Promise(resolve => { entered = resolve; });
      config.reviewOptions.ai.generate = request => {
        calls++;
        entered();
        return new Promise(resolve => { release = () => resolve({ text: JSON.stringify(reviewPayload(request, rawReview)) }); });
      };
      const first = scheduler.runContentPlanReviewJob(config);
      await ready;
      try {
        const competing = await Promise.all(['MANUAL', 'AUTOMATIC', 'MANUAL'].map(trigger => scheduler.runContentPlanReviewJob({ ...config, trigger })));
        assert.ok(competing.every(result => result.status === 'SKIPPED'));
      } finally { release(); }
      assert.equal((await first).status, 'COMPLETED');
      assert.equal(calls, 1);
      assert.equal(await db.contentPlanReview.count({ where: { planId: plan.id } }), 1);
    });
    await t.test('a cache hit completes its new lease without generating a different score', async () => {
      const plan = await fixture();
      const config = options(plan.id);
      assert.equal((await scheduler.runContentPlanReviewJob(config)).status, 'COMPLETED');
      await state.markContentPlanReviewPending(plan.id, { db, requestedAt: start });
      config.reviewOptions.ai.generate = async request => { assert.fail('unchanged review must reuse the shared score'); };
      const cached = await scheduler.runContentPlanReviewJob(config);
      assert.equal(cached.status, 'COMPLETED');
      assert.equal(cached.result.meta.cached, true);
      assert.equal(cached.result.review.score, 80);
      assert.equal((await db.contentPlan.findUnique({ where: { id: plan.id } })).briaReviewLeaseToken, null);
    });
    await t.test('editing during generation prevents publication of stale scores and findings', async () => {
      assert.equal(typeof scheduler.runContentPlanReviewJob, 'function');
      const plan = await fixture();
      const config = options(plan.id);
      config.reviewOptions.ai.generate = async request => {
        await state.markContentPlanReviewPending(plan.id, { db, requestedAt: new Date(start.getTime() + 1) });
        return { text: JSON.stringify(reviewPayload(request, rawReview)) };
      };
      assert.equal((await scheduler.runContentPlanReviewJob(config)).status, 'SUPERSEDED');
      assert.equal(await db.contentPlanReview.count({ where: { planId: plan.id } }), 0);
      assert.equal((await db.contentPlan.findUnique({ where: { id: plan.id } })).briaReviewState, 'PENDING');
    });
    await t.test('changes to client instructions without a queue mutation still invalidate the snapshot', async () => {
      assert.equal(typeof scheduler.runContentPlanReviewJob, 'function');
      const plan = await fixture();
      const config = options(plan.id);
      config.reviewOptions.ai.generate = async request => {
        await db.client.update({ where: { id: plan.clientId }, data: { aiInstructions: 'New approved instructions' } });
        return { text: JSON.stringify(reviewPayload(request, rawReview)) };
      };
      assert.equal((await scheduler.runContentPlanReviewJob(config)).status, 'SUPERSEDED');
      assert.equal(await db.contentPlanReview.count({ where: { planId: plan.id } }), 0);
    });
    await t.test('transient failures use bounded retries and new edits reset the budget', async () => {
      assert.equal(typeof scheduler.runContentPlanReviewJob, 'function');
      const plan = await fixture();
      let tick = start;
      const config = { ...options(plan.id), trigger: 'AUTOMATIC', now: () => tick, logger: { error() {} } };
      config.reviewOptions.ai.generate = async request => { throw Object.assign(new Error('temporary upstream failure'), { status: 503 }); };
      for (let attempt = 1; attempt <= 3; attempt++) {
        const result = await scheduler.runContentPlanReviewJob(config);
        assert.equal(result.status, 'FAILED');
        const current = await db.contentPlan.findUnique({ where: { id: plan.id } });
        assert.equal(current.briaReviewAttempts, attempt);
        assert.equal(current.briaReviewState, attempt < 3 ? 'PENDING' : 'FAILED');
        tick = new Date(tick.getTime() + 10 * 60000);
      }
      assert.equal((await scheduler.runContentPlanReviewJob(config)).status, 'SKIPPED');
      await state.markContentPlanReviewPending(plan.id, { db, requestedAt: tick });
      assert.equal((await db.contentPlan.findUnique({ where: { id: plan.id } })).briaReviewAttempts, 0);
    });
    await t.test('expired worker cannot complete or fail a replacement worker', async () => {
      assert.equal(typeof state.claimContentPlanReview, 'function');
      const plan = await fixture();
      const old = await state.claimContentPlanReview(plan.id, { db, now: start, trigger: 'AUTOMATIC' });
      const later = new Date(start.getTime() + 10 * 60000);
      const replacement = await state.claimContentPlanReview(plan.id, { db, now: later, trigger: 'AUTOMATIC' });
      assert.ok(replacement);
      assert.notEqual(old.token, replacement.token);
      await assert.rejects(db.$transaction(tx => state.completeContentPlanReviewLease(tx, old, later)), { code: 'BRIA_REVIEW_SUPERSEDED' });
      await state.failContentPlanReview(old, new Error('late error'), { db, now: later });
      assert.equal((await db.contentPlan.findUnique({ where: { id: plan.id } })).briaReviewLeaseToken, replacement.token);
    });
    await t.test('scheduler recovers abandoned RUNNING work and respects retry delays', async () => {
      const plan = await fixture();
      await state.claimContentPlanReview(plan.id, { db, now: start, trigger: 'AUTOMATIC' });
      const later = new Date(start.getTime() + 10 * 60000);
      const config = options(plan.id);
      const outcomes = await scheduler.reconcilePendingContentPlanReviews({ db, now: () => later, limit: 100, reviewOptions: config.reviewOptions });
      assert.equal(outcomes.find(outcome => outcome.planId === plan.id)?.status, 'COMPLETED');
      const delayed = await fixture();
      await db.contentPlan.update({ where: { id: delayed.id }, data: { briaReviewNextAttemptAt: new Date(later.getTime() + 60000) } });
      const waiting = await scheduler.reconcilePendingContentPlanReviews({ db, now: () => later, limit: 100, reviewOptions: config.reviewOptions });
      assert.equal(waiting.some(outcome => outcome.planId === delayed.id), false);
    });
    await t.test('authentication errors stop retries, while an explicit rerun gets a fresh budget', async () => {
      const plan = await fixture();
      const config = { ...options(plan.id), logger: { error() {} } };
      config.reviewOptions.ai.generate = async request => { throw Object.assign(new Error('bad credentials fixture'), { status: 401 }); };
      assert.equal((await scheduler.runContentPlanReviewJob(config)).status, 'FAILED');
      assert.equal((await db.contentPlan.findUnique({ where: { id: plan.id } })).briaReviewState, 'FAILED');
      config.reviewOptions.ai.generate = async request => ({ text: JSON.stringify(reviewPayload(request, rawReview)) });
      assert.equal((await scheduler.runContentPlanReviewJob(config)).status, 'COMPLETED');
      assert.equal((await db.contentPlan.findUnique({ where: { id: plan.id } })).briaReviewAttempts, 1);
    });
    await t.test('repeated worker crashes end in a visible failure instead of infinite recovery', async () => {
      const plan = await fixture();
      for (let attempt = 0; attempt < 3; attempt++) {
        assert.ok(await state.claimContentPlanReview(plan.id, { db, trigger: 'AUTOMATIC', now: new Date(start.getTime() + attempt * 6 * 60000) }));
      }
      assert.equal(await state.claimContentPlanReview(plan.id, { db, trigger: 'AUTOMATIC', now: new Date(start.getTime() + 18 * 60000) }), null);
      assert.equal((await db.contentPlan.findUnique({ where: { id: plan.id } })).briaReviewState, 'FAILED');
    });
    await t.test('the additive startup schema is repeatable and preserves existing reviews and leases', async () => {
      const plan = await fixture();
      await scheduler.runContentPlanReviewJob(options(plan.id));
      const lease = await state.claimContentPlanReview(plan.id, { db, now: start, trigger: 'MANUAL' });
      const before = await db.contentPlan.findUnique({ where: { id: plan.id }, include: { briaReviews: true } });
      const script = fileURLToPath(new URL('../scripts/ensure-content-plan-reviews-schema.js', import.meta.url));
      for (let run = 0; run < 2; run++) {
        execFileSync(process.execPath, [script], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' });
      }
      const after = await db.contentPlan.findUnique({ where: { id: plan.id }, include: { briaReviews: true } });
      assert.deepEqual(after, before);
      assert.equal(after.briaReviewLeaseToken, lease.token);
      assert.equal(after.briaReviews.length, 1);
    });
    await t.test('deadline releases a hung job and late generation cannot publish', async () => {
      assert.equal(typeof scheduler.runContentPlanReviewJob, 'function');
      const plan = await fixture();
      let finish;
      const config = { ...options(plan.id), timeoutMs: 250, logger: { error() {} } };
      config.reviewOptions.ai.generate = () => new Promise(resolve => { finish = resolve; });
      const outcome = await scheduler.runContentPlanReviewJob(config);
      assert.equal(outcome.status, 'FAILED');
      assert.equal(outcome.error.code, 'BRIA_REVIEW_TIMEOUT');
      assert.ok(finish, 'AI generation was reached');
      finish({ text: JSON.stringify({ ...rawReview, reviewedItemIds: [] }) });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(await db.contentPlanReview.count({ where: { planId: plan.id } }), 0);
      assert.equal((await db.contentPlan.findUnique({ where: { id: plan.id } })).briaReviewLeaseToken, null);
    });
  } finally {
    for (const id of createdClients) await db.client.delete({ where: { id } });
    await db.$disconnect();
  }
});
