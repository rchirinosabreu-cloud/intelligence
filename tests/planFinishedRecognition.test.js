import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsFinished, planCountsForFinished } from '../src/services/recognitionRules.js';
import { grantFinishedPlans, recordPlanFinished } from '../src/services/recognitionService.js';

test('«Parrilla terminada»: con piezas y ninguna en borrador; la papelera no cuenta', () => {
  assert.equal(planIsFinished([]), false);
  assert.equal(planIsFinished([{ status: 'EN_REVISION' }, { status: 'BORRADOR' }]), false);
  assert.equal(planIsFinished([{ status: 'EN_REVISION' }, { status: 'PUBLICADO' }, { status: 'BORRADOR', deletedAt: new Date() }]), true);
  assert.equal(planIsFinished([{ status: 'DEVUELTO' }, { status: 'APROBADO' }]), true);
});

test('«Parrilla terminada» rige desde las parrillas de noviembre de 2026', () => {
  assert.equal(planCountsForFinished({ year: 2026, month: 10 }), false);
  assert.equal(planCountsForFinished({ year: 2026, month: 11 }), true);
  assert.equal(planCountsForFinished({ year: 2026, month: 12 }), true);
  assert.equal(planCountsForFinished({ year: 2027, month: 1 }), true);
});

function fakeDb(plans, existing = []) {
  const awards = [...existing], events = [];
  const tx = {
    user: { findUnique: async ({ where }) => ({ id: where.id, isActive: where.id !== 'inactive' }) },
    recognitionAward: {
      findMany: async ({ where }) => awards.filter(award => where.planId.in.includes(award.planId)),
      createMany: async ({ data }) => {
        const fresh = data.filter(row => !awards.some(award => award.dedupeKey === row.dedupeKey));
        awards.push(...fresh);
        return { count: fresh.length };
      },
    },
    operationalTraceEvent: { create: async ({ data }) => events.push(data) },
    contentPlan: { findMany: async () => plans },
  };
  tx.$executeRaw = async () => 0;
  tx.$transaction = async (work) => work(tx);
  return { db: tx, awards, events };
}
const plan = (id, ownerUser, statuses, extra = {}) => ({ id, year: 2026, month: 11, deletedAt: null, ownerId: `m-${ownerUser}`,
  owner: { id: `m-${ownerUser}`, userId: ownerUser, isActive: true }, contentItems: statuses.map((status, i) => ({ id: `${id}-${i}`, status })), ...extra });

test('el repaso entrega una vez por parrilla terminada y a su responsable', async () => {
  const at = new Date('2026-11-26T22:00:00Z');
  const { db, awards } = fakeDb([
    plan('sara-1', 'sara', ['EN_REVISION', 'PUBLICADO']),
    plan('sara-2', 'sara', ['APROBADO']),
    plan('helen-1', 'helen', ['BORRADOR', 'EN_REVISION']),
    plan('vacia', 'helen', []),
    plan('inactiva', 'inactive', ['PUBLICADO']),
  ]);
  const granted = await grantFinishedPlans(db, at);
  assert.deepEqual(granted.map(row => row.planId), ['sara-1', 'sara-2']);
  assert.deepEqual(awards.map(row => [row.kind, row.recipientId, row.dedupeKey]), [
    ['PLAN_FINISHED', 'sara', 'v1:PLAN_FINISHED:sara-1'], ['PLAN_FINISHED', 'sara', 'v1:PLAN_FINISHED:sara-2']]);
  assert.deepEqual(await grantFinishedPlans(db, at), [], 'no se repite');
  assert.equal(await recordPlanFinished(db, plan('sara-1', 'sara', ['PUBLICADO']), at), null, 'la clave es la parrilla');
});
