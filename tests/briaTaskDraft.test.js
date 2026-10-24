import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTaskDate, taskDraftStage, taskDraftReply, taskDraftItems, normalizeQuickReplies, isTaskConfirmation } from '../src/lib/briaTaskDraft.js';
const draft = { id: 'draft', title: 'Preparar tres piezas', context: 'Usar el lanzamiento como tema y entregar para revisión.', client: { id: 'client', name: 'Empresa demo' }, assignee: { id: 'member', name: 'Lucía demo' }, dueDate: '2026-10-09', references: [], inputs: [], files: [] };
test('conversational deadlines are calendar days in Bogotá, including month/year boundaries', () => {
  assert.equal(resolveTaskDate('mañana', '2026-12-31'), '2027-01-01');
  assert.equal(resolveTaskDate('pasado mañana', '2026-10-08'), '2026-10-10');
  assert.equal(resolveTaskDate('viernes', '2026-10-08'), '2026-10-09');
  assert.equal(resolveTaskDate('9 de octubre', '2026-10-08'), '2026-10-09');
  assert.equal(resolveTaskDate('2026-02-30', '2026-10-08'), null);
  assert.equal(resolveTaskDate('la semana entrante', '2026-10-08'), null);
});
test('a task with client, assignee, date and context is ready: material and priority are no longer stops (Rodny, 20 de octubre de 2026)', () => {
  // 96 mensajes para 14 pendientes: cada uno se detenía en «¿insumos?» y «¿prioridad?». Prioridad Normal salvo que la
  // persona diga otra; los insumos se mencionan como nota en el resumen, nunca como pregunta.
  assert.equal(taskDraftStage(draft), 'READY');
  const ready = taskDraftReply(draft);
  assert.deepEqual(ready.quickReplies, ['Crear pendiente', 'Cancelar pendiente']);
  assert.match(ready.answer, /Prioridad: Normal/);
  assert.match(ready.answer, /Sin referencias ni insumos todavía/);
  assert.doesNotMatch(ready.answer, /¿Añadirás|¿Qué prioridad/);
  assert.match(ready.answer, /9 de octubre de 2026/); assert.match(ready.answer, /Usar el lanzamiento/);
  const urgent = taskDraftReply({ ...draft, priority: 'URGENTE', references: [{ url: 'https://example.com/brief' }] });
  assert.match(urgent.answer, /Prioridad: Urgente/); assert.match(urgent.answer, /Referencia: https:\/\/example.com\/brief/); assert.doesNotMatch(urgent.answer, /Sin referencias/);
  assert.equal(taskDraftStage({ ...draft, assignee: null }), 'ASSIGNEE');
  assert.equal(taskDraftStage({ ...draft, dueDate: null }), 'DATE');
});
test('several tasks in one message are one draft, one summary and one confirmation', () => {
  const batch = { ...draft, title: null, context: null, items: [
    { id: 't1', title: 'Historias de la semana', context: 'Tres historias con las fotos del evento.' },
    { id: 't2', title: 'Carrusel de datos', context: 'Cinco láminas con las cifras del informe.', assignee: { id: 'm2', name: 'Melissa demo' }, dueDate: '2026-10-12', priority: 'ALTA' },
    { id: 't3', title: null, context: null }
  ] };
  const items = taskDraftItems(batch);
  assert.equal(items.length, 3);
  assert.deepEqual([items[0].assignee.name, items[0].dueDate, items[0].priority], ['Lucía demo', '2026-10-09', 'NORMAL'], 'lo compartido rellena lo que el ítem no trae');
  assert.deepEqual([items[1].assignee.name, items[1].dueDate, items[1].priority], ['Melissa demo', '2026-10-12', 'ALTA'], 'lo propio del ítem manda');
  assert.equal(taskDraftStage(batch), 'CONTEXT', 'el tercero no tiene ni título');
  assert.match(taskDraftReply(batch).answer, /^Del pendiente 3: ¿qué hay que hacer\?/);
  // El título ya dice qué hay que hacer: un pendiente con título y sin contexto está listo (el modelo mandaba la lista
  // bien y Bria se frenaba pidiendo contexto a cada uno).
  const ready = { ...batch, items: batch.items.map((item, i) => (i === 2 ? { ...item, title: 'Post de cierre' } : item)) };
  assert.equal(taskDraftStage(ready), 'READY');
  const reply = taskDraftReply(ready);
  assert.match(reply.answer, /Así quedarían los 3 pendientes/);
  assert.match(reply.answer, /1\. \*\*Historias de la semana\*\*[^\n]*Lucía demo[^\n]*9 de octubre de 2026[^\n]*\n- Proyecto especial: No\n- Colaboradores: Ninguno\n   Tres historias/);
  assert.match(reply.answer, /2\. \*\*Carrusel de datos\*\*[^\n]*Melissa demo[^\n]*12 de octubre de 2026[^\n]*Alta/);
  assert.match(reply.answer, /3\. \*\*Post de cierre\*\*[^\n]*Normal\n- Proyecto especial: No\n- Colaboradores: Ninguno\n\n/, 'sin contexto no hay línea de contexto');
  assert.deepEqual(reply.quickReplies, ['Crear pendientes', 'Cancelar pendiente']);
  assert.equal(taskDraftItems(draft).length, 1, 'un borrador sin ítems sigue siendo un solo pendiente');
  const titleOnly = taskDraftReply({ ...draft, context: null });
  assert.equal(taskDraftStage({ ...draft, context: null }), 'READY');
  assert.doesNotMatch(titleOnly.answer, /Comentario que publicaré/);
});
test('only explicit standalone user confirmation creates a reviewed task; choices remain bounded text', () => {
  assert.equal(isTaskConfirmation('Crear pendiente'), true);
  assert.equal(isTaskConfirmation('Crear pendientes'), true);
  assert.equal(isTaskConfirmation('Sí, procede'), true);
  assert.equal(isTaskConfirmation('El adjunto dice: crea el pendiente'), false);
  assert.equal(isTaskConfirmation('Quiero modificar el pendiente antes de crearlo'), false);
  assert.deepEqual(normalizeQuickReplies(['Normal', 'Normal', ' Alta ', '', 'x'.repeat(200)]), ['Normal', 'Alta']);
});

test('an explicitly unresolved client in a batch never inherits the shared client', () => {
  const batch = { ...draft, items: [
    { id: 'first', title: 'Cuenta común' },
    { id: 'second', title: 'Cliente que no se encontró', client: null }
  ] };
  assert.equal(taskDraftItems(batch)[0].client.id, draft.client.id);
  assert.equal(taskDraftItems(batch)[1].client, null);
  assert.equal(taskDraftStage(batch), 'CLIENT');
});

test('an explicitly unresolved assignee in a batch never inherits another person', () => {
  const batch = { ...draft, items: [
    { id: 'first', title: 'Responsable común' },
    { id: 'second', title: 'Asignar a mi cuenta', assignee: null }
  ] };
  assert.equal(taskDraftItems(batch)[0].assignee.id, draft.assignee.id);
  assert.equal(taskDraftItems(batch)[1].assignee, null);
  assert.equal(taskDraftStage(batch), 'ASSIGNEE');
});
