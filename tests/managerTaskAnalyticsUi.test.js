import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readPanel = () => readFile('src/components/modules/ManagerTaskAnalytics.jsx', 'utf8');
const readApp = () => readFile('src/App.jsx', 'utf8');

test('Manager route replaces BrainCore with the descriptive task panel', async () => {
  const [app, panel] = await Promise.all([readApp(), readPanel()]);
  assert.match(app, /lazy\(\(\) => import\('\.\/components\/modules\/ManagerTaskAnalytics'\)\)/);
  assert.match(app, /path="\/manager"[\s\S]*?<ManagerTaskAnalytics \/>/);
  assert.match(panel, /data-manager-task-analytics/);
});

test('descriptive panel explains its purpose and avoids individual rankings', async () => {
  const panel = await readPanel();
  assert.match(panel, /Centro descriptivo de tareas/);
  assert.match(panel, /comprender el trabajo, no vigilar personas/i);
  assert.match(panel, /No compara velocidad individual/i);
});

test('descriptive panel exposes periods, core metrics and data quality', async () => {
  const panel = await readPanel();
  assert.match(panel, /\[7, 30, 90\]/);
  assert.match(panel, /Esfuerzo registrado/);
  assert.match(panel, /Mediana por sesión/);
  assert.match(panel, /Retrabajo/);
  assert.match(panel, /Calidad del dato/);
  assert.match(panel, /Por categoría/);
  assert.match(panel, /Por cliente/);
  assert.match(panel, /Sesiones recientes/);
});

test('panel fetches the authenticated Manager analytics endpoint', async () => {
  const panel = await readPanel();
  assert.match(panel, /\/api\/manager\/task-analytics\?days=/);
  assert.match(panel, /Authorization/);
  assert.match(panel, /authToken/);
});

test('Manager presents Bria with Observer and Copilot tabs while keeping Observer passive', async () => {
  const panel = await readPanel();
  assert.match(panel, /Bria/);
  assert.match(panel, /data-bria-tab="observer"/);
  assert.match(panel, /data-bria-tab="copilot"/);
  assert.match(panel, /Observa y explica; no ejecuta acciones/i);
  assert.match(panel, /Copilot[\s\S]*Pr[oó]xima etapa/i);
});

test('Bria Observer renders prioritized signals and their evidence', async () => {
  const panel = await readPanel();
  assert.match(panel, /Señales observadas/);
  assert.match(panel, /analytics\.observer\?\.signals/);
  assert.match(panel, /signal\.evidence/);
  assert.match(panel, /Muestra insuficiente para predecir/i);
});

test('Bria labels simultaneous sessions as a live metric', async () => {
  const panel = await readPanel();
  assert.match(panel, /Sesiones simultáneas activas ahora/);
  assert.doesNotMatch(panel, /Sesiones simultáneas registradas/);
});
