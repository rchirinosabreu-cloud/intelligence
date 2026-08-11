import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('task board keeps syncing while a task form is open without discarding creation drafts', async () => {
  const board = await read('src/components/modules/NativeTasks.jsx');
  const panel = await read('src/components/modules/TaskSidePanel.jsx');
  const query = board.slice(board.indexOf("queryKey: ['nativeTasks']"), board.indexOf("queryKey: ['clientsDropdown']"));

  assert.match(query, /document\.hidden\s*\?\s*false\s*:\s*30_000/);
  assert.doesNotMatch(query, /!isCreating\s*&&\s*!editingTask/);
  assert.match(query, /refetchOnWindowFocus:\s*true/);
  assert.match(panel, /sessionStorage\.setItem\('task_focus_draft'/);
  assert.match(panel, /sessionStorage\.getItem\('task_focus_draft'/);
});

test('task board exposes a manual refresh with visible synchronization state', async () => {
  const board = await read('src/components/modules/NativeTasks.jsx');

  assert.match(board, /dataUpdatedAt/);
  assert.match(board, /isFetching/);
  assert.match(board, /aria-label="Actualizar tareas"/);
  assert.match(board, /Última actualización/);
  assert.match(board, /onClick=\{\(\) => refetch\(\)\}/);
});
