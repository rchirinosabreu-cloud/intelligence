import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Contrato de la pantalla del semáforo de servicios (4 de octubre de 2026).
const panel = readFileSync(new URL('../src/components/modules/ServiceHealthPanel.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/components/modules/OperationalHealth.jsx', import.meta.url), 'utf8');

test('the panel lives in the admin-only Salud operativa page, above the team metrics', () => {
  assert.match(page, /import ServiceHealthPanel from '\.\/ServiceHealthPanel'/);
  assert.ok(page.indexOf('<ServiceHealthPanel') < page.indexOf('<ScorePanel'));
  assert.match(panel, /\/api\/service-health/);
  assert.match(panel, /enabled: isAdmin/);
});

test('the colors come from the shared status tokens, red only from destructive', () => {
  assert.match(panel, /bg-status-positive/);
  assert.match(panel, /bg-status-attention/);
  assert.match(panel, /bg-destructive/);
  assert.doesNotMatch(panel, /\b(?:bg|text|border)-(?:red|rose|purple|violet|indigo|fuchsia|sky|teal|emerald)-/);
  assert.doesNotMatch(panel, /#[0-9a-fA-F]{6}\b/);
});

test('every light is also said in words, never only with color', () => {
  for (const label of ['Funciona', 'Con problemas', 'Caído', 'Sin configurar']) assert.match(panel, new RegExp(label));
  assert.match(panel, /aria-label=\{`\$\{service\.label\}: /);
});

test('the manual check reports success only after the server answers', () => {
  const run = panel.slice(panel.indexOf('const runNow'), panel.indexOf('const runNow') + 900);
  assert.ok(run.indexOf('await fetch') < run.indexOf('toast.success'));
  assert.match(run, /console\.error/);
});

test('both themes are covered', () => {
  assert.match(panel, /dark:bg-zinc-900/);
  assert.match(panel, /dark:text-zinc-400/);
});

// Avisos y punto en la barra (Rodny, 5 de octubre de 2026).
test('the header dot is for administrators, uses the status tokens and leads to the board', () => {
  const dot = readFileSync(new URL('../src/components/layout/ServiceHealthDot.jsx', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../src/components/layout/AppLayout.jsx', import.meta.url), 'utf8');
  assert.match(layout, /<ServiceHealthDot isAdmin=\{currentUser\?\.role === 'ADMIN'\} \/>/);
  assert.match(dot, /if \(!isAdmin \|\| !data\) return null/);
  assert.match(dot, /\/api\/service-health\/summary/);
  assert.match(dot, /navigate\('\/salud-operativa'\)/);
  assert.match(dot, /aria-label=/);
  for (const token of ['bg-status-positive', 'bg-status-attention', 'bg-destructive']) assert.match(dot, new RegExp(token));
  assert.doesNotMatch(dot, /\b(?:bg|text|ring)-(?:red|rose|green|emerald|amber)-/);
});

test('the service alerts open the board and read as plain Spanish', async () => {
  const layout = readFileSync(new URL('../src/components/layout/AppLayout.jsx', import.meta.url), 'utf8');
  assert.match(layout, /notif\.type === 'SERVICE_HEALTH_DOWN' \|\| notif\.type === 'SERVICE_HEALTH_RECOVERED'\) \{[\s\S]*?navigate\('\/salud-operativa'\)/);
  const { getNotificationDisplayParts } = await import('../src/utils/notificationUtils.js');
  assert.equal(getNotificationDisplayParts({ type: 'SERVICE_HEALTH_DOWN', message: 'OpenAI está caído: Se acabó el crédito.' }).title, 'Un servicio está caído');
  assert.equal(getNotificationDisplayParts({ type: 'SERVICE_HEALTH_RECOVERED', message: 'OpenAI volvió a funcionar.' }).title, 'Un servicio volvió a funcionar');
});
