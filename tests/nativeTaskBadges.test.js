import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('NativeTasks can render overdue and priority badges together', () => {
  const source = readFileSync('src/components/modules/NativeTasks.jsx', 'utf8');

  assert.match(source, /overdue\s*&&\s*\(/, 'The overdue badge should still render when a task is overdue.');
  assert.doesNotMatch(
    source,
    /!overdue\s*&&\s*!isReturned\s*&&\s*task\.priority/,
    'The priority badge must not be hidden when the task is overdue.'
  );
});
