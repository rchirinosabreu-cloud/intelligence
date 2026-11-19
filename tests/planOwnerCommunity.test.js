import test from 'node:test';
import assert from 'node:assert/strict';
import { communityOf, syncClientPlanOwners, syncAllPlanOwners } from '../src/services/planOwnerService.js';

// Base en memoria con lo justo: clientes con su community y parrillas con su responsable.
const fakeDb = ({ clients, plans }) => ({
  plans,
  client: {
    findUnique: async ({ where }) => clients.find(c => c.id === where.id) || null,
    findMany: async () => clients.filter(c => c.responsibleId).map(c => ({ id: c.id }))
  },
  contentPlan: {
    updateMany: async ({ where, data }) => {
      const hits = plans.filter(p => p.clientId === where.clientId && p.deletedAt === null && p.status !== 'FINALIZADO'
        && (p.ownerId === null || p.ownerId !== data.ownerId));
      for (const plan of hits) plan.ownerId = data.ownerId;
      return { count: hits.length };
    }
  }
});

const kamila = { responsibleId: 'kamila', responsible: { isActive: true } };

test('el community activo es el responsable; uno inactivo o ninguno no cuenta', () => {
  assert.equal(communityOf(kamila), 'kamila');
  assert.equal(communityOf({ responsibleId: 'x', responsible: { isActive: false } }), null);
  assert.equal(communityOf({ responsibleId: null }), null);
});

test('las parrillas abiertas pasan al community; las finalizadas y borradas conservan su responsable', async () => {
  const db = fakeDb({
    clients: [{ id: 'bonsai', ...kamila }],
    plans: [
      { id: 'nov', clientId: 'bonsai', status: 'ACTIVO', deletedAt: null, ownerId: null },
      { id: 'dic', clientId: 'bonsai', status: 'PLANIFICACION', deletedAt: null, ownerId: 'otra' },
      { id: 'oct', clientId: 'bonsai', status: 'FINALIZADO', deletedAt: null, ownerId: 'otra' },
      { id: 'vieja', clientId: 'bonsai', status: 'ACTIVO', deletedAt: new Date(), ownerId: 'otra' }
    ]
  });
  assert.equal(await syncClientPlanOwners(db, 'bonsai'), 2);
  assert.deepEqual(db.plans.map(p => p.ownerId), ['kamila', 'kamila', 'otra', 'otra']);
  assert.equal(await syncClientPlanOwners(db, 'bonsai'), 0, 'idempotente');
});

test('un cliente sin community deja sus parrillas como están', async () => {
  const db = fakeDb({ clients: [{ id: 'sin', responsibleId: null }], plans: [{ id: 'p', clientId: 'sin', status: 'ACTIVO', deletedAt: null, ownerId: 'alguien' }] });
  assert.equal(await syncClientPlanOwners(db, 'sin'), 0);
  assert.equal(db.plans[0].ownerId, 'alguien');
});

test('la pasada de arranque recorre todos los clientes con community', async () => {
  const db = fakeDb({
    clients: [{ id: 'a', ...kamila }, { id: 'b', responsibleId: 'brian', responsible: { isActive: true } }, { id: 'c', responsibleId: null }],
    plans: [
      { id: 'a1', clientId: 'a', status: 'ACTIVO', deletedAt: null, ownerId: null },
      { id: 'b1', clientId: 'b', status: 'ACTIVO', deletedAt: null, ownerId: 'brian' },
      { id: 'c1', clientId: 'c', status: 'ACTIVO', deletedAt: null, ownerId: null }
    ]
  });
  assert.deepEqual(await syncAllPlanOwners(db), { plans: 1, clients: 1 });
  assert.deepEqual(db.plans.map(p => p.ownerId), ['kamila', 'brian', null]);
});
