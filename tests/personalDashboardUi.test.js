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

  for (const label of ['Reto de la semana', 'Proximos pendientes', 'Logros recientes']) {
    assert.match(source.normalize('NFD').replace(/\p{Diacritic}/gu, ''), new RegExp(label), `Dashboard should render ${label}.`);
  }
  assert.doesNotMatch(source, /Tu foco de hoy/i, 'The redundant focus eyebrow should not appear above the member name.');
  assert.doesNotMatch(source, /Mis tareas de hoy/, 'Dashboard should not duplicate the adopted Gestion task module.');
  assert.match(source, /Ver historial completo/, 'Recent achievements should expose the full history.');
  assert.match(source, /CompletedTasksHistoryModal/, 'Recent achievements should use the original full-history modal.');
  assert.match(source, /setShowHistoryModal/, 'Recent achievements should keep the original modal state.');
  assert.doesNotMatch(source, /showAchievementsHistory/, 'Recent achievements should not use the rebuilt inline history.');
  assert.match(source, /const balancedDashboardGridClass/, 'Dashboard should define one shared grid for visual symmetry.');
  assert.ok(
    (source.match(/balancedDashboardGridClass/g) || []).length >= 4,
    'Profile/Radar/Upcoming should align with Challenge/Achievements/Announcements using the same 65/35 grid.'
  );
});

test('Dashboard includes community manager account leadership widgets', () => {
  const source = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');

  for (const label of ['Mis clientes', 'Asignar cliente']) {
    assert.match(source, new RegExp(label), `Dashboard should render ${label}.`);
  }
  assert.match(source, /DashboardAnnouncements/, 'Dashboard should render the unified announcement panel.');
  assert.match(source, /\/api\/dashboard\/announcements/, 'Dashboard should create dashboard announcements through the dashboard API.');
  assert.match(source, /\/api\/dashboard\/clients\/.*responsible/, 'Dashboard should assign client owners through the dashboard API.');
  assert.match(source, /Community Manager/i, 'Dashboard should filter assignment targets by Community Manager role.');
  assert.match(
    source,
    /selectedMember\?\.isCommunityManager\s*&&/,
    'Mis clientes should render only for the selected Community Manager.'
  );
  assert.doesNotMatch(source, />Crear anuncio</, 'Announcement creation should live inside the announcement panel, not a separate widget.');
  assert.ok(
    source.indexOf('<DashboardAnnouncements') < source.indexOf('Próximos pendientes'),
    'Announcements should occupy the wide left column before upcoming work on the right.'
  );
});

test('Dashboard announcement panel supports rich, private and historical announcements', () => {
  const source = readFileSync('src/components/modules/DashboardAnnouncements.jsx', 'utf8');

  assert.match(source, /announcements\.slice\(0, 3\)/, 'The dashboard widget should show at most three announcements.');
  assert.match(source, /Anuncio general/, 'Global announcements should use the requested label.');
  assert.doesNotMatch(source, />Directo</, 'Personal announcements should not expose a label.');
  assert.match(source, /bg-zinc-900/, 'Personal announcements should use a solid dark surface.');
  assert.match(source, /text-white/, 'Personal announcement content should be white.');
  assert.match(source, /Ver historial de anuncios/, 'The widget should open the complete announcement history.');
  assert.match(source, /RichTextEditor/, 'Managers should compose formatted announcements with the shared editor.');
  assert.match(source, /RichCommentContent/, 'Announcements should render sanitized rich text.');
  assert.match(source, /insertEmoji/, 'The announcement composer should support emoji insertion.');
  assert.match(source, /canManage/, 'Creation controls should remain restricted to admins and project managers.');
  assert.match(source, /Editar anuncio/, 'Admins should be able to edit an announcement from its history.');
  assert.match(source, /Eliminar anuncio/, 'Admins should be able to delete an announcement from its history.');
  assert.match(source, /onUpdate/, 'Announcement edits should be persisted through the dashboard API.');
  assert.match(source, /onDelete/, 'Announcement deletion should be persisted through the dashboard API.');
  assert.doesNotMatch(source, /window\.confirm|\bconfirm\(/, 'Announcement deletion should never use the browser confirmation dialog.');
  assert.match(source, /deleteCandidate/, 'The platform should own confirmation state for announcement deletion.');
  assert.match(source, /DialogContent/, 'Announcement deletion should use a Brainstudio dialog.');
  assert.match(source, /groupAnnouncementsByDate/, 'Announcement history should group entries by date.');
  assert.match(source, /DateDivider/, 'Announcement history should reuse the chat date divider.');
});

test('Dashboard announcements and task conversation share the same date divider', () => {
  const dividerSource = readFileSync('src/components/ui/DateDivider.jsx', 'utf8');
  const taskSource = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');

  assert.match(dividerSource, /weekday: 'long'/, 'The divider should include the weekday like task conversation.');
  assert.match(dividerSource, /tracking-widest/, 'The divider should preserve the established visual treatment.');
  assert.match(taskSource, /DateDivider/, 'Task conversation should consume the shared divider component.');
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
