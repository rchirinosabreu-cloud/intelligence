import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let dom, root, client, AuthProvider, useAuth, auth;
const globals = new Map();
const ana = { id: 'ana', name: 'Ana', role: 'EDITOR' };
const bea = { id: 'bea', name: 'Bea', role: 'EDITOR' };
const previousTask = { id: 'same-task', comments: 'Detalle privado de Ana', participants: [
  { memberId: 'bea-member', member: { userId: 'bea' }, permissions: { canChangeStatus: false, canReturn: true } }
] };

before(async () => {
  const outfile = path.resolve('output/auth-query-isolation-test.mjs');
  await build({ entryPoints: ['src/context/AuthContext.jsx'], outfile,
    bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
    alias: { '@': path.resolve('src') }, define: { 'import.meta.env.VITE_API_URL': '""' } });
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3114' });
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'localStorage', 'sessionStorage', 'navigator', 'fetch', 'IS_REACT_ACT_ENVIRONMENT']) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], writable: true, configurable: true });
  }
  globalThis.fetch = () => { throw new Error('Esta prueba no debe consultar ninguna API.'); };
  ({ AuthProvider, useAuth } = await import(pathToFileURL(outfile)));
});

beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear();
  globalThis.fetch = () => { throw new Error('Esta prueba no debe consultar ninguna API.'); };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 30_000 } } });
  function Probe() { auth = useAuth(); return React.createElement('span', null, auth.currentUser?.name || 'Sin sesión'); }
  const { createRoot } = await import('react-dom/client');
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(AuthProvider, null, React.createElement(Probe)))));
  await act(async () => auth.login('synthetic-token-ana', ana));
  client.setQueryData(['nativeTasks'], [previousTask]);
});

afterEach(async () => { await act(async () => root.unmount()); client.clear(); });
after(() => {
  dom.window.close();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});

test('cambiar de Ana a Bea no entrega permisos ni cuerpos de tareas de la sesión anterior', async () => {
  await act(async () => auth.logout());
  assert.equal(client.getQueryData(['nativeTasks']), undefined, 'salir retira las respuestas de Ana');
  await act(async () => auth.login('synthetic-token-bea', bea));
  assert.equal(auth.currentUser.id, 'bea');
  assert.equal(client.getQueryData(['nativeTasks']), undefined, 'Bea debe consultar sus propios permisos');
});

test('un login nuevo también limpia respuestas aunque no haya pasado por el botón Salir', async () => {
  await act(async () => auth.login('synthetic-token-bea', bea));
  assert.equal(client.getQueryData(['nativeTasks']), undefined);
});

test('una consulta pendiente se cancela al salir y su respuesta tardía no vuelve a la caché', async () => {
  let release, signal;
  const pending = client.fetchQuery({ queryKey: ['private-task', 'ana'], queryFn: context => {
    signal = context.signal;
    return new Promise(resolve => { release = resolve; });
  } }).catch(error => error);
  await act(async () => auth.logout());
  assert.equal(signal.aborted, true);
  release(previousTask);
  await pending;
  assert.equal(client.getQueryData(['private-task', 'ana']), undefined);
});

test('la expiración de sesión limpia respuestas y una actualización de perfil conserva la sesión vigente', async () => {
  await act(async () => auth.updateCurrentUser({ name: 'Ana actualizada' }));
  assert.deepEqual(client.getQueryData(['nativeTasks']), [previousTask]);
  await act(async () => window.dispatchEvent(new window.Event('auth-error')));
  assert.equal(auth.currentUser, null);
  assert.equal(client.getQueryData(['nativeTasks']), undefined);
});

for (const boundary of ['logout', 'login', 'auth-error']) {
  test(`una respuesta tardía de auth/me no restaura a Ana después de ${boundary}`, async () => {
    await act(async () => root.unmount());
    const token = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.a`;
    localStorage.setItem('authToken', token);
    localStorage.setItem('currentUser', JSON.stringify(ana));
    let release, signal;
    // La entrega ignora la cancelación deliberadamente: también se debe descartar una respuesta ya recibida.
    globalThis.fetch = async (url, options) => {
      assert.match(url, /\/api\/auth\/me$/);
      signal = options.signal;
      return new Promise(resolve => { release = resolve; });
    };
    function Probe() { auth = useAuth(); return null; }
    const { createRoot } = await import('react-dom/client');
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(AuthProvider, null, React.createElement(Probe)))));
    await act(async () => {
      if (boundary === 'login') auth.login('synthetic-token-bea', bea);
      else if (boundary === 'logout') auth.logout();
      else window.dispatchEvent(new window.Event('auth-error'));
    });
    await act(async () => release(Response.json(ana)));
    assert.equal(auth.currentUser?.id || null, boundary === 'login' ? 'bea' : null);
    assert.equal(JSON.parse(localStorage.getItem('currentUser') || 'null')?.id || null, boundary === 'login' ? 'bea' : null);
    assert.equal(localStorage.getItem('authToken'), boundary === 'login' ? 'synthetic-token-bea' : null);
    assert.equal(signal?.aborted, true);
  });
}
