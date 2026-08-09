import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Dashboard is admin-only and loads personal dashboard endpoint', () => {
  const source = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');

  assert.match(source, /currentUser\?\.role !== 'ADMIN'/, 'Dashboard should gate the personal view to admins.');
  assert.match(source, /\/api\/dashboard\/personal/, 'Dashboard should call the personal dashboard API.');
  assert.match(source, /selectedUserId/, 'Admins should be able to select a team member dashboard.');
  assert.match(source, /Radar de Foco/, 'The old threat language should be replaced by Radar de Foco.');
});

test('Dashboard presents adoption-oriented sections', () => {
  const source = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');

  for (const label of ['Tu foco de hoy', 'Reto de la semana', 'Próximos pendientes', 'Logros recientes']) {
    assert.match(source, new RegExp(label), `Dashboard should render ${label}.`);
  }
});
