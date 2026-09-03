import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the shared dialog contract supports keyboard, outside click and responsive viewports', async () => {
  const dialog = await read('src/components/ui/dialog.jsx');

  assert.match(dialog, /showCloseButton\s*=\s*true/);
  assert.match(dialog, /closeLabel\s*=\s*["']Cerrar["']/);
  assert.match(dialog, /w-\[calc\(100vw-2rem\)\]/);
  assert.match(dialog, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(dialog, /min-h-11\s+min-w-11/);
  assert.match(dialog, /<DialogPrimitive\.Root/);
  assert.match(dialog, /onOpenChange/);
});

test('Drive uses the shared dialog primitive for every file and folder modal', async () => {
  const drive = await read('src/components/modules/Drive/DriveLayout.jsx');

  assert.match(drive, /<Dialog open=\{!!file\}/);
  assert.match(drive, /onOpenChange=\{open => \{ if \(!open\) onClose\(\); \}\}/);
  assert.match(drive, /sm:h-\[92dvh\]/);
  assert.match(drive, /<Dialog open=\{newFolderOpen\}/);
  assert.match(drive, /<Dialog open=\{!!editTarget\}/);
  assert.doesNotMatch(drive, /(?:title|alt)=\{file\.name\}/);
  assert.match(drive, /setPreviewFile\(null\);\s*setPreview\(null\)/);
  assert.doesNotMatch(drive, /role="dialog" aria-modal="true"/);
});

test('legacy custom modals are migrated to the shared dismissal and focus contract', async () => {
  const files = [
    'src/components/modules/CompletedTasksHistoryModal.jsx',
    'src/components/modules/DeliverablesWidget.jsx',
    'src/components/modules/Moodboard/MoodboardDashboard.jsx',
    'src/components/modules/Profile.jsx',
    'src/components/modules/Activity/OperationalCalendar.jsx'
  ];

  for (const file of files) {
    const source = await read(file);
    assert.match(source, /from ['"]@\/components\/ui\/dialog['"]/);
  }

  const deliverables = await read(files[1]);
  assert.match(deliverables, /<Dialog open=\{!!previewFile\}/);

  const moodboard = await read(files[2]);
  assert.match(moodboard, /<Dialog open=\{isModalOpen\}/);

  const profile = await read(files[3]);
  assert.match(profile, /<Dialog open=\{isAvatarModalOpen\}/);

  const calendar = await read(files[4]);
  assert.match(calendar, /<Dialog open=\{!!reconciliationPreview\}/);
  assert.match(calendar, /<Dialog open=\{!!deleteCandidate\}/);
});

test('returned task management opens as a centered responsive dialog instead of a side drawer', async () => {
  const tasks = await read('src/components/modules/NativeTasks.jsx');

  assert.match(tasks, /<Dialog open=\{isReturnedDialogOpen\} onOpenChange=\{setIsReturnedDialogOpen\}>/);
  assert.match(tasks, /sm:max-w-2xl/);
  assert.match(tasks, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(tasks, /flex min-h-0 flex-1 flex-col/);
  assert.doesNotMatch(tasks, /md:grid-cols-2|xl:grid-cols-3/);
  assert.doesNotMatch(tasks, /isReturnedSidebarOpen/);
  assert.doesNotMatch(tasks, /translate-x-full/);
  assert.doesNotMatch(tasks, /fixed right-0 top-0/);
});

test('returned task cards keep a neutral surface with only a destructive border', async () => {
  const tasks = await read('src/components/modules/NativeTasks.jsx');

  assert.match(tasks, /isReturned && !isHighlighted && "border-destructive\/50"/);
  assert.doesNotMatch(tasks, /isReturned[^\n]*bg-destructive/);
  assert.doesNotMatch(tasks, /isReturned[^\n]*shadow-inner/);
});
