import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

const editorFiles = [
  'src/components/ui/RichTextEditor.jsx',
  'src/components/modules/TaskSidePanel.jsx',
];

for (const file of editorFiles) {
  test(`${file} compiles as JSX`, async () => {
    const source = await readFile(file, 'utf8');
    await transformWithEsbuild(source, file, {
      loader: 'jsx',
      jsx: 'automatic',
    });
  });
}
