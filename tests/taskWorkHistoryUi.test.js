import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('task panel exposes work totals, cycles and historical baseline', async () => {
  const component = await readFile(new URL('../src/components/modules/TaskWorkHistory.jsx', import.meta.url), 'utf8');
  const panel = await readFile(new URL('../src/components/modules/TaskSidePanel.jsx', import.meta.url), 'utf8');
  assert.match(component, /Tiempo de trabajo/);
  assert.match(component, /Tiempo histórico sin desglose/);
  assert.match(component, /isOverlapping/);
  assert.match(component, /work-history/);
  assert.match(component, /history\?\.task/);
  assert.match(panel, /TaskWorkHistory/);
  assert.match(panel, /taskId=\{formData\.id\}/);
  assert.match(panel, /\['ADMIN', 'PROJECT_MANAGER'\]/);
});
