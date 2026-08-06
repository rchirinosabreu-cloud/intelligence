import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('ContentPlan model supports monthly strategic objectives as a public-safe field', async () => {
  const schema = await read('prisma/schema.prisma');

  assert.match(schema, /model ContentPlan[\s\S]*strategicObjectives\s+String\?/);
});

test('content plan API exposes strategic objectives to the client portal', async () => {
  const publicController = await read('src/controllers/publicController.js');
  const service = await read('src/services/contentService.js');

  assert.match(publicController, /strategicObjectives:\s*plan\.strategicObjectives/);
  assert.match(service, /strategicObjectives/);
});

test('content plan editor separates strategic objectives from multiple internal notes', async () => {
  const editor = await read('src/components/modules/ContentPlanDetail.jsx');

  assert.match(editor, /Objetivos estrat\S*gicos/);
  assert.match(editor, /strategicObjectives/);
  assert.match(editor, /Notas internas/);
  assert.doesNotMatch(editor, /Notas Internas \/ Cerebro del Proyecto/);
  assert.match(editor, /parsePlanInternalNotes/);
  assert.match(editor, /handleAddPlanInternalNote/);
});

test('client feedback is read-only in the internal content editor', async () => {
  const editor = await read('src/components/modules/ContentPlanDetail.jsx');

  assert.doesNotMatch(editor, /onUpdate\(\{ id: item\.id, comments: val \}\)/);
  assert.doesNotMatch(editor, /isEditing=\{isEditing\}[\s\S]*isOpen=\{showFeedback\}/);
  assert.match(editor, /Feedback del Cliente|Feedback del cliente/);
});

test('shared content plan shows strategic objectives and uses a softer correction action', async () => {
  const shared = await read('src/components/public/SharedContentPlan.jsx');

  assert.match(shared, /Objetivos estrat\S*gicos/);
  assert.match(shared, /plan\.strategicObjectives/);
  assert.doesNotMatch(shared, /bg-zinc-900 dark:bg-white text-white dark:text-zinc-900/);
});

test('client correction action scrolls to and focuses the feedback form', async () => {
  const shared = await read('src/components/public/SharedContentPlan.jsx');

  assert.match(shared, /commentFormRefs/);
  assert.match(shared, /commentTextareaRefs/);
  assert.match(shared, /scrollIntoView\(\{\s*behavior:\s*'smooth',\s*block:\s*'center'/);
  assert.match(shared, /focus\(\{\s*preventScroll:\s*true\s*\}\)/);
});

test('DatePicker instances use the global Brainstudio calendar chrome', async () => {
  const files = [
    'src/components/modules/TaskSidePanel.jsx',
    'src/components/modules/TaskCreateModal.jsx',
    'src/components/modules/TaskEditModal.jsx',
    'src/components/modules/Activity/OperationalCalendar.jsx',
    'src/components/modules/ContentPlanDetail.jsx'
  ];

  const helper = await read('src/lib/brainDatePicker.js');
  assert.match(helper, /calendarClassName:\s*'brain-datepicker'/);
  assert.match(helper, /popperClassName:\s*'brain-datepicker-popper'/);

  for (const file of files) {
    const source = await read(file);
    assert.match(source, /brainDatePickerProps/, `${file} should opt into the shared calendar props`);
  }
});

test('new content editor stays spacious and pinned first until its date changes', async () => {
  const editor = await read('src/components/modules/ContentPlanDetail.jsx');

  assert.match(editor, /newlyCreatedItemId/);
  assert.match(editor, /orderedPlanItems/);
  assert.match(editor, /setNewlyCreatedItemId\(newItem\.id\)/);
  assert.match(editor, /publishDate[\s\S]*setNewlyCreatedItemId\(null\)/);
  assert.match(editor, /overflow-visible/);
  assert.match(editor, /min-h-\[520px\]/);
  assert.match(editor, /min-h-\[120px\]/);
});
