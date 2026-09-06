import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { getSafeTestDatabaseUrl } from './helpers/testDatabase.js';
import { createClientCriterionService } from '../src/services/briaClientCriterionService.js';
import { claimContentPlanReview } from '../src/services/briaContentPlanReviewState.js';
import { createContentPlanReviewRepository } from '../src/services/briaContentPlanReviewService.js';

const url = getSafeTestDatabaseUrl();
test('client criteria: real PostgreSQL persistence, authorization, atomic history and review invalidation', { skip: !url }, async t => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const service = createClientCriterionService(db);
  const clients = [], users = [], members = [];
  try {
    const makeUser = async (role = 'EDITOR') => {
      const user = await db.user.create({ data: { name: 'Criterion test', email: `${randomUUID()}@criteria.test`, password: 'not-a-login', role, modulePermissions: { parrillas: true } } });
      users.push(user.id);
      return user;
    };
    const owner = await makeUser(), stranger = await makeUser(), pm = await makeUser('PROJECT_MANAGER'), admin = await makeUser('ADMIN');
    const member = await db.teamMember.create({ data: { name: 'Plan owner test', role: 'Editor', userId: owner.id } });
    members.push(member.id);
    const makePlan = async () => {
      const client = await db.client.create({ data: { name: 'Criteria test', slug: `criteria-${randomUUID()}` } });
      clients.push(client.id);
      return db.contentPlan.create({ data: { clientId: client.id, ownerId: member.id, month: 9, year: 2026, briaReviewState: 'CURRENT' } });
    };
    const plan = await makePlan(), other = await makePlan();
    const sibling = await db.contentPlan.create({ data: { clientId: plan.clientId, month: 10, year: 2026, briaReviewState: 'CURRENT' } });
    const archived = await db.contentPlan.create({ data: { clientId: plan.clientId, month: 8, year: 2026, status: 'FINALIZADO', briaReviewState: 'CURRENT' } });
    const input = { text: 'Usar tú y evitar tratamientos formales.', category: 'MARCA', reason: 'Guía vigente del cliente.', requestId: randomUUID() };
    let proposed;
    await t.test('proposal is durable and idempotent, not approved memory and not queued', async () => {
      proposed = await service.propose({ planId: plan.id, actorUserId: stranger.id, ...input });
      assert.equal(proposed.status, 'PROPOSED');
      assert.equal(proposed.history[0].actorUserId, stranger.id);
      assert.equal(proposed.history[0].planId, plan.id);
      assert.equal((await service.propose({ planId: plan.id, actorUserId: stranger.id, ...input })).id, proposed.id);
      assert.deepEqual(await service.approved(plan.clientId), []);
      assert.equal((await db.contentPlan.findUnique({ where: { id: plan.id } })).briaReviewState, 'CURRENT');
    });
    await t.test('read permissions are computed on server; cross-client and unauthorized decisions fail', async () => {
      assert.equal((await service.list({ planId: plan.id, actorUserId: owner.id })).criteria[0].canValidate, true);
      assert.equal((await service.list({ planId: plan.id, actorUserId: stranger.id })).criteria[0].canValidate, false);
      await assert.rejects(service.decide({ planId: plan.id, criterionId: proposed.id, actorUserId: stranger.id, action: 'APPROVE', version: 1, reason: 'Intento no permitido' }), { status: 403 });
      await assert.rejects(service.decide({ planId: other.id, criterionId: proposed.id, actorUserId: admin.id, action: 'APPROVE', version: 1, reason: 'Cliente incorrecto' }), { status: 404 });
      assert.equal((await db.clientEditorialCriterion.findUnique({ where: { id: proposed.id } })).history.length, 1);
    });
    await t.test('owner approval is shared client-only, records exact rule version and cancels stale workers', async () => {
      const now = new Date();
      const lease = await claimContentPlanReview(plan.id, { db, now, trigger: 'MANUAL' });
      const approved = await service.decide({ planId: plan.id, criterionId: proposed.id, actorUserId: owner.id, action: 'APPROVE', version: 1, reason: 'Responsable confirma guía vigente.' });
      assert.equal(approved.version, 2);
      assert.equal(approved.history[1].actorUserId, owner.id);
      assert.equal(approved.history[1].version, 2);
      assert.equal((await service.approved(plan.clientId))[0].text, input.text);
      assert.deepEqual(await service.approved(other.clientId), []);
      for (const id of [plan.id, sibling.id]) assert.equal((await db.contentPlan.findUnique({ where: { id } })).briaReviewState, 'PENDING');
      assert.equal((await db.contentPlan.findUnique({ where: { id: other.id } })).briaReviewState, 'CURRENT');
      assert.equal((await db.contentPlan.findUnique({ where: { id: archived.id } })).briaReviewState, 'STALE');
      await assert.rejects(createContentPlanReviewRepository(db).saveCheckpoint(plan.id, {}, { execution: lease, now: () => now }), { code: 'BRIA_REVIEW_SUPERSEDED' });
    });
    await t.test('concurrent manager decisions have one winner, revocation stops memory use without deleting history', async () => {
      const results = await Promise.allSettled([pm, admin].map(actor => service.decide({ planId: plan.id, criterionId: proposed.id, actorUserId: actor.id, action: 'REVOKE', version: 2, reason: 'Cambio de guía validado.' })));
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
      const saved = await db.clientEditorialCriterion.findUnique({ where: { id: proposed.id } });
      assert.equal(saved.history.length, 3);
      assert.equal(saved.status, 'REVOKED');
      assert.deepEqual(await service.approved(plan.clientId), []);
    });
    await t.test('queue failure rolls back approval and audit event', async () => {
      const criterion = await service.propose({ planId: plan.id, actorUserId: owner.id, ...input, requestId: randomUUID() });
      const broken = { $transaction: fn => db.$transaction(tx => fn(new Proxy(tx, { get(target, key) {
        if (key === 'contentPlan') return new Proxy(tx.contentPlan, { get(model, op) {
          if (op === 'updateMany') return () => { throw new Error('queue fixture failure'); };
          return model[op];
        } });
        return target[key];
      } }))) };
      await assert.rejects(createClientCriterionService(broken).decide({ planId: plan.id, criterionId: criterion.id, actorUserId: owner.id, action: 'APPROVE', version: 1, reason: 'Confirmado.' }), /queue fixture failure/);
      const saved = await db.clientEditorialCriterion.findUnique({ where: { id: criterion.id } });
      assert.equal(saved.status, 'PROPOSED');
      assert.equal(saved.history.length, 1);
    });
  } finally {
    await db.client.deleteMany({ where: { id: { in: clients } } });
    await db.teamMember.deleteMany({ where: { id: { in: members } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
});
