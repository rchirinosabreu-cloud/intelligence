import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('el esquema conserva un ciclo de crecimiento auditable y conciliaciones financieras', async () => {
  const schema = await read('prisma/schema.prisma');
  assert.match(schema, /model GrowthCycle \{/);
  assert.match(schema, /model GrowthAction \{[\s\S]*evidenceRequired\s+Boolean/);
  assert.match(schema, /model GrowthActionEvidence \{/);
  assert.match(schema, /model GrowthMetricSnapshot \{/);
  assert.match(schema, /model FinancialDiscrepancy \{[\s\S]*status\s+FinancialDiscrepancyStatus/);
  assert.match(schema, /model FinancialAccount \{[\s\S]*lastFour\s+String\?/);
});

test('crecimiento queda protegido por permiso y disponible en navegación', async () => {
  const [routes, app, sidebar] = await Promise.all([
    read('src/routes/index.js'),
    read('src/App.jsx'),
    read('src/components/layout/Sidebar.jsx')
  ]);
  assert.match(routes, /router\.use\('\/growth',\s*requireModulePermission\('crecimiento'\),\s*growthRouter\)/);
  assert.match(app, /path="\/crecimiento"/);
  assert.match(sidebar, /moduleKey: 'crecimiento'/);
});

test('la interfaz incluye ruta, métricas, acciones y bandeja de conciliación', async () => {
  const component = await read('src/components/modules/GrowthCenter.jsx');
  assert.match(component, /Ruta de 90 días/);
  assert.match(component, /Métricas clave/);
  assert.match(component, /Acciones de la semana/);
  assert.match(component, /Conciliación financiera/);
  assert.match(component, /dark:/);
  assert.match(component, /sm:|md:|lg:/);
  assert.match(component, /Dato financiero provisional/);
  assert.match(component, /Ordenar/);
  assert.match(component, /Vender/);
  assert.match(component, /Consolidar/);
  assert.match(component, /selectedWeek/);
  assert.doesNotMatch(component, /actions\.slice\(0, 10\)/);
});
