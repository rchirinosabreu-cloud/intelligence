import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

let dom, root, createRoot, MemoryRouter, Dialog, Page;
const globals = new Map();
const scope = () => ({
  version: 1,
  contentLimits: [{ format: 'Reel', quantity: 6, rule: 'MAXIMO' }],
  stories: { quantity: 8, period: 'MES', perOccasion: null },
  production: { included: true, quantity: 2, period: 'CONTRATO', hours: 4, rule: 'EXACTA', hoursRule: 'MAXIMO' },
  additionalServices: [{ id: 'blog-ficticio', category: 'BLOG', label: 'Artículos de muestra', quantity: 2, unit: 'artículos', frequency: 'MES', notes: null }],
  reviewPending: 'Confirmar la distribución de los contenidos.',
});
const client = (details = scope()) => ({
  id: 'client-fixture', slug: 'client-fixture', name: 'Cliente ficticio del alcance', agency: 'BRAIN',
  projectManager: { id: 'pm-retained', name: 'Responsable anterior de muestra', isActive: false },
  communityManager: { id: 'cm-retained', name: 'Gestora anterior de muestra', isActive: false },
  contract: { serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-11-01', endDate: null, cutDay: 1,
    deliverables: [{ format: 'Reel', quantity: 4 }], storiesPerWeek: 3, productionDays: 1, monthlyReport: true, notes: '', scopeDetails: details },
  cycles: {}, history: [], openTasks: [], observations: [], work: { openTasks: 0, plans: [] },
});
const byAria = label => document.querySelector(`[aria-label="${label}"]`);
const byLabel = text => {
  const label = [...document.querySelectorAll('label')].find(item => item.textContent === text);
  return label ? document.getElementById(label.htmlFor) : null;
};
const button = text => [...document.querySelectorAll('button')].find(item => item.textContent.trim() === text);
async function change(element, value) {
  assert.ok(element, 'El campo que se necesita editar debe estar visible.');
  const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, String(value));
    element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function submit() { await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))); }
async function mount(Component, props) {
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(MemoryRouter, null, React.createElement(Component, props))));
}

