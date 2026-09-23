import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Rodny, 23 de septiembre de 2026: una tarea ya cerrada no se puede abrir en el tablero, así que sus horas
// quedaban fuera de alcance. En «Ver historial completo» cada logro despliega su tiempo y sus datos.

test('each completed task in the history opens its own details', async () => {
  const modal = await read('src/components/modules/CompletedTasksHistoryModal.jsx');

  assert.match(modal, /data-completed-task-toggle/, 'la tarjeta entera abre el detalle');
  assert.match(modal, /aria-expanded=\{isExpanded\}/);
  assert.match(modal, /aria-controls=\{`completed-task-details-\$\{task\.id\}`\}/);
  assert.match(modal, /setExpandedTaskId\(current => \(current === task\.id \? null : task\.id\)\)/, 'una abierta a la vez');
  assert.match(modal, /isExpanded && "sm:col-span-2/, 'abierta ocupa la fila entera');
});

test('the details show the recorded time and the task data', async () => {
  const modal = await read('src/components/modules/CompletedTasksHistoryModal.jsx');

  // El desglose por sesiones es el mismo componente del panel de la tarea, no una copia.
  assert.match(modal, /import TaskWorkHistory from '\.\/TaskWorkHistory';/);
  assert.match(modal, /<TaskWorkHistory\s+taskId=\{task\.id\}/);
  assert.match(modal, /const canSeeWorkSessions = \['ADMIN', 'PROJECT_MANAGER'\]\.includes\(currentUser\?\.role\)/, 'el servidor solo entrega las sesiones a dirección');
  assert.match(modal, /canSeeWorkSessions \? \(/, 'el resto ve el total registrado, sin sesiones');
  assert.match(modal, /formatElapsedTime\(task\.accumulatedWorkMs\)/);

  for (const label of ['Responsable', 'Cliente', 'Creada por', 'Creada', 'Vencía', 'Cerrada', 'Categoría', 'Complejidad', 'Prioridad', 'Descripción']) {
    assert.match(modal, new RegExp(`"${label}"|>${label}<`), `el detalle muestra ${label}`);
  }
  assert.match(modal, /plainTextSnippet\(task\.comments\)/, 'la descripción se lee sin etiquetas HTML');
});

test('the rule is written down', async () => {
  const agents = await read('AGENTS.md');
  assert.match(agents, /Ver historial completo[\s\S]{0,400}TaskWorkHistory/, 'queda anotado que el detalle reutiliza el historial de tiempo');
});
