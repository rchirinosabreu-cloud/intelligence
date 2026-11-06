import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let dom, root, createRoot, Parties, Minutes, BackToOrigin, currentLocation, navigate, client;
const globals = new Map();
const button = label => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label);
before(async () => {
  const outfile = path.resolve('output/commercial-navigation-interactions-test.mjs');
  await build({ stdin: { contents: "export { default as Parties } from './src/components/modules/financial/FinancialPartiesDirectory.jsx'; export { default as Minutes } from './src/components/modules/Minutes/AutomaticMinutesPanel.jsx'; export { default as BackToOrigin } from './src/components/layout/BackToOrigin.jsx';", resolveDir: process.cwd(), loader: 'jsx' },
    outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', alias: { '@': path.resolve('src') }, define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'minutes-in-memory', setup(build) {
      build.onResolve({ filter: /frontendApiService$/ }, () => ({ path: 'minutes-api', namespace: 'fixture' }));
      build.onResolve({ filter: /ConfirmDialog$/ }, () => ({ path: 'confirm', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'confirm'
        ? 'export const useConfirmDialog = () => async () => false;'
        : "export default { getAutomatedMinutes: async () => ({ minutes: [{ id: 'minute-1', title: 'Reunión de muestra', status: 'READY', actionItems: [{ task: 'Revisar diseño', taskId: 'task-1' }] }] }) };", loader: 'js' }));
    } }],
  });
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3145' });
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'IS_REACT_ACT_ENVIRONMENT']) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true });
  }
  ({ createRoot } = await import('react-dom/client'));
  ({ Parties, Minutes, BackToOrigin } = await import(pathToFileURL(outfile)));
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; client?.clear(); });
after(() => {
  dom?.window.close();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
async function mount(entry) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  client.setQueryData(['financial-client-directory'], [{ id: 'client-1', name: 'Cliente de muestra' }]);
  client.setQueryData(['financial-third-parties'], { thirdParties: [] });
  client.setQueryData(['financial-party-team'], { team: [] });
  client.setQueryData(['financial-party-commercial'], { prospects: [], quotationsByClient: { 'client-1': [{ id: 'quote-1', code: 'COT-0001', status: 'ACTIVA', total: 100 }] } });
  function Screen() {
    currentLocation = useLocation(); navigate = useNavigate();
    return React.createElement(React.Fragment, null, React.createElement(BackToOrigin),
      currentLocation.pathname === '/financiero' ? React.createElement(Parties, { reconciliation: { clients: [] }, clientTargetChoices: [], clientLinkTargets: {}, formatCurrency: String })
        : currentLocation.pathname === '/minutas' ? React.createElement(Minutes) : React.createElement('p', null, 'Destino de muestra'));
  }
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, { initialEntries: [entry] }, React.createElement(Screen)))));
}
test('volver de la cotización restaura Terceros, período, filtro y la ficha abierta', async () => {
  await mount('/financiero?tab=terceros&year=2025&month=10&party=client-1&partyQ=muestra');
  assert.equal(document.querySelector('[data-party-row="client-1"] button[aria-expanded]').getAttribute('aria-expanded'), 'true');
  const link = document.querySelector('a[href="/cotizaciones/editar/quote-1"]');
  assert.ok(link, 'la ficha abierta permite consultar su cotización');
  await act(async () => link.click());
  assert.equal(currentLocation.pathname, '/cotizaciones/editar/quote-1');
  await act(async () => button('Volver a Financiero · Terceros').click());
  const params = new URLSearchParams(currentLocation.search);
  assert.equal(params.get('month'), '10');
  assert.equal(document.querySelector('input[type="search"]').value, 'muestra');
  assert.equal(document.querySelector('[data-party-row="client-1"] button[aria-expanded]').getAttribute('aria-expanded'), 'true');
});

test('la minuta elegida se conserva al consultar un pendiente y al abrir otro enlace en el mismo módulo', async () => {
  const initialState = { from: { path: '/crm', label: 'CRM', scrollY: 0 } };
  await mount({ pathname: '/minutas', search: '?minute=minute-1', state: initialState });
  const task = document.querySelector('a[href="/gestion?taskId=task-1"]');
  assert.ok(task, 'el enlace abre la minuta solicitada sin otro clic');
  await act(async () => task.click());
  assert.equal(currentLocation.pathname, '/gestion');
  await act(async () => button('Volver a Minutas').click());
  assert.ok(document.querySelector('a[href="/gestion?taskId=task-1"]'));
  await act(async () => navigate('/minutas?minutesView=trash', { state: initialState }));
  assert.match(document.body.textContent, /Las minutas de la Papelera/);
  assert.equal(document.querySelector('a[href="/gestion?taskId=task-1"]'), null);
  await act(async () => button('Minutas').click());
  assert.deepEqual(currentLocation.state, initialState, 'cambiar la vista conserva el origen del módulo');
});