before(async () => {
  await mkdir('output', { recursive: true });
  const outfile = path.resolve('output/client-contract-scope-ui-test.mjs');
  await build({ stdin: { contents: "export { default as Dialog } from './src/components/modules/Clients/operations/ClientOperationDialog.jsx'; export { default as Page } from './src/components/modules/Clients/operations/ClientOperationPage.jsx';", resolveDir: process.cwd(), loader: 'jsx' }, outfile,
    bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
    alias: { '@': path.resolve('src') }, loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' } });
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3127', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'Element', 'Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'navigator', 'CustomEvent', 'Event']) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  }
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  dom.window.scrollTo = () => {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  ({ MemoryRouter } = await import('react-router-dom'));
  ({ Dialog, Page } = await import(pathToFileURL(outfile)));
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(() => {
  dom?.window.close();
  for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

test('editar historias mensuales y un máximo no cambia el cupo ni convierte las unidades antiguas', async () => {
  let saved;
  await mount(Dialog, { client: client(), team: [], onClose() {}, onSave: async input => { saved = input; } });
  await change(byAria('Cantidad de historias'), '9');
  await change(byAria('Cantidad del límite 1'), '7');
  await submit();
  assert.ok(saved);
  assert.equal(saved.contract.scopeDetails.stories.quantity, 9);
  assert.equal(saved.contract.scopeDetails.stories.period, 'MES');
  assert.deepEqual(saved.contract.scopeDetails.contentLimits, [{ format: 'Reel', quantity: 7, rule: 'MAXIMO' }]);
  assert.deepEqual(saved.contract.deliverables, [{ format: 'Reel', quantity: 4 }]);
  assert.equal(saved.contract.storiesPerWeek, 3);
  assert.equal(saved.contract.productionDays, 1);
  assert.equal(saved.contract.scopeDetails.production.hoursRule, 'MAXIMO');
  assert.equal(saved.contract.scopeDetails.additionalServices[0].frequency, 'MES');
});

test('el responsable actual sigue visible y se conserva aunque ya no esté en la lista del equipo', async () => {
  let saved;
  await mount(Dialog, { client: client(null), team: [{ id: 'another-person', name: 'Otra persona de muestra' }], onClose() {}, onSave: async input => { saved = input; } });
  const pm = byLabel('Project manager');
  const cm = byLabel('Community manager');
  assert.equal(pm.value, 'pm-retained');
  assert.equal(cm.value, 'cm-retained');
  assert.equal(pm.selectedOptions[0].textContent, 'Responsable anterior de muestra');
  await submit();
  assert.equal(saved.projectManagerId, 'pm-retained');
  assert.equal(saved.communityManagerId, 'cm-retained');
  assert.equal(Object.hasOwn(saved.contract, 'scopeDetails'), false, 'guardar un legado sin detallar no crea metadatos ni borra otros');
});

test('el editor distingue Video, Reel, Sin clasificar y Otro y conserva cantidades y responsables al guardar', async () => {
  let saved;
  const account = client(null);
  account.contract.deliverables = [{ format: 'Post', quantity: 4 }, { format: 'Video', quantity: 6 }, { format: 'Sin clasificar', quantity: 2 }];
  await mount(Dialog, { client: account, team: [], onClose() {}, onSave: async input => { saved = input; } });
  const formats = [...document.querySelectorAll('select')].filter(select => [...select.options].some(option => option.value === 'Carrusel'));
  assert.equal(formats.length, 3);
  assert.deepEqual(formats.map(select => select.value), ['Post', 'Video', 'Sin clasificar']);
  for (const format of ['Video', 'Reel', 'Sin clasificar', 'Otro']) assert.ok([...formats[0].options].some(option => option.value === format), `falta opción ${format}`);
  await submit();
  assert.ok(saved);
  assert.deepEqual(saved.contract.deliverables, account.contract.deliverables);
  assert.equal(saved.projectManagerId, 'pm-retained');
  assert.equal(saved.communityManagerId, 'cm-retained');
});

test('un fallo de guardado conserva cantidades nuevas, campos desconocidos y el formulario abierto', async () => {
  let closed = 0, attempted;
  await mount(Dialog, { client: client(), team: [], onClose: () => { closed += 1; }, onSave: async input => { attempted = input; throw new Error('No fue posible guardar la revisión.'); } });
  await change(byAria('Cantidad de historias'), '');
  const originalError = console.error;
  console.error = () => {};
  try { await submit(); } finally { console.error = originalError; }
  assert.equal(attempted.contract.scopeDetails.stories.quantity, null);
  assert.equal(byAria('Cantidad de historias').value, '');
  assert.equal(closed, 0);
  assert.ok(document.querySelector('[role="dialog"]'));
  assert.match(document.querySelector('[role="alert"]').textContent, /No fue posible guardar la revisión/);
  assert.equal(button('Guardar ficha').disabled, false);
});

test('la ficha muestra unidad mensual, límites y horas por jornada sin sumar capacidades al cupo', async () => {
  await mount(Page, { client: client(), evaluation: { level: 'green', reasons: [] }, today: '2026-11-04', canManage: true });
  const profile = document.querySelector('[aria-label="Ficha operativa"]');
  assert.match(profile.textContent, /8 historias por mes/);
  assert.match(profile.textContent, /Hasta 6 Reel/);
  assert.match(profile.textContent, /2 jornadas por contrato/);
  assert.match(profile.textContent, /Hasta 4 horas por jornada/);
  assert.match(profile.textContent, /2 artículos por mes/);
  assert.match(profile.textContent, /4 en total/);
  assert.doesNotMatch(profile.textContent, /6 en total|8 historias por semana/);
  assert.ok(button('Editar'));
});

test('un dato detallado nulo se presenta por confirmar, sin rescatar el cero o frecuencia del legado', async () => {
  const details = scope();
  details.stories = { quantity: null, period: null, perOccasion: null };
  details.production = { included: null, quantity: null, period: null, hours: null, rule: 'EXACTA', hoursRule: 'EXACTA' };
  await mount(Page, { client: client(details), evaluation: { level: 'green', reasons: [] }, today: '2026-11-04', canManage: false });
  const profile = document.querySelector('[aria-label="Ficha operativa"]');
  const stories = profile.querySelector('[data-contract-stories]');
  const production = profile.querySelector('[data-contract-production]');
  assert.ok(stories, 'la ficha debe representar el bloque de historias detalladas');
  assert.ok(production, 'la ficha debe representar el bloque de producción detallada');
  assert.match(stories.textContent, /Por confirmar/);
  assert.match(production.textContent, /Por confirmar/);
  assert.doesNotMatch(stories.textContent, /3 por semana|0 historias/);
  assert.equal(button('Editar'), undefined);
});

test('editar un cupo compartido conserva los formatos juntos y no reparte ni suma piezas', async () => {
  const details = scope();
  details.contentGroups = [{ formats: ['Reel', 'Video'], quantity: 6, rule: 'MAXIMO' }];
  let saved;
  await mount(Dialog, { client: client(details), team: [], onClose() {}, onSave: async input => { saved = input; } });
  await change(byAria('Cantidad del grupo 1'), '7');
  await act(async () => byAria('Carrusel en grupo 1').click());
  await submit();
  assert.ok(saved);
  assert.deepEqual(saved.contract.scopeDetails.contentGroups, [{ formats: ['Reel', 'Video', 'Carrusel'], quantity: 7, rule: 'MAXIMO' }]);
  assert.deepEqual(saved.contract.deliverables, [{ format: 'Reel', quantity: 4 }]);
  assert.equal(saved.projectManagerId, 'pm-retained');
  assert.equal(saved.communityManagerId, 'cm-retained');
});

test('la ficha presenta un cupo compartido conocido sin llamarlo sin clasificar', async () => {
  const details = scope();
  details.contentLimits = [];
  details.contentGroups = [{ formats: ['Post', 'Carrusel', 'Reel'], quantity: 6, rule: 'EXACTA' }];
  const account = client(details);
  account.contract.deliverables = [{ format: 'Sin clasificar', quantity: 6 }];
  await mount(Page, { client: account, evaluation: { level: 'green', reasons: [] }, today: '2026-11-04', canManage: false });
  const profile = document.querySelector('[aria-label="Ficha operativa"]');
  assert.match(profile.textContent, /6 contenidos entre Post, Carrusel y Reel/);
  assert.match(profile.textContent, /6 en total/);
  assert.doesNotMatch(profile.textContent, /6 Sin clasificar/);
});

test('un límite audiovisual conjunto no oculta las piezas cuyo formato falta confirmar', async () => {
  const details = scope();
  details.contentGroups = [{ formats: ['Reel', 'Video'], quantity: 6, rule: 'MAXIMO' }];
  const account = client(details);
  account.contract.deliverables = [{ format: 'Post', quantity: 4 }, { format: 'Video', quantity: 6 }, { format: 'Sin clasificar', quantity: 2 }];
  await mount(Page, { client: account, evaluation: { level: 'green', reasons: [] }, today: '2026-11-04', canManage: false });
  const profile = document.querySelector('[aria-label="Ficha operativa"]');
  assert.match(profile.textContent, /Hasta 6 contenidos entre Reel y Video/);
  assert.match(profile.textContent, /2 Sin clasificar/);
  assert.match(profile.textContent, /12 en total/);
});
