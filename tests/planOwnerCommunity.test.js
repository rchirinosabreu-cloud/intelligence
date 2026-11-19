import test from 'node:test';
import assert from 'node:assert/strict';
import { communityOf, syncClientPlanOwners, syncAllPlanOwners } from '../src/services/planOwnerService.js';
import { publicationAssigneeProblem } from '../src/lib/contentTaskReciprocity.js';

// Base en memoria con lo justo: clientes con su community, parrillas con su responsable y pendientes.
const fakeDb = ({ clients, plans, tasks = [] }) => ({
  plans, tasks,
  client: {
    findUnique: async ({ where }) => clients.find(c => c.id === where.id) || null,
    findMany: async () => clients.filter(c => c.responsibleId).map(c => ({ id: c.id }))
  },
  contentPlan: {
    findMany: async ({ where }) => plans.filter(p => p.clientId === where.clientId && p.deletedAt === null && p.status !== 'FINALIZADO'
      && where.OR.some(cond => ('ownerId' in cond && cond.ownerId === null ? p.ownerId === null : p.ownerId !== null && p.ownerId !== cond.ownerId?.not)))
      .map(p => ({ id: p.id, ownerId: p.ownerId })),
    update: async ({ where, data }) => Object.assign(plans.find(p => p.id === where.id), data)
  },
  task: {
    updateMany: async ({ where, data }) => {
      const owners = where.OR.map(cond => cond.assigneeId);
      const hits = tasks.filter(t => t.planId === where.contentItem.planId && t.title.startsWith(where.title.startsWith)
        && t.status !== 'REALIZADA' && owners.includes(t.assigneeId));
      for (const task of hits) task.assigneeId = data.assigneeId;
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

test('los «Publicar» abiertos pasan del responsable anterior al nuevo; uno que dio un admin a otra persona se respeta', async () => {
  const db = fakeDb({
    clients: [{ id: 'promo', ...kamila }],
    plans: [{ id: 'nov', clientId: 'promo', status: 'ACTIVO', deletedAt: null, ownerId: 'rodny' }],
    tasks: [
      { id: 't1', planId: 'nov', title: '[Publicar] Reel: Experiencia', status: 'PENDIENTE', assigneeId: 'rodny' },
      { id: 't2', planId: 'nov', title: '[Publicar] Reel: Colonoscopia', status: 'PENDIENTE', assigneeId: 'mariceth' },
      { id: 't3', planId: 'nov', title: '[Publicar] Post: Ya salió', status: 'REALIZADA', assigneeId: 'rodny' },
      { id: 't4', planId: 'nov', title: '[Producción] Reel: Experiencia', status: 'PENDIENTE', assigneeId: 'rodny' }
    ]
  });
  await syncClientPlanOwners(db, 'promo');
  assert.deepEqual(db.tasks.map(t => t.assigneeId), ['kamila', 'mariceth', 'rodny', 'rodny']);
});

test('solo un administrador cambia el responsable de un «Publicar» automático', () => {
  const task = { contentItemId: 'pieza', title: '[Publicar] Reel: Experiencia', assigneeId: 'kamila' };
  assert.match(publicationAssigneeProblem({ task, payload: { assigneeId: 'rodny' }, role: 'COMMUNITY' }), /Solo un administrador/);
  assert.match(publicationAssigneeProblem({ task, payload: { assigneeId: 'rodny' }, role: 'PROJECT_MANAGER' }), /Solo un administrador/);
  assert.equal(publicationAssigneeProblem({ task, payload: { assigneeId: 'rodny' }, role: 'ADMIN' }), null);
  assert.equal(publicationAssigneeProblem({ task, payload: { assigneeId: 'kamila', status: 'EN_CURSO' }, role: 'COMMUNITY' }), null, 'guardar sin cambiarlo');
  assert.equal(publicationAssigneeProblem({ task, payload: { status: 'EN_CURSO' }, role: 'COMMUNITY' }), null);
  assert.equal(publicationAssigneeProblem({ task: { ...task, contentItemId: null }, payload: { assigneeId: 'rodny' }, role: 'COMMUNITY' }), null, 'uno suelto no');
  assert.equal(publicationAssigneeProblem({ task: { ...task, title: '[Producción] Reel' }, payload: { assigneeId: 'rodny' }, role: 'COMMUNITY' }), null);
});
