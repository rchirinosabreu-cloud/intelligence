import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readTaskPanel = () => readFile('src/components/modules/TaskSidePanel.jsx', 'utf8');

test('task panel uses a viewport-stable full-screen surface on mobile', async () => {
  const source = await readTaskPanel();

  assert.match(source, /data-task-panel-content/);
  assert.match(source, /h-\[100dvh\]/);
  assert.match(source, /max-h-none/);
  assert.match(source, /sm:h-\[85vh\]/);
  assert.match(source, /sm:top-\[50%\]/);
});

test('task title wraps and operational fields use responsive touch targets', async () => {
  const source = await readTaskPanel();

  assert.match(source, /data-task-title-input/);
  assert.match(source, /<textarea[\s\S]*?data-task-title-input/);
  assert.match(source, /grid-cols-2[\s\S]*?sm:grid-cols-6/);
  assert.match(source, /h-12 sm:h-\[38px\]/);
  assert.match(source, /col-span-2 sm:col-span-2 space-y-1\.5/);
});

test('priority chooser exposes large mobile options without text input', async () => {
  const source = await readTaskPanel();

  assert.match(source, /data-task-priority-trigger/);
  assert.match(source, /data-task-priority-option/);
  assert.match(source, /min-h-11/);
  assert.match(source, /formData\.isPriority \? \(formData\.priority \|\| 'NORMAL'\) : 'NONE'/);
});

test('rich text comments avoid iPhone focus zoom', async () => {
  const source = await readFile('src/components/ui/RichTextEditor.jsx', 'utf8');

  assert.match(source, /w-full text-base sm:text-sm font-medium/);
});
