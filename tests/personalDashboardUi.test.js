import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const strip = (value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '');

test('Dashboard loads own personal dashboard and keeps team selection admin-only', () => {
  const source = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');

  assert.doesNotMatch(source, /currentUser\?\.role !== 'ADMIN'/, 'Dashboard should no longer block non-admin users from their own dashboard.');
  assert.match(source, /\/api\/dashboard\/personal/, 'Dashboard should call the personal dashboard API.');
  assert.match(source, /canViewTeamDashboards/, 'Only admins should be able to view other personal dashboards.');
  assert.match(source, /selectedUserId/, 'Admins should be able to select a team member dashboard.');
});

test('Dashboard greets the person and shows the task summary as brand gradient tiles', () => {
  const source = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');

  assert.match(source, /Hola, \{/, 'The dashboard greets the person by first name.');
  assert.doesNotMatch(source, /Foco del equipo/, 'The old headline is gone.');
  for (const label of ['Activas', 'Para hoy', 'Vencidas', 'Devueltas', 'Logros hoy']) {
    assert.match(source, new RegExp(label), `The task summary keeps the ${label} tile.`);
  }
  assert.match(source, /brain-gradient-primary/, 'Tiles use the official brand gradients.');
  assert.match(source, /brain-gradient-energy/, 'Tiles use more than the cyan gradient.');
  assert.doesNotMatch(source, /(bg|text|border|from|to|via)-(violet|indigo|purple|fuchsia|sky|emerald|amber|rose|orange)-\d/, 'No legacy Tailwind hues: only brand tokens (decision of 18 September 2026).');
  assert.doesNotMatch(source, /surface: '[^']*(yellow|sunrise|spectrum)/, 'No yellow on the summary tiles (Rodny, 18 September 2026).');
  assert.doesNotMatch(source, /#[0-9a-fA-F]{6}\b/, 'No local hexadecimal colors.');
  assert.match(source, /brain-glass/, 'Panels use the approved glass surface.');
  assert.match(source, /brain-ambient/, 'The page carries the soft brand ambient behind the glass.');
});

test('Dashboard presents adoption-oriented sections without the retired widgets', () => {
  const source = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');

  assert.match(strip(source), /Logros recientes/, 'Dashboard should render Logros recientes.');
  assert.match(source, /<DashboardUpcomingTasks/, 'Dashboard should render the upcoming tasks widget.');
  assert.match(strip(readFileSync('src/components/modules/dashboard/DashboardUpcomingTasks.jsx', 'utf8')), /Proximos pendientes/, 'The widget should render Proximos pendientes.');
  assert.doesNotMatch(source, /Tu foco de hoy/i);
  assert.doesNotMatch(source, /Centro de adopci/i);
  assert.doesNotMatch(source, /Mis tareas de hoy/, 'Dashboard should not duplicate the adopted Gestion task module.');
  assert.match(source, /Ver historial completo/, 'Recent achievements should expose the full history.');
  assert.match(source, /CompletedTasksHistoryModal/, 'Recent achievements should use the original full-history modal.');
  assert.match(source, /setShowHistoryModal/, 'Recent achievements should keep the original modal state.');
  assert.doesNotMatch(source, /showAchievementsHistory/);
  assert.doesNotMatch(source, /chill-cat\.png|weeklyHabit|Radar de Foco|expandedFocusCards|getFocusItemUrl/, 'Weekly challenge and focus radar are retired.');
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
  assert.match(source, /selectedMember\?\.isCommunityManager\s*&&/, 'Mis clientes should render only for the selected Community Manager.');
  assert.doesNotMatch(source, />Crear anuncio</, 'Announcement creation should live inside the announcement panel, not a separate widget.');
  assert.ok(
    source.indexOf('<DashboardAnnouncements') < source.indexOf('<DashboardUpcomingTasks'),
    'Announcements should occupy the wide left column before upcoming work on the right.'
  );
});

test('Dashboard announcement panel supports rich, private and historical announcements', () => {
  const source = readFileSync('src/components/modules/DashboardAnnouncements.jsx', 'utf8');

  assert.match(source, /weeklyAnnouncements\.slice\(0, 3\)/, 'The dashboard widget should show at most three current-week announcements.');
  assert.doesNotMatch(source, /max-h-\[\d+px\] overflow-hidden/, 'An announcement is never clipped mid-sentence: the whole text shows and the panel scrolls (Rodny, 19 September 2026).');
  assert.match(source, /Anuncio general/, 'Global announcements should use the requested label.');
  assert.doesNotMatch(source, />Directo</, 'Personal announcements should not expose a label.');
  assert.doesNotMatch(source, /isPersonal\s*\?\s*'bg-zinc-900/, 'Personal announcements should not use a black surface.');
  assert.doesNotMatch(source, /violet-/, 'Personal announcements no longer use the retired violet hue.');
  assert.match(source, /isPersonal[\s\S]*?brand-cyan|brand-cyan[\s\S]*?isPersonal/, 'General announcements are highlighted in brand cyan.');
  assert.doesNotMatch(source, /border-l-4|border-l-\[/, 'No left-only bands: full soft borders (decision of Rodny, 18 September 2026).');
  assert.doesNotMatch(source, /brand-magenta/, 'Announcements no longer use magenta.');
  assert.match(source, /!isPersonal[^\n]*text-base|text-base[^\n]*!isPersonal|isGeneral[^\n]*text-base|text-base[^\n]*isGeneral/, 'General announcements for the whole team read larger than personal ones.');
  assert.match(source, /TeamAvatar/, 'Personal announcements should identify their author with the shared avatar.');
  assert.match(source, /announcement\.author/, 'The announcement author should drive the displayed avatar and identity.');
  assert.match(source, /Ver historial de anuncios/, 'The widget should open the complete announcement history.');
  assert.match(source, /RichTextEditor/, 'Managers should compose formatted announcements with the shared editor.');
  assert.match(source, /RichCommentContent/, 'Announcements should render sanitized rich text.');
  assert.match(source, /insertEmoji/, 'The announcement composer should support emoji insertion.');
  assert.match(source, /canManage/, 'Creation controls should remain restricted to admins and project managers.');
  assert.match(source, /Editar anuncio/);
  assert.match(source, /Eliminar anuncio/);
  assert.match(source, /onUpdate/);
  assert.match(source, /onDelete/);
  assert.doesNotMatch(source, /window\.confirm|\bconfirm\(/, 'Announcement deletion should never use the browser confirmation dialog.');
  assert.match(source, /deleteCandidate/);
  assert.match(source, /DialogContent/);
  assert.match(source, /groupAnnouncementsByDate/);
  assert.match(source, /DateDivider/);
});

test('destructive actions use the Brainstudio rose token consistently', () => {
  const cssSource = readFileSync('src/index.css', 'utf8');
  const announcementSource = readFileSync('src/components/modules/DashboardAnnouncements.jsx', 'utf8');
  const taskSource = readFileSync('src/components/modules/NativeTasks.jsx', 'utf8');

  assert.ok(
    (cssSource.match(/--destructive:\s*346\.84 77\.17% 49\.8%;\s*\/\* #E11D48 \*\//g) || []).length >= 2,
    'Light and dark mode should share the exact #E11D48 destructive token.'
  );
  assert.match(announcementSource, /variant="destructive"/, 'Announcement deletion should consume the shared destructive button style.');
  assert.match(taskSource, /Eliminar Tarea[\s\S]{0,500}variant="destructive"|variant="destructive"[\s\S]{0,500}Eliminar Tarea/, 'Task deletion should consume the same destructive button style.');
});

test('Dashboard announcements and task conversation share the same date divider', () => {
  const dividerSource = readFileSync('src/components/ui/DateDivider.jsx', 'utf8');
  const taskSource = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');

  assert.match(dividerSource, /weekday: 'long'/, 'The divider should include the weekday like task conversation.');
  assert.match(dividerSource, /tracking-widest/, 'The divider should preserve the established visual treatment.');
  assert.match(taskSource, /DateDivider/, 'Task conversation should consume the shared divider component.');
});

test('the personal crm attention is personal, permission-gated and lives inside the reminders panel', () => {
  const reminders = readFileSync('src/components/modules/dashboard/DashboardReminders.jsx', 'utf8');

  assert.match(reminders, /dashboard\?\.crmAttention/, 'The panel reads the payload computed on the server for the dashboard owner.');
  assert.match(reminders, /attention\?\.enabled\) return \[\]/, 'Without crm permission no crm reminders appear.');
  assert.match(reminders, /\/crm\/oportunidades\//, 'Each opportunity opens its record in the CRM.');
  assert.doesNotMatch(reminders, /api\/crm/, 'The dashboard never queries the CRM API on its own.');
  assert.match(reminders, /trafficLight === 'ROJO'/, 'Red opportunities are highlighted.');
  assert.match(reminders, /bg-destructive|text-destructive/, 'Red uses the global destructive token, never a local red.');
});

test('Profile no longer carries the legacy Mi Foco cockpit', () => {
  const profileSource = readFileSync('src/components/modules/Profile.jsx', 'utf8');
  const personalDashboardService = readFileSync('src/services/personalDashboardService.js', 'utf8');

  assert.doesNotMatch(profileSource, /Mi Foco|TAB: MI FOCO|Simulador de Foco Operativo|personal-threats|Motor de Amenazas Individuales/);
  assert.doesNotMatch(profileSource, /isCockpitAllowed|activeSimulationUserId|simulationData|teamMembers|fetchSimulationData|fetchTeam|handleNotify/);
  assert.match(personalDashboardService, /focusCards/, 'The focus-card service stays available for other consumers.');
});
