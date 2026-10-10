import test from 'node:test';
import assert from 'node:assert/strict';
import { actionStage, actionReply, isActionConfirmation, isActionCancellation, pendingActionOf } from '../src/lib/briaActions.js';

// La base común de las acciones de Bria (9 de octubre de 2026). Rodny: «la idea es que Bria contribuya a
// desarrollar buenas prácticas más que simplemente poner cosas». Cada acción pregunta lo que la plataforma
// exige, de a una cosa, propone lo que puede deducir, y solo se ejecuta con una confirmación escrita.

const base = { id: 'a1', ownerId: 'u1', type: 'TASK_UPDATE', status: 'DRAFT', title: 'Cambiar la tarea «Reel de lanzamiento»', summary: ['Estado: En proceso'], missing: [], warnings: [] };

test('an action is ready only when nothing required is missing', () => {
  assert.equal(actionStage(null), null);
  assert.equal(actionStage({ ...base, missing: [{ field: 'motivo', question: '¿Por qué la devuelves?' }] }), 'MISSING');
  assert.equal(actionStage(base), 'READY');
  assert.equal(actionStage({ ...base, status: 'DONE' }), 'DONE');
  assert.equal(actionStage({ ...base, status: 'CANCELLED' }), 'CANCELLED');
});

test('Bria asks one thing at a time, with its options, and shows what she already has', () => {
  const reply = actionReply({ ...base, missing: [{ field: 'responsable', question: '¿Quién será el responsable de la parrilla?', options: ['Camila del Toro', 'Helen Hernández'] }, { field: 'objetivo', question: '¿Cuál es el objetivo estratégico?' }] });
  assert.match(reply.answer, /Estado: En proceso/);
  assert.match(reply.answer, /responsable de la parrilla/);
  assert.doesNotMatch(reply.answer, /objetivo estratégico/, 'one question at a time');
  assert.deepEqual(reply.quickReplies, ['Camila del Toro', 'Helen Hernández']);
});

test('a ready action shows its summary, its warnings and the two buttons', () => {
  const reply = actionReply({ ...base, warnings: ['La tarea tiene colaboradores: solo el responsable la cierra.'] });
  assert.match(reply.answer, /Cambiar la tarea/);
  assert.match(reply.answer, /solo el responsable la cierra/);
  assert.deepEqual(reply.quickReplies, ['Confirmar', 'Cancelar']);
  assert.match(actionReply({ ...base, status: 'DONE', result: 'Listo: la tarea quedó en proceso.' }).answer, /Listo/);
});

test('confirming and cancelling are short, whole sentences', () => {
  for (const q of ['Confirmar', 'confirmo', 'Sí, confirmar', 'dale, confirmar', 'Hazlo']) assert.equal(isActionConfirmation(q), true, q);
  for (const q of ['Confirmar que la reunión es el martes y luego…', 'El correo dice confirmar', '¿Confirmamos?']) assert.equal(isActionConfirmation(q), false, q);
  assert.equal(isActionCancellation('Cancelar'), true);
  assert.equal(isActionCancellation('No, cancela'), true);
});

test('only the action of the immediately previous answer can be confirmed', () => {
  const turns = [{ role: 'assistant', pendingAction: base }, { role: 'user', text: 'otra cosa' }, { role: 'assistant', text: 'Respuesta sin acción' }];
  assert.equal(pendingActionOf(turns), null, 'an older action never runs with a loose «confirmar»');
  assert.equal(pendingActionOf([...turns, { role: 'user', text: 'x' }, { role: 'assistant', pendingAction: base }]).id, 'a1');
  assert.equal(pendingActionOf([{ role: 'assistant', pendingAction: { ...base, status: 'DONE' } }]).status, 'DONE');
});
