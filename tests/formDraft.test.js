import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { formDraftKey, readFormDraft, saveFormDraft, clearFormDraft, restoreFormFields } from '../src/lib/formDraft.js';
const storage = () => { const data = new Map(); return { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }; };
test('recupera datos numéricos escritos como texto y tasas recuperadas como números', () => {
  assert.deepEqual(restoreFormFields({ exchangeRate: '', discountValue: 10 }, { exchangeRate: 4000.25, discountValue: '15' }), { exchangeRate: 4000.25, discountValue: '15' });
});
test('separa persona y recurso; conserva sin aplicar la copia de una versión anterior', () => {
  const s = storage();
  assert.equal(saveFormDraft(s, 'ana', 'loan:new', { name: 'Muestra' }, { fingerprint: 'v1' }), true);
  assert.equal(readFormDraft(s, 'bea', 'loan:new', { fingerprint: 'v1' }), null);
  assert.equal(readFormDraft(s, 'ana', 'loan:other', { fingerprint: 'v1' }), null);
  assert.deepEqual(readFormDraft(s, 'ana', 'loan:new', { fingerprint: 'v1' }), { name: 'Muestra' });
  assert.equal(readFormDraft(s, 'ana', 'loan:new', { fingerprint: 'v2' }), null);
  assert.ok(s.getItem(formDraftKey('ana', 'loan:new')), 'otra revisión nunca borra trabajo local');
  assert.deepEqual(readFormDraft(s, 'ana', 'loan:new', { fingerprint: 'v1' }), { name: 'Muestra' });
});

