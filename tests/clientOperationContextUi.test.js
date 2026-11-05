import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

let dom, root, createRoot, Observations, Board;
const globals = new Map();
const button = (text) => [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === text);
const notes = Array.from({ length: 6 }, (_, index) => ({
  id: `note-${index}`, text: `Observación de muestra ${index}`, date: '2026-11-04',
  source: index === 0 ? 'EXCEL' : 'MANUAL', label: index === 0 ? 'Observaciones (MIO)' : null,
  authorId: index === 1 ? 'viewer' : 'another', by: 'Persona de muestra',
}));
async function mount(Component, props) {
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(Component, props)));
}
async function click(text) {
  assert.ok(button(text), `Debe existir el botón «${text}».`);
  await act(async () => button(text).click());
}
before(async () => {
  const outfile = path.resolve('output/client-operation-context-ui-test.mjs');
  await build({ stdin: { contents: "export { default as Observations } from './src/components/modules/Clients/operations/ClientObservations.jsx'; export { default as Board } from './src/components/modules/Clients/operations/ClientOperationsBoard.jsx';", resolveDir: process.cwd(), loader: 'jsx' }, outfile,
    bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', alias: { '@': path.resolve('src') }, define: { 'import.meta.env': '{}' } });
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3128' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLTextAreaElement']) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  }
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  globals.set('IS_REACT_ACT_ENVIRONMENT', Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  ({ Observations, Board } = await import(pathToFileURL(outfile)));
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(() => {
  dom?.window.close();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});

test('Observaciones muestra cuatro recientes y permite leer las anteriores sin perderlas', async () => {
  await mount(Observations, { observations: notes, currentUserId: 'viewer', onDelete() {} });
  assert.equal(document.querySelectorAll('li').length, 4);
  assert.equal(document.querySelectorAll('[aria-label="Borrar observación"]').length, 1, 'solo la propia conserva el borrado');
  assert.match(document.querySelector('li').textContent, /Del Excel · Observaciones \(MIO\) · Incorporada el 4 nov 2026/);
  await click('Ver 2 anteriores');
  assert.equal(document.querySelectorAll('li').length, 6);
  assert.match(document.querySelector('ul').textContent, /Observación de muestra 5/);
  await click('Ver menos observaciones');
  assert.equal(document.querySelectorAll('li').length, 4);
});

test('plegar el formulario y un fallo conservan lo escrito; solo el éxito lo limpia', async () => {
  let shouldFail = true;
  const saved = [];
  await mount(Observations, { observations: [], onAdd: async (value) => {
    saved.push(value);
    if (shouldFail) throw new Error('No se pudo guardar.');
  } });
  assert.equal(Boolean(document.querySelector('textarea')), false);
  await click('Añadir observación');
  const textarea = document.querySelector('textarea');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Acuerdo pendiente de confirmar.');
    textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await click('Ocultar formulario');
  await click('Continuar observación');
  assert.equal(document.querySelector('textarea').value, 'Acuerdo pendiente de confirmar.');
  const originalError = console.error;
  console.error = () => {};
  try { await click('Guardar observación'); } finally { console.error = originalError; }
  assert.equal(document.querySelector('textarea').value, 'Acuerdo pendiente de confirmar.');
  assert.match(document.querySelector('[role="alert"]').textContent, /No se pudo guardar/);
  shouldFail = false;
  await click('Guardar observación');
  assert.deepEqual(saved, ['Acuerdo pendiente de confirmar.', 'Acuerdo pendiente de confirmar.']);
  assert.equal(Boolean(document.querySelector('textarea')), false);
  await click('Añadir observación');
  assert.equal(document.querySelector('textarea').value, '');
});

const operation = {
  client: { id: 'sample', name: 'Cliente de muestra', cycles: {}, openTasks: [], latestObservation: { text: 'Una nota antigua sin acción.' } },
  evaluation: { level: 'red', reasons: [
    { code: 'CONTRACT_EXPIRED', level: 'yellow', category: 'contract', text: 'Contrato de muestra vencido.' },
    { code: 'PREVIOUS_SHORTFALL', level: 'red', category: 'operation', text: 'Pendientes del mes anterior.' },
    { code: 'CURRENT_OVERDUE', level: 'red', category: 'operation', text: 'Publicación actual atrasada.' },
  ] },
};

test('la cartera prioriza la operación y deja las observaciones para el detalle', async () => {
  await mount(Board, { evaluated: [operation], team: [], onOpenClient() {} });
  const row = document.querySelector('li');
  assert.match(row.textContent, /Publicación actual atrasada/);
  assert.doesNotMatch(row.textContent, /Una nota antigua|Contrato de muestra vencido|Pendientes del mes anterior/);
  assert.doesNotMatch(document.body.textContent, /mes sin cerrar/);
});

test('la cartera conserva visible un aviso de contrato cuando no hay alertas operativas', async () => {
  await mount(Board, { evaluated: [{ ...operation, evaluation: { level: 'yellow', reasons: [operation.evaluation.reasons[0]] } }], team: [], onOpenClient() {} });
  assert.match(document.querySelector('li').textContent, /Contrato de muestra vencido/);
});
