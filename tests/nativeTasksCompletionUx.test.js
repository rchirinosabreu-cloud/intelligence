import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readNativeTasks = () => readFile(
  new URL('../src/components/modules/NativeTasks.jsx', import.meta.url),
  'utf8'
);

test('the optimistic completed task remains visible while the server confirms it', async () => {
  const source = await readNativeTasks();

  assert.match(source, /movedTask\.completedAt\s*=\s*new Date\(\)\.toISOString\(\)/);
  assert.match(source, /if \(newStatusEnum !== 'REALIZADA'\) movedTask\.completedAt = null/);
});

test('completion confetti runs only after a successful backend response', async () => {
  const source = await readNativeTasks();
  const responseGuard = source.indexOf('if (!response.ok) throw new Error("Failed to update status in backend")');
  const confetti = source.indexOf('triggerConfetti()', responseGuard);
  const catchBlock = source.indexOf('} catch (err)', responseGuard);

  assert.ok(responseGuard >= 0, 'the task update must validate the backend response');
  assert.ok(confetti > responseGuard, 'confetti must run after the backend confirms completion');
  assert.ok(confetti < catchBlock, 'confetti must remain inside the successful request path');
});

test('completion celebration respects reduced-motion accessibility preferences', async () => {
  const source = await readFile(
    new URL('../src/utils/confetti.js', import.meta.url),
    'utf8'
  );

  assert.match(source, /disableForReducedMotion:\s*true/);
});
