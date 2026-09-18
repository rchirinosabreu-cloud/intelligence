import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the dashboard places reminders beside announcements and achievements beside upcoming work and meetings', async () => {
  const source = await read('src/components/modules/Dashboard.jsx');

  const announcements = source.indexOf('<DashboardAnnouncements');
  const tip = source.indexOf('<DashboardTip');
  const crm = source.indexOf('<DashboardCrmAttention');
  const achievementsRow2 = source.lastIndexOf('<AchievementsPanel');
  const upcoming = source.indexOf('<DashboardUpcomingTasks');
  const meetings = source.indexOf('<DashboardMeetings');

  assert.ok(announcements >= 0, 'the dashboard must render announcements');
  assert.ok(tip >= 0 && crm >= 0, 'the dashboard must render the daily tip and the personal crm attention block');
  assert.equal((source.match(/<AchievementsPanel/g) || []).length, 2, 'achievements render beside announcements only when there are no reminders, otherwise on the second row');
  assert.ok(
    announcements < tip && tip < crm && crm < achievementsRow2 && achievementsRow2 < upcoming && upcoming < meetings,
    'row 1: announcements (two columns) beside the reminders column; row 2: achievements, upcoming work, meetings'
  );
  assert.match(source, /!hasPersonalReminders && 'xl:col-span-2'/, 'upcoming work takes two columns when achievements sit beside announcements instead');
  assert.match(source, /xl:col-span-3/, 'management tools span the full width below');
  assert.doesNotMatch(source, /Radar de Foco/, 'the focus radar was removed from the dashboard by decision of 18 September 2026');
  assert.doesNotMatch(source, /Reto de la semana|weeklyHabit/, 'the weekly challenge was removed from the dashboard');
  assert.doesNotMatch(source, /focusCards/, 'focus cards are no longer rendered');
});

test('announcements and the column beside them share the same fixed-height dashboard surface', async () => {
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
    4,
    'declared once and applied to announcements, to the reminders column and to the achievements fallback beside announcements'
  );
  assert.doesNotMatch(dashboardSource, /RecognitionFeed/, 'recognitions must not replace the original completed-task feed');
  assert.match(dashboardSource, /<TaskRecognitionLabels task=\{task\}/, 'recognition titles complement each task');
  assert.match(
    announcementsSource,
    /className="flex-1[^"\n]*overflow-y-auto[^"\n]*min-h-0/,
    'announcements must scroll internally instead of making its widget taller than achievements'
  );
});

test('widgets never grow wider than their column: long titles truncate instead of overflowing', async () => {
  const files = [
    'src/components/modules/dashboard/DashboardUpcomingTasks.jsx',
    'src/components/modules/dashboard/DashboardMeetings.jsx',
    'src/components/modules/dashboard/DashboardCrmAttention.jsx',
    'src/components/modules/dashboard/DashboardTip.jsx'
  ];
  for (const file of files) {
    const source = await read(file);
    assert.match(source, /<section className=\{cn\('brain-glass flex min-w-0[^']*overflow-hidden/, `${file}: the panel can shrink and clips its content`);
  }
  const upcoming = await read(files[0]);
  assert.match(upcoming, /<a[\s\S]*?className="flex min-w-0 items-start/, 'rows can shrink so their titles truncate');
  assert.match(upcoming, /title=\{task\.title\}/, 'the full title stays available on hover');
});

test('upcoming tasks are grouped by Bogotá day and meetings sit beside them with the person cited', async () => {
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
