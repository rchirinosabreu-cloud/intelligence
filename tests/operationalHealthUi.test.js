import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

const read = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8').catch(() => '');

test('operational health is an admin-only lazy route and navigation item', async () => {
  const [app, sidebar, routes] = await Promise.all([
    read('src/App.jsx'),
    read('src/components/layout/Sidebar.jsx'),
    read('src/routes/api/dashboard.js')
  ]);

  assert.match(app, /const OperationalHealth = lazy\(/);
  assert.match(app, /path="\/salud-operativa"/);
  assert.match(app, /AdminGuard/);
  assert.match(sidebar, /Salud Operativa/);
  assert.match(sidebar, /roles:\s*\['ADMIN'\]/);
  assert.ok(
    sidebar.indexOf("label: 'Salud Operativa'") > sidebar.indexOf("label: 'Equipo'"),
    'Salud Operativa should be the final sidebar module.'
  );
  assert.match(routes, /\/operational-health/);
  assert.match(routes, /requireRole\('ADMIN'\)/);
});

test('operational health UI exposes explainable metrics and actionable details', async () => {
  const source = await read('src/components/modules/OperationalHealth.jsx');

  for (const label of [
    'Salud Operativa',
    'Adopcion semanal',
    'Calidad de tareas',
    'Uso por modulo',
    'Atencion requerida',
    'Como se calcula'
  ]) {
    assert.match(
      source.normalize('NFD').replace(/\p{Diacritic}/gu, ''),
      new RegExp(label),
      `The operational health view should render ${label}.`
    );
  }

  assert.match(source, /\/api\/dashboard\/operational-health/);
  assert.match(source, /issue\.items/);
  assert.match(source, /item\.url/);
  assert.match(source, /dark:/, 'The new view must support dark mode.');
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/, 'Operational metrics must not render raw HTML.');

  await transformWithEsbuild(source, 'src/components/modules/OperationalHealth.jsx', {
    loader: 'jsx',
    jsx: 'automatic'
  });
});
