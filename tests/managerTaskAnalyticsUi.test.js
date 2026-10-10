import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readPanel = () => readFile('src/components/modules/ManagerTaskAnalytics.jsx', 'utf8');
const readApp = () => readFile('src/App.jsx', 'utf8');

test('Manager route replaces BrainCore with the descriptive task panel', async () => {
  const [app, panel] = await Promise.all([readApp(), readPanel()]);
  assert.match(app, /lazyWithRecovery\(\(\) => import\('\.\/components\/modules\/ManagerTaskAnalytics'\)\)/);
  assert.match(app, /path="\/manager"[\s\S]*?<ManagerTaskAnalytics \/>/);
  assert.match(panel, /data-manager-task-analytics/);
});

// Rodny, 9 de octubre de 2026: «necesito analizar los tiempos, leer al miembro del equipo … eso va para todos».
// Lo que antes era «no compara velocidad individual» pasó a ser la pestaña Ritmo, que lee a cada persona como
// una conversación pendiente, no como una calificación; Observer se queda con su bandeja.
test('each tab explains its purpose; Ritmo reads people without grading them', async () => {
  const panel = await readPanel();
  assert.match(panel, /Señales que Bria detecta por su cuenta, cada una con su evidencia/);
  assert.match(panel, /Es una lectura para conversar con cada quien, no una calificación/);
  assert.doesNotMatch(panel, /No compara velocidad individual/i);
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

test('Bria exposes a real Memory tab with coverage, sources and traceable retrieval', async () => {
  const panel = await readPanel();
  const memoryPanel = await readFile('src/components/modules/BriaMemoryPanel.jsx', 'utf8');

  assert.match(panel, /data-bria-tab="memory"/);
  assert.match(panel, /setActiveTab\('memory'\)/);
  assert.match(panel, /<BriaMemoryPanel/);
  assert.match(memoryPanel, /Memoria utilizable/);
  assert.match(memoryPanel, /Cobertura de fuentes/);
  assert.match(memoryPanel, /Auditoría de recuperación/);
  assert.match(memoryPanel, /\/api\/manager\/bria-memory/);
  assert.match(memoryPanel, /sourceUrl/);
});

test('Bria Observer renders prioritized signals and their evidence', async () => {
  const panel = await readPanel();
  const inbox = await readFile('src/components/modules/BriaObserverInbox.jsx', 'utf8');
  assert.match(panel, /<BriaObserverInbox/);
  assert.match(inbox, /Bandeja del Observer/);
  assert.match(inbox, /signal\.evidence/);
  assert.match(inbox, /Filtrar señales por estado/);
  assert.match(inbox, /Descartar/);
});

test('Bria labels simultaneous sessions as a live metric', async () => {
  const panel = await readPanel();
  assert.match(panel, /Sesiones simultáneas activas ahora/);
  assert.doesNotMatch(panel, /Sesiones simultáneas registradas/);
});
