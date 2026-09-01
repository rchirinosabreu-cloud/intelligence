import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('completed history search is global and its card action stays icon-only', async () => {
  const modal = await read('src/components/modules/CompletedTasksHistoryModal.jsx');
  const controller = await read('src/controllers/taskController.js');
  const service = await read('src/services/nativeTaskService.js');

  assert.match(modal, /params\.set\('search',\s*normalizedSearch\)/);
  assert.match(modal, /filterCompletedHistoryTasks\(tasks,\s*searchTerm,\s*selectedUser\)/);
  assert.match(controller, /getCompletedTasks\(req\.query\.date,\s*req\.query\.search\)/);
  assert.match(service, /buildCompletedTaskWhere\(dateString,\s*searchTerm\)/);

  assert.match(modal, /aria-label="Regresar al tablero"/);
  assert.match(modal, /<RotateCcw[^>]*\/>/);
  assert.doesNotMatch(modal, />\s*Regresar al tablero\s*</);
});

test('management global search is evaluated before every board filter', async () => {
  const board = await read('src/components/modules/NativeTasks.jsx');
  const filterBlock = board.slice(
    board.indexOf('const filteredTasks = useMemo'),
    board.indexOf('const columns =')
  );

  const searchIndex = filterBlock.indexOf("if (normalizedSearch !== '')");
  assert.notEqual(searchIndex, -1, 'Management must expose the global-search branch.');
  assert.ok(searchIndex < filterBlock.indexOf("columnId === 'realizado'"));
  assert.ok(searchIndex < filterBlock.indexOf("responsibleFilter !== 'Todos'"));
  assert.ok(searchIndex < filterBlock.indexOf("clientFilter !== 'Todos'"));
  assert.ok(searchIndex < filterBlock.indexOf("dateFilter === 'Todos'"));
  assert.match(filterBlock, /return matchesTaskSearch\(task,\s*normalizedSearch\)/);
});

