import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformAsync } from '@babel/core';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Drive renders PDFs internally instead of embedding a blocked browser frame', async () => {
  const [drive, viewer] = await Promise.all([
    read('src/components/modules/Drive/DriveLayout.jsx'),
    read('src/components/modules/Drive/PdfDocumentPreview.jsx')
  ]);

  assert.match(drive, /<PdfDocumentPreview/);
  assert.match(drive, /await blob\.arrayBuffer\(\)/);
  assert.doesNotMatch(drive, /<iframe/);
  assert.match(viewer, /pdfjs-dist/);
  assert.match(viewer, /getDocument/);
  assert.match(viewer, /<canvas/);
  assert.match(viewer, /aria-live=["']polite["']/);
  assert.match(viewer, /dark:/);
});

test('the responsive PDF viewer compiles as JSX', async () => {
  const viewer = await read('src/components/modules/Drive/PdfDocumentPreview.jsx');
  const result = await transformAsync(viewer, {
    filename: 'PdfDocumentPreview.jsx',
    presets: [['@babel/preset-react', { runtime: 'automatic' }]],
    sourceType: 'module'
  });

  assert.ok(result?.code);
});

test('the local PDF worker matches the installed PDF.js API version', async () => {
  const [lockSource, worker] = await Promise.all([
    read('package-lock.json'),
    read('public/pdf.worker.min.js')
  ]);
  const lock = JSON.parse(lockSource);
  const installedVersion = lock.packages['node_modules/pdfjs-dist'].version;

  assert.match(worker, new RegExp(`pdfjsVersion = ${installedVersion.replaceAll('.', '\\.')}`));
});
