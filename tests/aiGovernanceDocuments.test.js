import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let dom, root, client, Center;
let pending, downloads;
const savedFetch = globalThis.fetch;
const savedCreateUrl = URL.createObjectURL;
const savedRevokeUrl = URL.revokeObjectURL;
const globals = new Map();
const tick = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
const button = name => [...document.querySelectorAll('button')].find(node => node.textContent.includes(name));
const click = async name => { const node = button(name); assert.ok(node, `Falta botón: ${name}`); await act(async () => node.click()); await tick(); };
const answer = async (id, content, status = 200) => {
  const request = pending.findLast(item => item.url.endsWith(`/documents/${id}`) && !item.done);
  assert.ok(request, `Falta solicitud de ${id}`); request.done = true;
  await act(async () => request.resolve(new Response(content, { status, headers: { 'Content-Type': status === 200 ? 'text/markdown' : 'application/json' } })));
  await tick();
};

before(async () => {
  const outfile = path.resolve('output/governance-documents-test.mjs');
  await build({ entryPoints: ['src/components/modules/Governance/GovernanceCenter.jsx'], outfile,
    bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
    alias: { '@': path.resolve('src') }, loader: { '.css': 'empty' }, define: { 'import.meta.env.VITE_API_URL': '""' } });
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3114', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'getComputedStyle', 'localStorage', 'navigator']) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Center = (await import(pathToFileURL(outfile))).default;
});

beforeEach(async () => {
  pending = []; downloads = [];
  localStorage.setItem('authToken', 'synthetic-admin-token');
  URL.createObjectURL = blob => { downloads.push(blob); return 'blob:synthetic'; };
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/options')) return Response.json({ clients: [], people: [], systems: [], risks: [], policies: [] });
    if (url.includes('/documents/')) return new Promise(resolve => pending.push({ url, options, resolve }));
    return Response.json({ page: 1, hasMore: false, items: [] });
  };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { createRoot } = await import('react-dom/client');
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Center))));
  await tick(); await click('Documentos internos');
});

afterEach(async () => { await act(async () => root.unmount()); client.clear(); });
after(() => {
  globalThis.fetch = savedFetch; URL.createObjectURL = savedCreateUrl; URL.revokeObjectURL = savedRevokeUrl;
  dom.window.close();
  for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

test('abre Markdown dentro del módulo sin descarga automática, con tablas y HTML inerte', async () => {
  await click('Programa, alcance y brechas');
  assert.match(document.body.textContent, /Cargando documento/);
  assert.equal(pending[0].options.headers.Authorization, 'Bearer synthetic-admin-token');
  await answer('01-programa', '# Programa interno\n\n**Contenido privado**\n\n| Riesgo | Control |\n| --- | --- |\n| Fuga | Autorización |\n\n<script>alert(1)</script>\n\n![remota](https://example.com/pixel.png)\n\n[malicioso](javascript:alert%281%29)');
  const article = document.querySelector('article[aria-label="Programa, alcance y brechas"]');
  assert.ok(article, 'Debe existir un lector, no solo una descarga');
  assert.equal(article.querySelector('strong').textContent, 'Contenido privado');
  assert.ok(article.querySelector('table')); assert.equal(article.querySelector('script, img, [href^="javascript:"]'), null);
  assert.equal(downloads.length, 0);
  assert.equal(button('Programa, alcance y brechas').getAttribute('aria-expanded'), 'true');
});

test('cambiar de documento descarta respuestas tardías y cerrar devuelve el foco', async () => {
  await click('Programa, alcance y brechas');
  await click('Política de uso responsable');
  await answer('02-politica', '# Política vigente\n\nSegundo documento.');
  await answer('01-programa', '# Respuesta antigua\n\nNo debe sustituir la política.');
  assert.match(document.querySelector('article').textContent, /Segundo documento/);
  assert.doesNotMatch(document.querySelector('article').textContent, /Respuesta antigua/);
  await click('Cerrar lectura');
  assert.equal(document.querySelector('article'), null);
  assert.equal(document.activeElement, button('Política de uso responsable'));
});

test('un error de permisos oculta el texto anterior y permite reintentar', async () => {
  await click('Programa, alcance y brechas');
  await answer('01-programa', '# Primer documento\n\nTexto anterior.');
  await click('Política de uso responsable');
  assert.doesNotMatch(document.body.textContent, /Texto anterior/);
  await answer('02-politica', JSON.stringify({ error: 'No autorizado.' }), 403);
  assert.match(document.querySelector('[role="alert"]').textContent, /No autorizado/);
  assert.equal(document.querySelector('article'), null);
  await click('Reintentar');
  await answer('02-politica', '# Política\n\nRecuperado.');
  assert.match(document.querySelector('article').textContent, /Recuperado/);
});

test('la descarga secundaria conserva el documento seleccionado y revalida acceso', async () => {
  await click('Política de uso responsable');
  await answer('02-politica', '# Política\n\nPara lectura.');
  await click('Descargar Markdown');
  await answer('02-politica', '# Política\n\nPara descarga.');
  assert.equal(await downloads[0].text(), '# Política\n\nPara descarga.');
  assert.equal(downloads[1], '02-politica.md');
  assert.match(document.querySelector('article').textContent, /Para lectura/);
});
