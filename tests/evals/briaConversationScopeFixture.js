import assert from 'node:assert/strict';
import { createFullInquiryFixture } from './briaFullInquiryFixture.js';
import { createBriaDeleteService } from '../../src/services/briaDeleteService.js';

export const createConversationScopeFixture = (ai, { initialTurns = [], initialDeleted = [] } = {}) => {
  const members = [{ id: 'former', name: 'Alex Rivera', isActive: false }, { id: 'lifecycle-member', userId: 'lifecycle-user', name: 'Marina Duarte', isActive: true }];
  let tasks;
  const deleted = [...initialDeleted];
  const matches = where => tasks.filter(task => (!where.id || where.id.in.includes(task.id)) && (where.assigneeId === undefined || task.assigneeId === where.assigneeId) && (!where.status || where.status.in.includes(task.status)));
  const db = { teamMember: { findMany: async () => [members[0]] }, task: {
    count: async ({ where }) => matches(where).length,
    findMany: async ({ where, take }) => matches(where).slice(0, take),
    findUnique: async ({ where }) => tasks.find(task => task.id === where.id)
  } };
  const deleteDrafts = createBriaDeleteService({ db, deleteTask: async id => { deleted.push(id); tasks.splice(tasks.findIndex(task => task.id === id), 1); } });
  const fixture = createFullInquiryFixture(ai, { overview: true, initialTurns, members, assistantOptions: { deleteDrafts }, conversationOptions: { deleteDrafts } });
  tasks = fixture.tasks;
  return { ...fixture, deleted, addRetiredWork: () => {
    for (let i = 0; i < 57; i++) tasks.push({ id: `retired-${i}`, title: `Encargo histórico ${i + 1}`, assigneeId: 'former', assignee: { ...members[0], userId: 'former-user' }, clientId: fixture.client.id, client: fixture.client, status: 'PENDIENTE', dueDate: i % 2 ? '2026-11-01T17:00:00Z' : null, isPrivate: false, creatorId: 'lifecycle-user', collaborators: [], viewers: [], taskComments: [] });
  } };
};

export const runConversationScopeScenario = async (fixture, { savedTurns = [] } = {}) => {
  if (savedTurns.length === 4 && savedTurns.at(-1).answer.pendingAction?.status === 'DONE') {
    assert.equal(fixture.deleted.length, 57);
    const closed = await fixture.send('Gracias, con eso cerramos.');
    assert.equal(closed.pendingAction, undefined);
    assert.deepEqual(closed.toolsUsed, []);
    assert.equal(fixture.deleted.length, 57);
    return;
  }
  const overview = savedTurns[0]?.answer || await fixture.send('¿Cómo viene la próxima semana para la agencia? Dime qué atenderías primero y qué decisión necesitamos tomar; por ahora solo conversemos.');
  assert.deepEqual(overview.failures, []);
  assert.equal(overview.pendingAction, undefined);
  assert.equal(overview.investigation, undefined);
  assert.ok(overview.toolsUsed.includes('cartera_de_operacion'));
  assert.ok(overview.text.length > 50);
  assert.doesNotMatch(overview.text, /mi primera lectura|como te (?:dije|comenté)|comprobaciones adicionales/iu);
  assert.equal(fixture.deleted.length, 0);
  fixture.addRetiredWork();
  const first = savedTurns[1]?.answer || await fixture.send('Deja preparada la eliminación de todos los trabajos abiertos de Alex Rivera. Ya salió del equipo y esos encargos dejaron de formar parte de la operación, incluidos los que tienen fecha futura o ninguna fecha. Todavía no los borres.');
  assert.equal(first.pendingAction?.type, 'TASK_DELETE');
  assert.equal(first.pendingAction.draft.items.filter(item => !item.skip).length, 57);
  assert.ok(first.approvalReview);
  assert.equal(fixture.deleted.length, 0);
  const id = first.pendingAction.id;
  const clarification = savedTurns[2]?.answer || await fixture.send('Antes de aprobar, aclárame si estamos incluyendo también los que no tienen fecha.');
  assert.equal(fixture.deleted.length, 0);
  // Si la aclaración volvió a mostrar el resumen vigente, ya está disponible
  // para aprobar. Si solo respondió en prosa, se pide la revisión actual.
  const resumed = clarification.approvalReview ? clarification : await fixture.send('Sí, mantén ese alcance completo y el mismo motivo. Déjalo listo de nuevo para revisar.');
  assert.equal(resumed.pendingAction?.id, id);
  assert.equal(resumed.pendingAction.draft.items.filter(item => !item.skip).length, 57);
  assert.ok(resumed.approvalReview);
  assert.equal(fixture.deleted.length, 0);
  await fixture.send('Sí, hazlo');
  assert.equal(fixture.deleted.length, 57);
  const closed = await fixture.send('Gracias, con eso cerramos.');
  assert.equal(closed.pendingAction, undefined);
  assert.deepEqual(closed.toolsUsed, []);
  assert.equal(fixture.deleted.length, 57);
  assert.equal(fixture.created.length, 0);
  assert.ok(fixture.modelRequests.find(request => request.tools?.length)?.tools.length >= 50);
};
