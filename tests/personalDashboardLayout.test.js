import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the dashboard keeps announcements, achievements, upcoming work and meetings in the agreed order', async () => {
  const source = await read('src/components/modules/Dashboard.jsx');

  const announcements = source.indexOf('<DashboardAnnouncements');
  const achievements = source.indexOf('Logros recientes');
  const crm = source.indexOf('<DashboardCrmAttention');
  const upcoming = source.indexOf('<DashboardUpcomingTasks');
  const meetings = source.indexOf('<DashboardMeetings');

  assert.ok(announcements >= 0, 'the dashboard must render announcements');
  assert.ok(achievements >= 0, 'the dashboard must render recent achievements');
  assert.ok(crm >= 0, 'the dashboard must render the personal crm attention block');
  assert.ok(upcoming >= 0 && meetings >= 0, 'the right column must render upcoming tasks and cited meetings');
  assert.ok(
    announcements < achievements && achievements < crm && crm < upcoming && upcoming < meetings,
    'row 1: announcements (two columns) beside achievements; row 2: personal reminders, upcoming work, meetings'
  );
  assert.match(source, /!hasPersonalReminders && 'xl:col-span-2'/, 'upcoming work takes two columns when there are no personal reminders to sit beside');
  assert.match(source, /xl:col-span-3/, 'management tools span the full width below');
  assert.doesNotMatch(source, /Radar de Foco/, 'the focus radar was removed from the dashboard by decision of 18 September 2026');
  assert.doesNotMatch(source, /Reto de la semana|weeklyHabit/, 'the weekly challenge was removed from the dashboard');
  assert.doesNotMatch(source, /focusCards/, 'focus cards are no longer rendered');
});

test('announcements and recent achievements share the same fixed-height dashboard surface', async () => {
  const [dashboardSource, announcementsSource] = await Promise.all([
    read('src/components/modules/Dashboard.jsx'),
    read('src/components/modules/DashboardAnnouncements.jsx')
  ]);

  assert.match(
    dashboardSource,
    /const topDashboardPanelClass = cn\(dashboardPanelClass, 'h-\[470px\] max-h-\[470px\]'\)/,
    'the top dashboard row must define one shared height contract'
  );
  assert.equal(
    (dashboardSource.match(/topDashboardPanelClass/g) || []).length,
    3,
    'the shared height contract must be declared once and applied to announcements and the original achievements widget'
  );
  assert.doesNotMatch(dashboardSource, /RecognitionFeed/, 'recognitions must not replace the original completed-task feed');
  assert.match(dashboardSource, /<TaskRecognitionLabels task=\{task\}/, 'recognition titles complement each task');
  assert.match(
    announcementsSource,
    /className="flex-1[^"\n]*overflow-y-auto[^"\n]*min-h-0/,
    'announcements must scroll internally instead of making its widget taller than achievements'
  );
});

test('upcoming tasks are grouped by Bogotá day and meetings sit below them with the person cited', async () => {
  const [upcoming, meetings] = await Promise.all([
    read('src/components/modules/dashboard/DashboardUpcomingTasks.jsx'),
    read('src/components/modules/dashboard/DashboardMeetings.jsx')
  ]);

  assert.match(upcoming, /America\/Bogota/, 'day grouping follows the Bogotá calendar');
  assert.match(upcoming, /Próximos pendientes/);
  assert.match(upcoming, /Hoy|Mañana/, 'relative day labels');
  assert.match(meetings, /Reuniones/);
  assert.match(meetings, /meeting\.meetingLink/, 'a Meet link opens the call');
  assert.match(meetings, /responseStatus/, 'the invitation answer of the person is visible');
  assert.match(meetings, /Sin reuniones/, 'an empty state explains there is nothing scheduled');
  assert.doesNotMatch(meetings, /api\/calendar\/upcoming/, 'never the shared agency calendar: only events where the person is cited');
});
