import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { getSafeTestDatabaseUrl } from './helpers/testDatabase.js';
import { createClientCriterionService } from '../src/services/briaClientCriterionService.js';
const url = getSafeTestDatabaseUrl();
test('discovery persists unapproved proposals, isolates clients, retries and protects human decisions', { skip: !url }, async t => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const clients = [], users = [], members = [];
  try {
    const user = await db.user.create({ data: { name: 'Owner', email: `${randomUUID()}@discovery.test`, password: 'not-login', role: 'EDITOR', modulePermissions: { parrillas: true } } }); users.push(user.id);
    const stranger = await db.user.create({ data: { name: 'Other', email: `${randomUUID()}@discovery.test`, password: 'not-login', role: 'EDITOR', modulePermissions: { parrillas: true } } }); users.push(stranger.id);
    const member = await db.teamMember.create({ data: { name: 'Owner', role: 'Editor', userId: user.id } }); members.push(member.id);
    const client = await db.client.create({ data: { name: 'Discovery fixture', slug: `discovery-${randomUUID()}` } }); clients.push(client.id);
    const plan = await db.contentPlan.create({ data: { clientId: client.id, ownerId: member.id, month: 9, year: 2026, internalNotes: 'Usar tú en septiembre.', briaReviewState: 'CURRENT' } });
    const sibling = await db.contentPlan.create({ data: { clientId: client.id, ownerId: member.id, month: 10, year: 2026 } });
    const criteria = createClientCriterionService(db);
    const { createCriterionDiscoveryService } = await import('../src/services/briaCriterionDiscoveryService.js').catch(() => ({}));
    assert.equal(typeof createCriterionDiscoveryService, 'function');
    let calls = 0, fail = false, during = null;
    const service = createCriterionDiscoveryService({ db, generate: async ({ sources }) => {
      calls++; if (during) await during(); if (fail) throw new Error('Provider unavailable');
      return { text: JSON.stringify({ proposals: [{ category: 'MARCA', text: 'Usar tú en esta parrilla.', reason: 'Nota interna; necesita validación humana.', scope: 'PLAN', scopePlanId: plan.id, basis: 'EXPLICIT', evidence: [{ sourceId: sources[0].id, quote: sources[0].text }], conflicts: [] }] }), model: 'fake-model' };
    } });
    const request = { planId: plan.id, actorUserId: user.id };
    let candidate;
    await t.test('unauthorized user cannot spend AI calls', async () => {
      await assert.rejects(service.discover({ ...request, actorUserId: stranger.id }), { status: 403 }); assert.equal(calls, 0);
    });
    await t.test('sources create PROPOSED only, shared results and unchanged sources do not run again', async () => {
      assert.equal((await service.discover(request)).state, 'COMPLETED');
      candidate = (await criteria.list(request)).criteria[0];
      assert.equal(candidate.status, 'PROPOSED'); assert.equal(candidate.provenance.origin, 'BRIA');
      assert.equal(candidate.scope, 'PLAN'); assert.equal(candidate.sourcePlanId, plan.id);
      assert.deepEqual(await criteria.approved(client.id, plan.id), []);
      assert.equal((await db.contentPlan.findUnique({ where: { id: plan.id } })).briaReviewState, 'CURRENT');
      await service.discover(request); assert.equal(calls, 1);
    });
    await t.test('owner can adjust a draft with audit/version, but not an approved rule; scope is enforced', async () => {
      await assert.rejects(criteria.edit({ ...request, actorUserId: stranger.id, criterionId: candidate.id, version: 1, text: 'Cambio', category: 'MARCA', reason: 'No permitido', scope: 'CLIENT' }), { status: 403 });
      candidate = await criteria.edit({ ...request, criterionId: candidate.id, version: 1, text: 'En septiembre usar tú y un tono cercano.', category: 'MARCA', reason: 'Ajuste validado por el responsable.', scope: 'PLAN' });
      assert.equal(candidate.version, 2); assert.equal(candidate.history.at(-1).action, 'EDIT');
      await assert.rejects(criteria.edit({ ...request, criterionId: candidate.id, version: 1, text: 'Cambio', category: 'MARCA', reason: 'Vieja versión', scope: 'PLAN' }), { status: 409 });
      candidate = await criteria.decide({ ...request, criterionId: candidate.id, action: 'APPROVE', version: 2, reason: 'Aplica a septiembre.' });
      assert.equal((await criteria.approved(client.id, plan.id)).length, 1);
      assert.equal((await criteria.approved(client.id, sibling.id)).length, 0);
      assert.equal((await criteria.approved(client.id)).length, 0);
      await assert.rejects(criteria.edit({ ...request, criterionId: candidate.id, version: 3, text: 'Cambio', category: 'MARCA', reason: 'No silencioso', scope: 'CLIENT' }), { status: 409 });
    });
    await t.test('changed sources during generation invalidate publication; provider errors are visible and retryable', async () => {
      await db.contentPlan.update({ where: { id: plan.id }, data: { internalNotes: 'Nuevo acuerdo.' } });
      during = () => db.contentPlan.update({ where: { id: plan.id }, data: { internalNotes: 'Acuerdo aún más reciente.' } });
      await assert.rejects(service.discover(request), { status: 409 });
      assert.equal(await db.clientEditorialCriterion.count({ where: { clientId: client.id } }), 1);
      during = null; fail = true;
      await assert.rejects(service.discover(request), /Provider unavailable/);
      assert.equal((await service.status(request)).state, 'FAILED');
      fail = false; assert.equal((await service.discover(request)).state, 'COMPLETED');
    });
    await t.test('two users share a lease, expired work is recoverable and criteria edits invalidate publication', async () => {
      await db.contentPlan.update({ where: { id: plan.id }, data: { internalNotes: 'Acuerdo para comprobar concurrencia.' } });
      let release, entered;
      const started = new Promise(resolve => { entered = resolve; });
      during = () => { entered(); return new Promise(resolve => { release = resolve; }); };
      const first = service.discover(request); await started;
      const count = calls;
      assert.equal((await service.discover(request)).state, 'RUNNING'); assert.equal(calls, count);
      release(); await first; during = null;
      await db.contentPlan.update({ where: { id: plan.id }, data: { internalNotes: 'Otra versión de prueba.' } });
      await db.clientCriterionDiscovery.update({ where: { clientId: client.id }, data: { state: 'RUNNING', startedAt: new Date(0), leaseToken: 'abandoned' } });
      assert.equal((await service.status(request)).state, 'INTERRUPTED');
      assert.equal((await service.discover(request)).state, 'COMPLETED');
      await db.contentPlan.update({ where: { id: plan.id }, data: { internalNotes: 'Un cambio simultáneo con aprobación.' } });
      during = () => criteria.propose({ ...request, requestId: randomUUID(), text: 'Nueva regla manual.', category: 'MARCA', reason: 'Guía del equipo.' });
      await assert.rejects(service.discover(request), { status: 409 }); during = null;
    });
    await t.test('timeout aborts provider and does not publish late results; compatible completed batches resume', async () => {
      await db.contentPlan.update({ where: { id: plan.id }, data: { internalNotes: 'Texto para timeout.' } });
      let signal;
      const slow = createCriterionDiscoveryService({ db, timeoutMs: 15, generate: async args => { signal = args.signal; return new Promise(() => {}); } });
      await assert.rejects(slow.discover(request), { status: 504 }); assert.equal(signal.aborted, true);
      assert.equal((await service.status(request)).state, 'FAILED');
      await db.contentPlan.update({ where: { id: plan.id }, data: { internalNotes: JSON.stringify(Array.from({ length: 25 }, (_, i) => `Nota ${i} del equipo.`)) } });
      let batchCalls = 0;
      const resumable = createCriterionDiscoveryService({ db, generate: async () => {
        batchCalls++; if (batchCalls === 2) throw new Error('Batch failure');
        return { text: '{"proposals":[]}', model: 'fake' };
      } });
      await assert.rejects(resumable.discover(request), /Batch failure/);
      assert.equal((await service.status(request)).processedBatches, 1);
      await resumable.discover(request); assert.equal(batchCalls, 4); // 3 batches, first one is not repeated.
    });
    await t.test('deleting a suggestion removes text/history; unchanged evidence cannot recreate it even after unrelated new notes', async () => {
      const deletable = await db.clientEditorialCriterion.findFirst({ where: { clientId: client.id, provenance: { path: ['origin'], equals: 'BRIA' } } });
      const keysBefore = (await db.clientCriterionDiscovery.findUnique({ where: { clientId: client.id } })).seenKeys;
      await db.clientEditorialCriterion.delete({ where: { id: deletable.id } });
      // Simulates the already-tested admin hard-delete. Discovery only retains non-reversible evidence hashes.
      assert.ok(keysBefore.length > 0);
      assert.ok(keysBefore.every(key => /^[a-f0-9]{64}$/.test(key)));
      assert.equal(await db.clientEditorialCriterion.findUnique({ where: { id: deletable.id } }), null);
      const before = calls; await service.discover(request); assert.equal(calls, before);
      await db.contentPlan.update({ where: { id: plan.id }, data: { internalNotes: 'Usar tú en septiembre.' } });
      await db.contentPlan.update({ where: { id: sibling.id }, data: { internalNotes: 'Una nota nueva sin relación con el tratamiento.' } });
      const rephrased = createCriterionDiscoveryService({ db, generate: async ({ sources }) => {
        const original = sources.find(s => s.text === 'Usar tú en septiembre.');
        return { text: JSON.stringify({ proposals: [{ category: 'MARCA', text: 'Preferir el tratamiento cercano de tú.', reason: 'Misma evidencia, distinta redacción.', scope: 'PLAN', scopePlanId: plan.id, basis: 'EXPLICIT', evidence: [{ sourceId: original.id, quote: original.text }], conflicts: [] }] }) };
      } });
      assert.equal((await rephrased.discover(request)).result.created, 0);
    });
  } finally {
    await db.client.deleteMany({ where: { id: { in: clients } } });
    await db.teamMember.deleteMany({ where: { id: { in: members } } });
    await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
  }
});
