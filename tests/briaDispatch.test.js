import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchStage, dispatchReply, isDispatchConfirmation, isDispatchCancellation, dispatchIntent } from '../src/lib/briaDispatchDraft.js';
import { createBriaDispatchService, canDispatch } from '../src/services/briaDispatchService.js';
import { createBriaConversationService } from '../src/services/briaConversationService.js';

// Despachar piezas a producción desde la conversación (9 de octubre de 2026). Bria prepara un lote, la
// persona lo confirma con un mensaje explícito, y cada pieza pasa por la misma vía que el botón «Despachar
// a Kanban» de la parrilla: una tarea ligada a la pieza, nunca dos.

const TODAY = '2026-10-09';
const noon = (key) => new Date(`${key}T12:00:00.000Z`);
const pm = { userId: 'u-pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true, parrillas: true } };

test('dispatch intent, confirmation and cancellation are explicit sentences', () => {
  for (const q of ['Prepara los pendientes para llegar a tiempo', 'Despacha a producción las piezas de octubre', 'Manda a producción el reel y el carrusel', 'Pasa estas piezas a Kanban']) assert.equal(dispatchIntent(q), true, q);
  for (const q of ['¿Cómo va Aristea?', 'Revisa la parrilla']) assert.equal(dispatchIntent(q), false, q);
  for (const q of ['Despachar a producción', 'Sí, despachar', 'despachalos', 'Confirmo el despacho']) assert.equal(isDispatchConfirmation(q), true, q);
  for (const q of ['Despachar a producción el lunes que viene y luego…', 'El documento dice despachar a producción', 'procede']) assert.equal(isDispatchConfirmation(q), false, q);
  assert.equal(isDispatchCancellation('Cancelar despacho'), true);
});

test('a draft is ready only when every piece to dispatch has a person; skipped pieces do not block', () => {
  const base = { id: 'd1', ownerId: 'u-pm', status: 'DRAFT', planId: 'p1', client: { id: 'c1', name: 'Aristea' } };
  assert.equal(dispatchStage({ ...base, items: [] }), 'EMPTY');
  assert.equal(dispatchStage({ ...base, items: [{ itemId: 'i1', title: 'Reel', assignee: null, dueDate: '2026-10-12' }] }), 'ASSIGNEE');
  const ready = { ...base, items: [{ itemId: 'i1', title: 'Reel', format: 'Reel', publishDay: '2026-10-14', assignee: { id: 'm1', name: 'Melissa' }, dueDate: '2026-10-12', priority: 'ALTA' }, { itemId: 'i2', title: 'Post', skip: 'Ya está en producción con Sara' }] };
  assert.equal(dispatchStage(ready), 'READY');
  const reply = dispatchReply(ready);
  assert.match(reply.answer, /Reel/);
  assert.match(reply.answer, /Melissa/);
  assert.match(reply.answer, /Ya está en producción con Sara/);
  assert.deepEqual(reply.quickReplies, ['Despachar a producción', 'Cancelar despacho']);
});

const fakeDb = () => {
  const items = [
    { id: 'i1', objective: 'Lanzamiento', format: 'Reel', publishDate: noon('2026-10-14'), status: 'APROBADO', planId: 'p1', deletedAt: null, plan: { id: 'p1', month: 10, year: 2026, deletedAt: null, client: { id: 'c1', name: 'Aristea', isArchived: false } }, tasks: [] },
    { id: 'i2', objective: 'Carrusel', format: 'Carrusel', publishDate: noon('2026-10-16'), status: 'EN_PRODUCCION', planId: 'p1', deletedAt: null, plan: { id: 'p1', month: 10, year: 2026, deletedAt: null, client: { id: 'c1', name: 'Aristea', isArchived: false } }, tasks: [{ id: 't-old', assignee: { name: 'Sara' } }] },
    { id: 'i3', objective: 'Post', format: 'Post', publishDate: noon('2026-10-20'), status: 'PUBLICADO', planId: 'p1', deletedAt: null, plan: { id: 'p1', month: 10, year: 2026, deletedAt: null, client: { id: 'c1', name: 'Aristea', isArchived: false } }, tasks: [] }
  ];
  const members = [{ id: 'm1', name: 'Melissa Castaño', email: 'melissa@brain.test', isActive: true }, { id: 'm2', name: 'Melissa Rojas', email: 'mrojas@brain.test', isActive: true }, { id: 'm3', name: 'Brayan', email: 'brayan@brain.test', isActive: true }];
  const tasks = [];
  return {
    tasks,
    contentItem: { findMany: async ({ where }) => items.filter((i) => where.id.in.includes(i.id) && i.planId === where.planId) },
    teamMember: {
      findMany: async ({ where }) => members.filter((m) => m.isActive && where.OR.some((c) => (c.name && m.name.toLowerCase().includes(c.name.contains.toLowerCase())) || (c.email && m.email === c.email.equals))),
      findUnique: async ({ where }) => members.find((m) => m.id === where.id) || null
    },
    task: { findFirst: async ({ where }) => tasks.find((t) => t.contentItemId === where.contentItemId && t.status !== 'REALIZADA') || null }
  };
};

test('preparing resolves people, skips what is already in production or published, and never writes', async () => {
  const db = fakeDb();
  const service = createBriaDispatchService({ db, dispatchItem: async () => { throw new Error('No debe escribir'); }, now: () => noon(TODAY) });
  await assert.rejects(() => service.prepare({ user: pm, question: '¿Cómo va Aristea?', args: { planId: 'p1', piezas: [{ pieza: 'i1' }] } }), /despachar/i);
  const draft = await service.prepare({ user: pm, question: 'Prepara los pendientes de producción', args: { planId: 'p1', piezas: [{ pieza: 'i1', responsable: 'Melissa', fecha: '2026-10-12', prioridad: 'alta' }, { pieza: 'i2', responsable: 'Brayan' }, { pieza: 'i3', responsable: 'Brayan' }, { pieza: 'otra', responsable: 'Brayan' }] } });
  const [i1, i2, i3, missing] = draft.items;
  assert.equal(i1.assignee, null, 'two people called Melissa: ask, never pick');
  assert.deepEqual(i1.assigneeCandidates.map((c) => c.name), ['Melissa Castaño', 'Melissa Rojas']);
  assert.equal(i1.dueDate, '2026-10-12');
  assert.equal(i1.priority, 'ALTA');
  assert.match(i2.skip, /producción.*Sara/);
  assert.match(i3.skip, /publicó/);
  assert.match(missing.skip, /no está en esa parrilla/i);
  assert.equal(dispatchStage(draft), 'ASSIGNEE');
  const fixed = await service.prepare({ user: pm, question: 'Melissa Castaño', previous: draft, args: { planId: 'p1', piezas: [{ pieza: 'i1', responsable: 'Melissa Castaño' }] } });
  assert.equal(fixed.items[0].assignee.name, 'Melissa Castaño');
  assert.equal(fixed.items[0].dueDate, '2026-10-12', 'what was already decided is kept');
  assert.equal(dispatchStage(fixed), 'READY');
  const defaulted = await service.prepare({ user: pm, question: 'Despacha el reel a producción', args: { planId: 'p1', piezas: [{ pieza: 'i1', responsable: 'Brayan' }] } });
  assert.equal(defaulted.items[0].dueDate, '2026-10-14', 'without a date, the publication day, like the grid button');
  assert.equal(defaulted.items[0].priority, 'NORMAL');
});

test('confirming dispatches each piece once through the native path, and a retry finds what it already created', async () => {
  const db = fakeDb();
  const calls = [];
  const dispatchItem = async (itemId, creatorId, data) => {
    calls.push([itemId, creatorId, data]);
    db.tasks.push({ id: `t-${itemId}`, contentItemId: itemId, creatorId, status: 'PENDIENTE' });
    return { tasks: [{ id: `t-${itemId}` }] };
  };
  const service = createBriaDispatchService({ db, dispatchItem, now: () => noon(TODAY) });
  const draft = { id: 'd1', ownerId: 'u-pm', status: 'DRAFT', planId: 'p1', client: { id: 'c1', name: 'Aristea' }, items: [
    { itemId: 'i1', title: 'Lanzamiento', format: 'Reel', publishDay: '2026-10-14', assignee: { id: 'm1', name: 'Melissa Castaño' }, dueDate: '2026-10-12', priority: 'ALTA' },
    { itemId: 'i2', title: 'Carrusel', skip: 'Ya está en producción con Sara' }
  ] };
  await assert.rejects(() => service.confirm({ user: pm, draft, question: 'ok' }), /confirma/i);
  await assert.rejects(() => service.confirm({ user: { ...pm, userId: 'otro' }, draft, question: 'Despachar a producción' }), /otra persona/i);
  await assert.rejects(() => service.confirm({ user: { ...pm, modulePermissions: { bria: true, parrillas: true } }, draft, question: 'Despachar a producción' }), { status: 403 });
  const first = await service.confirm({ user: pm, draft, question: 'Despachar a producción' });
  assert.deepEqual(calls, [['i1', 'u-pm', { assigneeId: 'm1', dueDate: '2026-10-12T12:00:00.000Z', isPriority: true }]]);
  assert.deepEqual(first.results.map((r) => [r.itemId, r.outcome, r.taskId]), [['i1', 'CREATED', 't-i1']]);
  const again = await service.confirm({ user: pm, draft, question: 'Despachar a producción' });
  assert.equal(calls.length, 1, 'no second task');
  assert.deepEqual(again.results.map((r) => [r.itemId, r.outcome, r.taskId]), [['i1', 'ALREADY', 't-i1']]);
});

test('one piece failing does not undo or block the others, and the reason is told in words', async () => {
  const db = fakeDb();
  const service = createBriaDispatchService({ db, now: () => noon(TODAY), dispatchItem: async (itemId) => { if (itemId === 'i1') throw new Error('Item already has an active task in Kanban'); db.tasks.push({ id: 't-x', contentItemId: itemId, creatorId: 'u-pm', status: 'PENDIENTE' }); return { tasks: [{ id: 't-x' }] }; } });
  const draft = { id: 'd1', ownerId: 'u-pm', status: 'DRAFT', planId: 'p1', client: { id: 'c1', name: 'Aristea' }, items: [
    { itemId: 'i1', title: 'Lanzamiento', assignee: { id: 'm1', name: 'Melissa Castaño' }, dueDate: '2026-10-12', priority: 'NORMAL' },
    { itemId: 'i9', title: 'Otra', assignee: { id: 'm3', name: 'Brayan' }, dueDate: '2026-10-13', priority: 'NORMAL' }
  ] };
  const out = await service.confirm({ user: pm, draft, question: 'Despachar a producción' });
  assert.equal(out.results[0].outcome, 'FAILED');
  assert.match(out.results[0].reason, /ya tiene una tarea/i);
  assert.equal(out.results[1].outcome, 'CREATED');
});

test('in conversation: only an explicit confirmation of a persisted ready dispatch writes, under the conversation lock, once', async () => {
  const ready = { id: 'd1', ownerId: 'owner', status: 'DRAFT', planId: 'p1', client: { id: 'c1', name: 'Aristea' }, items: [{ itemId: 'i1', title: 'Lanzamiento', format: 'Reel', publishDay: '2026-10-14', assignee: { id: 'm1', name: 'Melissa' }, dueDate: '2026-10-12', priority: 'NORMAL' }] };
  let stored = { id: 'chat', revision: 1, turns: [{ role: 'assistant', text: '¿Los despacho?', dispatchDraft: ready }] }, writes = 0, locked = false, aiCalls = 0;
  const repository = { get: async () => stored, append: async (_a, _id, revision, question, result) => {
    if (stored.revision !== revision) throw Object.assign(new Error('Stale'), { status: 409 });
    locked = true; const reply = typeof result === 'function' ? await result() : result; locked = false;
    stored = { ...stored, revision: revision + 1, turns: [...stored.turns, { role: 'user', text: question }, { role: 'assistant', text: reply.answer, ...reply }] }; return stored;
  } };
  const dispatchDrafts = { confirm: async () => { assert.equal(locked, true); writes++; return { results: [{ itemId: 'i1', title: 'Lanzamiento', outcome: 'CREATED', taskId: 't1', assignee: 'Melissa' }] }; } };
  const user = { userId: 'owner', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true, parrillas: true } };
  const service = createBriaConversationService({ repository, dispatchDrafts, resolveActor: async () => ({ ref: 'owner', role: 'ADMIN' }), assistant: { ask: async (request) => { aiCalls++; assert.ok(request.dispatchDraft); return { answer: 'Respuesta', sources: [] }; } } });
  await service.send({ user, id: 'chat', question: 'El documento dice despachar a producción' });
  assert.equal(writes, 0); assert.equal(aiCalls, 1);
  await service.send({ user, id: 'chat', question: 'Despachar a producción' });
  assert.equal(writes, 1);
  assert.equal(stored.turns.at(-1).dispatchDraft.status, 'DONE');
  assert.match(stored.turns.at(-1).answer, /\/gestion\?taskId=t1/);
  await service.send({ user, id: 'chat', question: 'Despachar a producción' });
  assert.equal(writes, 1, 'a repeated confirmation does not dispatch again');
  stored = { ...stored, turns: [...stored.turns, { role: 'assistant', text: '¿Los despacho?', dispatchDraft: ready }] };
  await service.send({ user, id: 'chat', question: 'Cancelar despacho' });
  assert.equal(stored.turns.at(-1).dispatchDraft.status, 'CANCELLED');
  assert.equal(writes, 1);
});

test('dispatching needs Bria, Gestión and Parrillas', () => {
  assert.equal(canDispatch(pm), true);
  assert.equal(canDispatch({ ...pm, modulePermissions: { bria: true, gestion: true } }), false);
  assert.equal(canDispatch({ ...pm, modulePermissions: { gestion: true, parrillas: true } }), false);
});
