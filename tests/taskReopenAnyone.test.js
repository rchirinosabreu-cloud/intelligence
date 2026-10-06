import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REOPEN_PAYLOAD_KEYS, isTaskReopenRequest } from '../src/lib/taskTiming.js';
import { canUpdateTask } from '../src/config/security.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Rodny, 6 de octubre de 2026: «necesito que cualquiera pueda reabrir tarea». El servidor solo
// dejaba reabrir a administradores, project managers, quien la creó y quien la ejecuta; a los
// demás les respondía 403 **después** de escribir el motivo y la nota en el diálogo, y el tablero
// lo contaba dos veces («No se pudo reabrir» y «No tienes permisos para realizar esta acción»).

const reapertura = { status: 'PENDIENTE', reopenReason: 'CLIENT_CORRECTION', reopenNote: 'Hay que corregir el carrusel' };

test('reabrir es el envío que devuelve una tarea cerrada a Pendiente con su motivo', () => {
  assert.equal(isTaskReopenRequest({ currentStatus: 'REALIZADA', payload: reapertura }), true);
  // El tablero usa las dos formas del estado cerrado.
  assert.equal(isTaskReopenRequest({ currentStatus: 'REALIZADO', payload: reapertura }), true);
  // Sin nota tampoco pasa del servicio, pero el motivo es lo que distingue una reapertura.
  assert.equal(isTaskReopenRequest({ currentStatus: 'REALIZADA', payload: { ...reapertura, reopenNote: undefined } }), true);

  // Una tarea que no está cerrada no se reabre: eso es moverla, y sigue siendo de quien puede.
  assert.equal(isTaskReopenRequest({ currentStatus: 'EN_CURSO', payload: reapertura }), false);
  assert.equal(isTaskReopenRequest({ currentStatus: 'PENDIENTE', payload: reapertura }), false);
  // Ni mandarla a otro sitio.
  assert.equal(isTaskReopenRequest({ currentStatus: 'REALIZADA', payload: { ...reapertura, status: 'EN_CURSO' } }), false);
  // Ni sin decir por qué.
  assert.equal(isTaskReopenRequest({ currentStatus: 'REALIZADA', payload: { status: 'PENDIENTE' } }), false);
  assert.equal(isTaskReopenRequest({ currentStatus: 'REALIZADA', payload: { ...reapertura, reopenReason: '   ' } }), false);

  // Y nada sin cuerpo tumba la regla.
  assert.equal(isTaskReopenRequest(), false);
  assert.equal(isTaskReopenRequest({ currentStatus: 'REALIZADA' }), false);
  assert.equal(isTaskReopenRequest({ currentStatus: null, payload: reapertura }), false);
});

test('la puerta es estrecha: por una reapertura no se cuela nada más', () => {
  // Lo importante de esta prueba: sin ella, cualquiera podría cambiarle el responsable, la
  // privacidad o el cliente a una tarea ajena escondiéndolo detrás de una reapertura.
  for (const colado of [
    { assigneeId: 'm-otro' },
    { isPrivate: true },
    { viewerIds: ['u-otro'] },
    { clientId: 'c-otro' },
    { priority: 'URGENTE' },
    { focusDeadlineAt: '2026-10-06T15:00:00.000Z' },
    { sortOrder: 0 }
  ]) {
    assert.equal(
      isTaskReopenRequest({ currentStatus: 'REALIZADA', payload: { ...reapertura, ...colado } }),
      false,
      `no se cuela ${Object.keys(colado)[0]} dentro de una reapertura`
    );
  }

  assert.deepEqual(REOPEN_PAYLOAD_KEYS, ['status', 'reopenReason', 'reopenNote']);
});

test('quien no es manager, ni creador, ni responsable, ya puede reabrir — y solo reabrir', () => {
  // La misma expresión que decide en el controlador, con el `canUpdateTask` de verdad. Melissa es
  // el caso real: ve el carrusel mal, no es dueña de la tarea, y hasta ahora se le negaba.
  const niega = (user, task, body) => (
    !isTaskReopenRequest({ currentStatus: task.status, payload: body })
    && !canUpdateTask(user, task)
  );

  const cerrada = { status: 'REALIZADA', creatorId: 'u-rodny', assignee: { userId: 'u-daniel' } };
  const melissa = { userId: 'u-melissa', role: 'EDITOR' };

  assert.equal(canUpdateTask(melissa, cerrada), false, 'sigue sin poder editarla');
  assert.equal(niega(melissa, cerrada, reapertura), false, 'pero ya puede reabrirla');

  // Y nada más: cambiarle el responsable o la prioridad se le sigue negando.
  assert.equal(niega(melissa, cerrada, { assigneeId: 'u-melissa' }), true);
  assert.equal(niega(melissa, cerrada, { ...reapertura, assigneeId: 'u-melissa' }), true);
  assert.equal(niega(melissa, { ...cerrada, status: 'EN_CURSO' }, { status: 'PENDIENTE' }), true);

  // A quien ya podía no le cambia nada.
  for (const user of [{ userId: 'u-admin', role: 'ADMIN' }, { userId: 'u-rodny', role: 'EDITOR' }, { userId: 'u-daniel', role: 'EDITOR' }]) {
    assert.equal(niega(user, cerrada, reapertura), false);
    assert.equal(niega(user, cerrada, { assigneeId: 'u-otro' }), false);
  }
});

test('el controlador deja pasar la reapertura antes de negar por permisos', async () => {
  const controller = await read('src/controllers/taskController.js');

  assert.match(controller, /import \{ isTaskReopenRequest \} from '\.\.\/lib\/taskTiming\.js';/);
  assert.match(
    controller,
    /const esReapertura = isTaskReopenRequest\(\{ currentStatus: task\.status, payload: req\.body \}\);\s*\n\s*if \(!esReapertura && !canUpdateTask\(req\.user, task\)\) \{/,
    'la excepción se evalúa en el mismo `if` que niega, no después'
  );

  // Lo que **no** cambia: editar sigue siendo de quien puede, y un pendiente privado que esta
  // persona no puede abrir lo frena el guardián antes de llegar aquí.
  assert.match(controller, /return res\.status\(403\)\.json\(\{ error: 'No tienes permisos para actualizar esta tarea' \}\)/);
  assert.match(controller, /canChangeTaskPrivacy\(task, req\.user\)/, 'la privacidad sigue siendo de quien creó la tarea');
  assert.match(controller, /collaboratorMoveProblem\(\{ currentStatus: task\.status, payload: req\.body \}\)/, 'la regla de los colaboradores se conserva');

  const rutas = await read('src/routes/index.js');
  assert.match(rutas, /requireTaskAccess/, 'el guardián de los pendientes privados sigue montado');
});

test('el tablero ofrece reabrir a cualquiera, sin mirar el rol', async () => {
  const tablero = await read('src/components/modules/NativeTasks.jsx');

  // La tarjeta ya enseñaba el botón a todo el mundo: el 403 llegaba del servidor, después de
  // que la persona escribiera el motivo. Si alguna vez se le pone un rol delante, esto avisa.
  assert.match(tablero, /lifecycleAction === 'reintegrate' \?/);
  assert.match(tablero, /const lifecycleAction = getTaskLifecycleAction\(task\.status\)/);
  assert.match(tablero, /sourceColumnId === 'realizado' && destinationColumnId !== 'realizado'\) \{\s*\n\s*setReopeningTask\(targetTask\);/);
});
