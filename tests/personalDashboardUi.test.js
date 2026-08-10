import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Dashboard loads own personal dashboard and keeps team selection admin-only', () => {
  const source = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');

  assert.doesNotMatch(source, /currentUser\?\.role !== 'ADMIN'/, 'Dashboard should no longer block non-admin users from their own dashboard.');
  assert.match(source, /\/api\/dashboard\/personal/, 'Dashboard should call the personal dashboard API.');
  assert.match(source, /canViewTeamDashboards/, 'Only admins should be able to view other personal dashboards.');
  assert.match(source, /selectedUserId/, 'Admins should be able to select a team member dashboard.');
  assert.match(source, /Radar de Foco/, 'The old threat language should be replaced by Radar de Foco.');
});

test('Dashboard presents adoption-oriented sections', () => {
  const source = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');

  for (const label of ['Tu foco de hoy', 'Reto de la semana', 'Proximos pendientes', 'Logros recientes']) {
    assert.match(source.normalize('NFD').replace(/\p{Diacritic}/gu, ''), new RegExp(label), `Dashboard should render ${label}.`);
  }
});

test('Dashboard includes community manager account leadership widgets', () => {
  const source = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');

  for (const label of ['Mis clientes', 'Anuncios', 'Asignar cliente']) {
    assert.match(source, new RegExp(label), `Dashboard should render ${label}.`);
  }
  assert.match(source, /\/api\/dashboard\/announcements/, 'Dashboard should create dashboard announcements through the dashboard API.');
  assert.match(source, /\/api\/dashboard\/clients\/.*responsible/, 'Dashboard should assign client owners through the dashboard API.');
  assert.match(source, /Community Manager/i, 'Dashboard should filter assignment targets by Community Manager role.');
});
