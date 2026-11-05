import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

let root, dom, createRoot, useFinancialNavigation, current, location, navigate;
const globals = new Map();
before(async () => {
  const source = path.resolve('src/hooks/useFinancialNavigation.js');
  if (existsSync(source)) {
    const outfile = path.resolve('output/financial-navigation-hook-test.mjs');
    await build({ entryPoints: [source], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', alias: { '@': path.resolve('src') } });
    ({ useFinancialNavigation } = await import(pathToFileURL(outfile)));
  }
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3145' });
  for (const key of ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true });
  }
  ({ createRoot } = await import('react-dom/client'));
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
after(() => {
  dom?.window.close();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
async function mount(search = '', state = null) {
  assert.equal(typeof useFinancialNavigation, 'function', 'Financiero necesita una fuente navegable de pestaña y período');
  function Screen() {
    current = useFinancialNavigation(); location = useLocation(); navigate = useNavigate();
    return React.createElement('p', null, `${current.activeTab} ${current.selectedYear} ${current.filters.month}`);
  }
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [{ pathname: '/financiero', search, state }] }, React.createElement(Screen))));
}

test('conserva los enlaces antiguos de cartera, formalización y rentabilidad y cambia sin remontar', async () => {
  await mount('?tab=cartera&year=2025&month=9');
  assert.equal(current.activeTab, 'receivables');
  assert.equal(current.selectedYear, 2025);
  assert.equal(current.filters.month, '9');
  await act(async () => navigate('/financiero?tab=formalizacion&year=2024&month=2'));
  assert.equal(current.activeTab, 'formalizations');
  assert.equal(current.selectedYear, 2024);
  await act(async () => navigate('/financiero?tab=rentabilidad&year=2023&month=12'));
  assert.equal(current.activeTab, 'profitability');
  assert.equal(current.linkedMonth, '2023-12-01');
});

test('pestaña, período y filtros sobreviven al regreso sin perder origen ni otros selectores', async () => {
  const state = { from: { path: '/clientes/operacion/muestra', label: 'Operación', scrollY: 90 } };
  await mount('?minute=keep', state);
  await act(async () => current.setActiveTab('parties'));
  await act(async () => current.setSelectedYear(2025));
  await act(async () => current.setFilters(filters => ({ ...filters, month: '10', scenario: 'FORECAST', type: 'EXPENSE', category: 'SERVICIO', q: 'Cliente de muestra' })));
  const origin = `${location.pathname}${location.search}`;
  assert.deepEqual(location.state, state);
  assert.equal(new URLSearchParams(location.search).get('minute'), 'keep');
  await act(async () => navigate('/cotizaciones/editar/q1'));
  await act(async () => navigate(origin));
  assert.equal(current.activeTab, 'parties');
  assert.equal(current.selectedYear, 2025);
  assert.deepEqual(current.filters, { month: '10', scenario: 'FORECAST', type: 'EXPENSE', category: 'SERVICIO', q: 'Cliente de muestra' });
});

test('ignora pestaña y filtros inválidos, y no convierte un enlace en permiso', async () => {
  await mount('?tab=desconocida&year=hola&month=13&scenario=INVALID&type=DROP&category=INVALID');
  assert.equal(current.activeTab, 'records');
  assert.equal(current.selectedYear, 2026);
  assert.deepEqual(current.filters, { scenario: 'ACTUAL', month: '', type: '', category: '', q: '' });
  await act(async () => navigate('/financiero?tab=constructor'));
  assert.equal(current.activeTab, 'records', 'un nombre heredado de Object no es una pestaña');
  await act(async () => current.setActiveTab('payroll'));
  assert.equal(current.activeTab, 'payroll');
  await act(async () => current.setFilters(filters => ({ ...filters, month: '2' })));
  await act(async () => current.setFilters(filters => ({ ...filters, month: '' })));
  assert.equal(new URLSearchParams(location.search).has('month'), false);
});

test('el dashboard consume la navegación sin mantener otra pestaña o período en memoria', () => {
  const source = readFileSync(new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url), 'utf8');
  assert.match(source, /useFinancialNavigation\(\)/);
  assert.doesNotMatch(source, /\[activeTab, setActiveTab\] = useState|\[selectedYear, setSelectedYear\] = useState|\[filters, setFilters\] = useState/);
  assert.ok(/<ProfitabilityTab key=\{linkedMonth\}/.test(source), 'otro enlace de rentabilidad carga su mes aunque la vista ya esté abierta');
});
