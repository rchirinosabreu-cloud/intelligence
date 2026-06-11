import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

for (const file of [
  'src/components/modules/Moodboard/MoodboardCanvas.jsx',
  'src/components/modules/Moodboard/ReferenceCard.jsx',
  'src/components/modules/Moodboard/MoodboardDashboard.jsx',
  'src/components/modules/ClientDetail.jsx',
  'src/components/layout/Sidebar.jsx',
  'src/App.jsx'
]) {
  test(`${file} compiles as JSX`, async () => {
    const source = await readFile(file, 'utf8');
    await transformWithEsbuild(source, file, { loader: 'jsx', jsx: 'automatic' });
  });
}
