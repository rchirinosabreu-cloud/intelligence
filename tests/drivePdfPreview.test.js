import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
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

test('the viewer gives pdf.js a private copy of the bytes and shows the technical cause when it fails', async () => {
  const viewer = await read('src/components/modules/Drive/PdfDocumentPreview.jsx');
  // pdf.js transfers data.buffer to its worker and leaves the caller's ArrayBuffer detached; a copy keeps the caller's bytes usable.
  assert.match(viewer, /const bytes = new Uint8Array\(data\)\.slice\(\)/);
  assert.match(viewer, /getDocument\(\{ data: bytes \}\)/);
  assert.match(viewer, /0 bytes/);
  // In production a screenshot of the error card must be enough to diagnose: never hide the cause behind DEV.
  assert.doesNotMatch(viewer, /import\.meta\.env\.DEV/);
  assert.match(viewer, /Detalle técnico/);
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

// El worker y la librería tienen que ser de la misma versión: pdf.js se niega a trabajar si no lo son, y el visor se
// rompe en producción sin que nada lo avise al compilar. Hasta el 30 de octubre de 2026 eso se garantizaba con una copia
// del worker en `public/` y esta prueba comparando versiones; la copia se quedó en la 5.x y dejó parado el PR de
// seguridad de pdf.js durante dos semanas. Ahora el worker lo resuelve el empaquetador desde la versión instalada, así
// que la garantía es de construcción y lo que se vigila es que nadie vuelva a dejar una copia suelta.
test('el worker de PDF sale de la versión instalada, no de una copia suelta', async () => {
  const publicFiles = await readdir(new URL('../public', import.meta.url));
  assert.deepEqual(publicFiles.filter((name) => name.startsWith('pdf.worker')), [], 'una copia en public/ se queda vieja y rompe el visor');

  // El `?url` solo lo entiende el empaquetador: a nivel de módulo rompe los arneses que importan estas pantallas en
  // Node (el del chat usa esbuild con `packages: 'external'`). Por eso va dentro de una función, en los dos.
  for (const path of ['src/components/modules/Drive/PdfDocumentPreview.jsx', 'src/utils/documentProcessor.js']) {
    const source = await read(path);
    assert.match(source, /await import\('pdfjs-dist\/build\/pdf\.worker\.min\.mjs\?url'\)/, `${path} resuelve el worker desde el paquete`);
    assert.doesNotMatch(source, /^import .*pdf\.worker/m, `${path} no puede importar el worker a nivel de módulo`);
    assert.doesNotMatch(source, /workerSrc = ['"]\//, `${path} no puede apuntar a una ruta fija`);
  }
});
