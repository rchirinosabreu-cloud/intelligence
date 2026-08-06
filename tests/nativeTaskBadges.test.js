import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('NativeTasks can render overdue and priority badges together', () => {
  const source = readFileSync('src/components/modules/NativeTasks.jsx', 'utf8');

  assert.match(source, /overdue\s*&&\s*\{[\s\S]*key:\s*'overdue'/, 'The overdue badge should still be collected when a task is overdue.');
  assert.doesNotMatch(
    source,
    /!overdue\s*&&\s*!isReturned\s*&&\s*task\.priority/,
    'The priority badge must not be hidden when the task is overdue.'
  );
});

test('NativeTasks card badges render in footer with compact equal-width pills', () => {
  const source = readFileSync('src/components/modules/NativeTasks.jsx', 'utf8');

  assert.match(source, /const taskPriorityBadgeConfig/, 'Priority badge config should centralize color and label handling.');
  assert.match(source, /min-w-\[74px\]/, 'Priority badges should keep the same visual width across labels.');
  assert.match(source, /text-white/, 'Priority badge text should be white for every priority variant.');
  assert.doesNotMatch(source, /AlertOctagon className="w-3 h-3" \/> Vencido/, 'Overdue badge should not include the alert icon in the crowded card footer.');
  assert.match(source, /taskCardFooterBadges/, 'Status badges should be collected for the footer instead of stacked in the top-right area.');
  assert.match(source, /task\.isSpecial[\s\S]*border-purple-500/, 'Special tasks should be distinguished with a purple card border instead of a noisy badge.');
  assert.doesNotMatch(source, /task\.isSpecial\s*&&[\s\S]*taskCardFooterBadges/, 'Special status should not participate in the compact task card badge footer.');
  assert.doesNotMatch(source, /label:\s*task\.specialType\s*\|\|\s*'Especial'/, 'Task cards should not render the special label anymore.');
});

test('NativeTasks cards keep plan and reference shortcuts inside the task detail only', () => {
  const source = readFileSync('src/components/modules/NativeTasks.jsx', 'utf8');
  const taskCardSource = source.slice(source.indexOf('const TaskCard ='), source.indexOf('export default NativeTasks'));

  assert.doesNotMatch(taskCardSource, /navigate\(`\/parrillas/, 'Task cards should not expose a direct plan shortcut.');
  assert.doesNotMatch(taskCardSource, /href=\{task\.referenceUrl\}/, 'Task cards should not expose a direct reference shortcut.');
  assert.doesNotMatch(taskCardSource, /<LayoutGrid className="w-3\.5 h-3\.5" \/>/, 'Task cards should not render the plan grid icon.');
  assert.doesNotMatch(taskCardSource, /<LinkIcon className="w-3\.5 h-3\.5" \/>/, 'Task cards should not render the reference link icon.');
});

test('NativeTasks cards show compact due dates with full-date tooltip', () => {
  const source = readFileSync('src/components/modules/NativeTasks.jsx', 'utf8');
  const taskCardSource = source.slice(source.indexOf('const TaskCard ='), source.indexOf('export default NativeTasks'));

  assert.match(source, /const formatTaskCardDate/, 'Task cards should use a dedicated compact date formatter.');
  assert.match(source, /monthLabels/, 'Compact dates should use readable month labels instead of a full numeric year.');
  assert.match(taskCardSource, /title=\{task\.dueDateFormatted \|\| "Sin fecha"\}/, 'The full date should remain available as a tooltip.');
  assert.match(taskCardSource, /formatTaskCardDate\(task\.dueDateFormatted\)/, 'The visible card date should be compact.');
  assert.doesNotMatch(taskCardSource, /<Calendar[\s\S]*\n\s*\{task\.dueDateFormatted \|\| "Sin fecha"\}/, 'Cards should not render the full YYYY date directly next to the calendar icon.');
});