let dom, createRoot, useFormDraft, DraftNotice;
const globals = new Map();
before(async () => {
  const outfile = path.resolve('output/form-draft-hook-test.mjs');
  await build({ stdin: { contents: "export { useFormDraft } from './src/hooks/useFormDraft.js'; export { default as DraftNotice } from './src/components/ui/DraftNotice.jsx';", resolveDir: process.cwd(), loader: 'jsx' }, outfile,
    bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', alias: { '@': path.resolve('src') } });
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3115' });
  for (const key of ['window', 'document', 'navigator']) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  }
  globals.set('IS_REACT_ACT_ENVIRONMENT', Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  ({ useFormDraft, DraftNotice } = await import(pathToFileURL(outfile)));
});
after(() => {
  dom?.window.close();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
async function withDraft(run, { defer = false } = {}) {
  window.localStorage.clear();
  window.localStorage.setItem('currentUser', JSON.stringify({ id: 'ana' }));
  const root = createRoot(document.getElementById('root'));
  let state;
  function ChildEditor({ setForm, value }) {
    React.useEffect(() => { setForm(value); }, [setForm, value]);
    return null;
  }
  function Form(props) {
    state = useFormDraft(props);
    props.seen?.push({ ...state[0] });
    return React.createElement(React.Fragment, null,
      React.createElement(DraftNotice, { draft: state[2] }),
      props.writeFromChild && React.createElement(ChildEditor, { key: props.scope, setForm: state[1], value: props.writeFromChild }));
  }
  const render = async (overrides = {}) => act(async () => root.render(React.createElement(Form, { scope: 'quotation:one', initial: { name: 'Servidor', total: 20 }, fingerprint: 'v2', defer, ...overrides })));
  try { await run({ render, state: () => state, s: window.localStorage }); }
  finally { await act(async () => root.unmount()); }
}
test('un conflicto bloquea cambios y recuperar exige una selección explícita', async () => {
  await withDraft(async ({ render, state, s }) => {
    saveFormDraft(s, 'ana', 'quotation:one', { name: 'Trabajo local', total: 10, admin: true }, { fingerprint: 'v1' });
    const original = s.getItem(formDraftKey('ana', 'quotation:one'));
    await render();
    assert.equal(state()[2].conflict, true);
    assert.deepEqual(state()[0], { name: 'Servidor', total: 20 });
    assert.equal(state()[2].restored, false);
    let updaterCalled = false;
    await act(async () => state()[1](() => { updaterCalled = true; return { name: 'Efecto automático', total: 0 }; }));
    assert.equal(updaterCalled, false, 'un editor hijo no puede reescribir el borrador en conflicto');
    assert.equal(s.getItem(formDraftKey('ana', 'quotation:one')), original);
    const revision = state()[2].revision;
    const recover = [...document.querySelectorAll('button')].find(button => button.textContent === 'Recuperar borrador');
    assert.ok(recover);
    await act(async () => recover.click());
    assert.equal(state()[2].conflict, false);
    assert.equal(state()[2].restored, true);
    assert.equal(state()[2].revision, revision + 1);
    assert.deepEqual(state()[0], { name: 'Trabajo local', total: 10 });
    assert.deepEqual(readFormDraft(s, 'ana', 'quotation:one', { fingerprint: 'v2' }), { name: 'Trabajo local', total: 10 });
    await act(async () => state()[2].discard());
    assert.deepEqual(state()[0], { name: 'Servidor', total: 20 }, 'descartar vuelve a la revisión remota actual');
  });
});
test('descartar un conflicto conserva el servidor y no toca otro recurso ni otra persona', async () => {
  await withDraft(async ({ render, state, s }) => {
    saveFormDraft(s, 'ana', 'quotation:one', { name: 'Local', total: 1 }, { fingerprint: 'v1' });
    saveFormDraft(s, 'bea', 'quotation:one', { name: 'Privado' }, { fingerprint: 'v1' });
    saveFormDraft(s, 'ana', 'quotation:other', { name: 'Otra' }, { fingerprint: 'v1' });
    await render();
    const revision = state()[2].revision;
    const discard = [...document.querySelectorAll('button')].find(button => button.textContent === 'Descartar borrador');
    await act(async () => discard.click());
    assert.deepEqual(state()[0], { name: 'Servidor', total: 20 });
    assert.equal(state()[2].conflict, false);
    assert.equal(state()[2].revision, revision + 1);
    assert.equal(s.getItem(formDraftKey('ana', 'quotation:one')), null);
    assert.deepEqual(readFormDraft(s, 'bea', 'quotation:one', { fingerprint: 'v1' }), { name: 'Privado' });
    assert.deepEqual(readFormDraft(s, 'ana', 'quotation:other', { fingerprint: 'v1' }), { name: 'Otra' });
  });
});
test('initialize detecta la revisión cargada y commit/clear retiran el conflicto', async () => {
  await withDraft(async ({ render, state, s }) => {
    saveFormDraft(s, 'ana', 'quotation:one', { name: 'Local', total: 1 }, { fingerprint: 'v1' });
    await render();
    const initialRevision = state()[2].revision;
    await act(async () => state()[2].initialize({ name: 'Cargado', total: 30 }, { fingerprint: 'v3' }));
    assert.equal(state()[2].revision, initialRevision + 1);
    assert.equal(state()[2].conflict, true);
    await act(async () => state()[2].commit({ name: 'Guardado', total: 30 }, { fingerprint: 'v4' }));
    assert.equal(state()[2].conflict, false);
    assert.equal(s.getItem(formDraftKey('ana', 'quotation:one')), null);
    saveFormDraft(s, 'ana', 'quotation:one', { name: 'Otro local', total: 2 }, { fingerprint: 'v1' });
    await act(async () => state()[2].initialize({ name: 'Cargado', total: 30 }, { fingerprint: 'v4' }));
    assert.equal(state()[2].conflict, true);
    await act(async () => state()[2].clear());
    assert.equal(state()[2].conflict, false);
    assert.equal(s.getItem(formDraftKey('ana', 'quotation:one')), null);
  }, { defer: true });
});
test('cambiar de identidad bloquea el efecto del editor antes de cargar el nuevo registro', async () => {
  await withDraft(async ({ render, state, s }) => {
    await render();
    await act(async () => state()[1]({ name: 'Borrador A', total: 15 }));
    const original = s.getItem(formDraftKey('ana', 'quotation:one'));
    await render({ scope: 'quotation:two', defer: true, writeFromChild: { name: 'Efecto del editor nuevo', total: 0 } });
    assert.equal(s.getItem(formDraftKey('ana', 'quotation:one')), original, 'el montaje nuevo no puede reescribir la sesión anterior');
    assert.equal(state()[2].ready, false);
    assert.equal(s.getItem(formDraftKey('ana', 'quotation:two')), null);
    await act(async () => state()[2].initialize({ name: 'Servidor B', total: 40 }, { fingerprint: 'b2' }));
    assert.equal(state()[2].ready, true);
    assert.deepEqual(state()[0], { name: 'Servidor B', total: 40 });
  });
});
test('otra persona no ve campos anteriores y las continuaciones tardías no alteran su sesión', async () => {
  await withDraft(async ({ render, state, s }) => {
    await render();
    await act(async () => state()[1]({ name: 'Privado de Ana', total: 15 }));
    const previous = state()[2];
    const original = s.getItem(formDraftKey('ana', 'quotation:one'));
    s.setItem('currentUser', JSON.stringify({ id: 'bea' }));
    const seen = [];
    await render({ initial: { name: 'Servidor de Bea', total: 50 }, seen });
    assert.ok(seen.length > 0);
    assert.ok(seen.every(form => form.name === 'Servidor de Bea'), 'ni el primer render debe exponer el formulario de otra persona');
    await act(async () => previous.initialize({ name: 'Respuesta tardía de Ana', total: 12 }, { fingerprint: 'v3' }));
    await act(async () => previous.commit({ name: 'Guardado tardío de Ana', total: 12 }));
    await act(async () => previous.clear());
    assert.deepEqual(state()[0], { name: 'Servidor de Bea', total: 50 });
    assert.equal(s.getItem(formDraftKey('ana', 'quotation:one')), original);
    assert.equal(s.getItem(formDraftKey('bea', 'quotation:one')), null);
  });
});
test('no comparte borradores anónimos ni rompe por almacenamiento bloqueado', () => {
  const s = storage();
  assert.equal(saveFormDraft(s, null, 'new', { x: 1 }), false);
  assert.equal(readFormDraft(s, null, 'new'), null);
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  assert.equal(saveFormDraft(blocked, 'ana', 'new', { x: 1 }), false);
  assert.equal(readFormDraft(blocked, 'ana', 'new'), null);
  assert.equal(clearFormDraft(blocked, 'ana', 'new'), false);
});
test('descarta entradas vencidas y no restaura claves extra ni estructuras incompatibles', () => {
  const s = storage(); saveFormDraft(s, 'ana', 'new', { x: 1 }, { now: 1 });
  assert.equal(readFormDraft(s, 'ana', 'new'), null);
  assert.deepEqual(restoreFormFields({ name: '', items: [], enabled: false }, { name: {}, items: {}, enabled: 'false', admin: true }), { name: '', items: [], enabled: false });
});
