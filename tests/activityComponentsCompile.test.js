import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

for (const file of [
  'src/components/modules/Activity/ActivityMap.jsx',
  'src/components/modules/Activity/OperationalCalendar.jsx',
  'src/components/modules/Activity/MemberActivityCard.jsx',
  'src/components/modules/Activity/EventActivityCard.jsx'
]) {
  test(`${file} compiles as JSX`, async () => {
    const source = await readFile(file, 'utf8');
    await transformWithEsbuild(source, file, { loader: 'jsx', jsx: 'automatic' });
  });
}
