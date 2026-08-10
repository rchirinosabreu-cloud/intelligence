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
  assert.doesNotMatch(source, /Mis tareas de hoy/, 'Dashboard should not duplicate the adopted Gestion task module.');
  assert.match(source, /Ver historial completo/, 'Recent achievements should expose the full history.');
  assert.match(source, /CompletedTasksHistoryModal/, 'Recent achievements should use the original full-history modal.');
  assert.match(source, /setShowHistoryModal/, 'Recent achievements should keep the original modal state.');
  assert.doesNotMatch(source, /showAchievementsHistory/, 'Recent achievements should not use the rebuilt inline history.');
  assert.match(
    source,
    /xl:grid-cols-\[minmax\(0,3fr\)_minmax\(0,1fr\)\]/,
    'Radar should use 75% of the row and recent achievements 25%.'
  );
});

test('Dashboard includes community manager account leadership widgets', () => {
  const source = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');

  for (const label of ['Mis clientes', 'Anuncios', 'Asignar cliente']) {
    assert.match(source, new RegExp(label), `Dashboard should render ${label}.`);
  }
  assert.match(source, /\/api\/dashboard\/announcements/, 'Dashboard should create dashboard announcements through the dashboard API.');
  assert.match(source, /\/api\/dashboard\/clients\/.*responsible/, 'Dashboard should assign client owners through the dashboard API.');
  assert.match(source, /Community Manager/i, 'Dashboard should filter assignment targets by Community Manager role.');
  assert.match(
    source,
    /selectedMember\?\.isCommunityManager\s*&&/,
    'Mis clientes should render only for the selected Community Manager.'
  );
});

test('Dashboard focus cards can reveal the tasks behind each signal', () => {
  const source = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');

  assert.match(source, /expandedFocusCards/, 'Dashboard should track expanded focus cards.');
  assert.match(source, /focusCard\.items/, 'Dashboard should render related focus-card tasks.');
  assert.match(source, /Ver mas/, 'Focus cards should expose a generic detail toggle.');
  assert.match(source, /getFocusItemUrl/, 'Focus-card items should know where to navigate.');
  assert.match(source, /window\.location\.href = getFocusItemUrl/, 'Focus-card items should navigate to their source.');
  assert.doesNotMatch(source, /Correcciones y vencidas/, 'Dashboard should not duplicate returned and overdue work outside Radar de Foco.');
  assert.doesNotMatch(source, /Ver tareas/, 'Focus cards should not call every detail a task.');
});
