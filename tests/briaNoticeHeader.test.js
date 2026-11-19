import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Rodny, 18 de noviembre de 2026: «ella vive ahí en la plataforma … no tiene que verse cortada por los bordes … debe
// verse delante, que se vea el cuerpo, que se vea el movimiento».
test('the shared notice header shows Bria whole, animated and in front, never clipped', async () => {
  const header = await read('src/components/bria/BriaNoticeHeader.jsx');
  assert.doesNotMatch(header, /overflow-hidden/, 'nothing clips her');
  assert.match(header, /<Bria3D mood=\{mood\}/, 'the animated character, not the face crop');
  assert.match(header, /absolute -bottom-3 [^"]*z-10/, 'feet over the bottom edge, in front of the body');
  assert.match(header, /min-h-\[136px\]/, 'tall enough for her whole body');
  assert.match(header, /text-balance/, 'the title wraps by width, without forced breaks');
});

test('every Bria notice uses the shared header and none crops her with the old placement', async () => {
  for (const [path, mood] of [
    ['src/components/tasks/ExcessiveTaskAlertDialog.jsx', 'sorprendida'],
    ['src/components/tasks/ReturnedTaskAlertDialog.jsx', 'triste'],
    ['src/components/tasks/FocusCommitmentNotice.jsx', 'pensando'],
    ['src/components/modules/NativeTasks.jsx', 'feliz'],
    ['src/components/modules/ContentPlan/BriaContentPlanReview.jsx', 'pensando'],
  ]) {
    const source = await read(path);
    assert.match(source, new RegExp(`<BriaNoticeHeader[\\s\\S]*?mood="${mood}"`), path);
    assert.doesNotMatch(source, /absolute -bottom-4 right-2 h-24 w-24/, `${path} no longer hides her legs`);
  }
});
