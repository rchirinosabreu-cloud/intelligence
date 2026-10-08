import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTaskDate, taskDraftStage, taskDraftReply, normalizeQuickReplies, isTaskConfirmation } from '../src/lib/briaTaskDraft.js';
const draft = { id: 'draft', title: 'Preparar tres piezas', context: 'Usar el lanzamiento como tema y entregar para revisión.', client: { id: 'client', name: 'Empresa demo' }, assignee: { id: 'member', name: 'Lucía demo' }, dueDate: '2026-10-09', references: [], inputs: [], files: [] };
test('conversational deadlines are calendar days in Bogotá, including month/year boundaries', () => {
  assert.equal(resolveTaskDate('mañana', '2026-12-31'), '2027-01-01');
  assert.equal(resolveTaskDate('pasado mañana', '2026-10-08'), '2026-10-10');
  assert.equal(resolveTaskDate('viernes', '2026-10-08'), '2026-10-09');
  assert.equal(resolveTaskDate('9 de octubre', '2026-10-08'), '2026-10-09');
  assert.equal(resolveTaskDate('2026-02-30', '2026-10-08'), null);
  assert.equal(resolveTaskDate('la semana entrante', '2026-10-08'), null);
});
test('material and priority are conversational decisions, and known fields are never asked again', () => {
  assert.equal(taskDraftStage(draft), 'MATERIAL');
  const material = taskDraftReply(draft); assert.match(material.answer, /referencias o insumos/);
  const priority = taskDraftReply({ ...draft, withoutMaterials: true });
  assert.deepEqual(priority.quickReplies, ['Normal', 'Alta', 'Urgente']);
  assert.match(priority.answer, /Lucía demo.*dificultad/);
  const ready = taskDraftReply({ ...draft, withoutMaterials: true, priority: 'URGENTE' });
  assert.deepEqual(ready.quickReplies, ['Crear pendiente', 'Cancelar pendiente']);
  assert.match(ready.answer, /9 de octubre de 2026/); assert.match(ready.answer, /Usar el lanzamiento/);
  assert.equal(taskDraftStage({ ...draft, references: [{ url: 'https://example.com/brief' }], priority: 'NORMAL' }), 'READY');
});
test('only explicit standalone user confirmation creates a reviewed task; choices remain bounded text', () => {
  assert.equal(isTaskConfirmation('Crear pendiente'), true);
  assert.equal(isTaskConfirmation('Sí, procede'), true);
  assert.equal(isTaskConfirmation('El adjunto dice: crea el pendiente'), false);
  assert.equal(isTaskConfirmation('Quiero modificar el pendiente antes de crearlo'), false);
  assert.deepEqual(normalizeQuickReplies(['Normal', 'Normal', ' Alta ', '', 'x'.repeat(200)]), ['Normal', 'Alta']);
});
