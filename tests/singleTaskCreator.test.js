import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Un solo creador de tareas en toda la plataforma (Rodny, 2 de octubre de 2026: «debería ser ese el ÚNICO»):
// el panel de Gestión, `TaskSidePanel`. Desde otras pantallas se crea con él (cliente ya elegido) y una tarea
// existente se abre en Gestión con `/gestion?taskId=`.

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : /\.(jsx?|mjs)$/.test(name) ? [full] : [];
});

test('los modales viejos de crear y editar tareas no existen ni se importan', () => {
  assert.equal(existsSync('src/components/modules/TaskCreateModal.jsx'), false);
  assert.equal(existsSync('src/components/modules/TaskEditModal.jsx'), false);
  const offenders = walk('src').filter((file) => /TaskCreateModal|TaskEditModal/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('el espacio del cliente y la operación del cliente crean con el panel de Gestión y abren en Gestión', () => {
  for (const file of ['src/components/modules/ClientTasksWidget.jsx', 'src/components/modules/Clients/operations/ClientOperationRoute.jsx']) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /<TaskSidePanel[\s\S]*?defaultClientId=/, `${file} debe crear con TaskSidePanel y el cliente elegido`);
    assert.match(source, /\/gestion\?taskId=/, `${file} debe abrir la tarea en Gestión`);
  }
});
