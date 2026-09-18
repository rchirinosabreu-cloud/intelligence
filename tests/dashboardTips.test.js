import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLATFORM_TIPS, bogotaDayKey, listDashboardReminders, pickDashboardTip } from '../src/lib/dashboardTips.js';

const admin = { id: 'user-rodny', role: 'ADMIN' };
const editor = { id: 'user-helen', role: 'EDITOR', modulePermissions: { dashboard: true, gestion: true } };
const quiet = { stats: { active: 3, dueToday: 1, overdue: 0, returned: 0, completedToday: 0 }, meetings: [], crmAttention: { enabled: false, counts: {}, items: [] } };
const noon = (dayKey) => new Date(`${dayKey}T17:00:00.000Z`);

test('a real situation always produces a reminder, chosen deterministically per person and day', () => {
  const dashboard = { ...quiet, stats: { ...quiet.stats, overdue: 2, returned: 1 } };
  const first = pickDashboardTip({ dashboard, user: admin, now: noon('2026-09-18') });
  const again = pickDashboardTip({ dashboard, user: admin, now: noon('2026-09-18') });
  assert.ok(first, 'overdue and returned work must surface a reminder');
  assert.equal(first.kind, 'reminder');
  assert.ok(['overdue', 'returned'].includes(first.id));
  assert.deepEqual(first, again, 'same person, same day, same reminder');
  assert.equal(first.dayKey, '2026-09-18');

  const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'].map((day) => pickDashboardTip({ dashboard, user: admin, now: noon(day) }).id);
  assert.ok(new Set(week).size === 2, 'both reminders rotate across the days');
});

test('reminders quote the real numbers and the meeting of today', () => {
  const overdue = pickDashboardTip({ dashboard: { ...quiet, stats: { ...quiet.stats, overdue: 1 } }, user: admin, now: noon('2026-09-18') });
  assert.equal(overdue.title, 'Tienes 1 tarea vencida');
  assert.equal(overdue.actionUrl, '/gestion');

  const meeting = pickDashboardTip({
    dashboard: { ...quiet, meetings: [{ id: 'm', title: 'Comité Nutresa', startAt: '2026-09-18T16:00:00.000Z', isToday: true }] },
    user: admin, now: noon('2026-09-18')
  });
  assert.match(meeting.title, /Comité Nutresa/);
  assert.match(meeting.title, /11:00/, 'Bogotá time');
  assert.equal(meeting.actionUrl, '/minutas');

  const crm = pickDashboardTip({ dashboard: { ...quiet, crmAttention: { enabled: true, counts: { overdue: 2, today: 0, red: 0 }, items: [{}, {}] } }, user: admin, now: noon('2026-09-18') });
  assert.equal(crm.id, 'crm-overdue');
  assert.match(crm.title, /2 seguimientos comerciales vencidos/);
});

test('tips respect module permissions and dismissals', () => {
  const crmOnly = { ...quiet, crmAttention: { enabled: true, counts: { overdue: 1, today: 0, red: 0 }, items: [{}] } };
  const forEditor = pickDashboardTip({ dashboard: crmOnly, user: editor, now: noon('2026-09-18') });
  assert.notEqual(forEditor?.id, 'crm-overdue', 'no crm advice without the crm module');

  const dashboard = { ...quiet, stats: { ...quiet.stats, overdue: 1 } };
  const dismissed = pickDashboardTip({ dashboard, user: admin, now: noon('2026-09-18'), dismissedIds: ['overdue'] });
  assert.notEqual(dismissed?.id, 'overdue', 'a dismissed reminder does not come back the same day');
});

test('on quiet days a platform tip appears some days and none on others', () => {
  const days = Array.from({ length: 12 }, (_, index) => `2026-09-${String(10 + index).padStart(2, '0')}`);
  const results = days.map((day) => pickDashboardTip({ dashboard: quiet, user: admin, now: noon(day) }));
  const shown = results.filter(Boolean);
  const empty = results.filter((tip) => tip === null);
  assert.ok(shown.length >= 6 && empty.length >= 3, `shown ${shown.length}, empty ${empty.length}: tips are occasional, not constant`);
  assert.ok(shown.every((tip) => tip.kind === 'tip' && PLATFORM_TIPS.some((candidate) => candidate.id === tip.id)));
  assert.ok(new Set(shown.map((tip) => tip.id)).size >= 3, 'the platform tips rotate');
  for (const tip of PLATFORM_TIPS) {
    assert.ok(tip.title.length <= 60 && tip.body.length <= 220, `${tip.id}: short enough for a card`);
    assert.doesNotMatch(tip.body, /Claude|GPT|Gemini|OpenAI/, 'no vendor names in product copy');
  }
  const editorTips = days.map((day) => pickDashboardTip({ dashboard: quiet, user: editor, now: noon(day) })).filter(Boolean);
  assert.ok(editorTips.every((tip) => !['calendar-sync', 'bria-review', 'crm-light'].includes(tip.id)), 'no tips about modules the person cannot open');
  assert.equal(bogotaDayKey('2026-09-19T03:30:00.000Z'), '2026-09-18', 'day keys follow Bogotá');
});

test('the reminders list gathers every contextual point plus an occasional platform tip', () => {
  const busy = { ...quiet, stats: { ...quiet.stats, overdue: 2, returned: 1, dueToday: 4 }, meetings: [{ id: 'm', title: 'Comité', startAt: '2026-09-18T16:00:00.000Z', isToday: true }] };
  const list = listDashboardReminders({ dashboard: busy, user: admin, now: noon('2026-09-18') });
  const ids = list.map((item) => item.id);
  assert.ok(['overdue', 'returned', 'meeting-today', 'due-today'].every((id) => ids.includes(id)), `all contextual reminders are listed: ${ids.join(', ')}`);
  assert.ok(ids.indexOf('overdue') < ids.indexOf('due-today'), 'urgent reminders come before softer tips');
  assert.equal(list.filter((item) => PLATFORM_TIPS.some((tip) => tip.id === item.id)).length <= 1, true, 'at most one platform tip, at the end');
  assert.ok(list.every((item) => item.dayKey === '2026-09-18'));

  const withoutOverdue = listDashboardReminders({ dashboard: busy, user: admin, now: noon('2026-09-18'), dismissedIds: ['overdue'] });
  assert.ok(!withoutOverdue.some((item) => item.id === 'overdue'), 'a dismissed reminder is skipped for the day');

  const quietDays = ['2026-09-10', '2026-09-11', '2026-09-12'].map((day) => listDashboardReminders({ dashboard: quiet, user: admin, now: noon(day) }).length);
  assert.ok(quietDays.some((count) => count === 0) && quietDays.some((count) => count === 1), 'on quiet days the list is empty or holds one platform tip');
  assert.deepEqual(listDashboardReminders({ dashboard: quiet, user: admin, now: noon('2026-09-10'), includePlatformTip: false }), []);
});

test('the dashboard renders one reminders panel beside announcements, at their height, without effects', () => {
  const dashboard = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');
  const panel = readFileSync('src/components/modules/dashboard/DashboardReminders.jsx', 'utf8');

  assert.match(dashboard, /<DashboardReminders/);
  assert.ok(dashboard.indexOf('<DashboardAnnouncements') < dashboard.indexOf('<DashboardReminders') && dashboard.indexOf('<DashboardReminders') < dashboard.indexOf('<AchievementsPanel'), 'the reminders panel sits beside announcements, above the achievements row');
  assert.match(panel, /listDashboardReminders\(/, 'the panel lists every reminder from the tested selector');
  assert.match(panel, /dashboard\?\.crmAttention/, 'crm opportunities needing attention join the same list');
  assert.match(panel, /\/crm\/oportunidades\//, 'each opportunity opens its record');
  assert.doesNotMatch(panel, /api\/crm/, 'the panel never queries the CRM API on its own');
  assert.match(panel, /trafficLight === 'ROJO'/, 'red opportunities are highlighted');
  assert.match(panel, /text-destructive/, 'red uses the global destructive token');
  assert.match(panel, /Todo al día/, 'an empty state keeps the panel at its height when there is nothing to say');
  assert.match(panel, /localStorage/, 'a dismissed tip stays hidden for the day on this device');
  assert.match(panel, /aria-label="Ocultar por hoy"/);
  // Regression: an effect depending on `new Date()` re-rendered forever and froze the whole platform (18 Sep 2026).
  assert.doesNotMatch(panel, /useEffect/, 'no effects: the widget derives everything from props and a once-per-mount clock');
  assert.match(panel, /useRef\(now \|\| new Date\(\)\)/, 'the clock is fixed once per mount');
  assert.match(panel, /useState\(\(\) => readDismissed\(/, 'dismissals are read lazily in the initial state, never in an effect');
  assert.doesNotMatch(panel, /now = new Date\(\)/, 'no default parameter creating a new Date on every render');
  for (const file of ['src/components/modules/dashboard/DashboardUpcomingTasks.jsx', 'src/components/modules/dashboard/DashboardMeetings.jsx']) {
    const widget = readFileSync(file, 'utf8');
    assert.doesNotMatch(widget, /\(\{[^}]*now = new Date\(\)[^}]*\}\)\s*=>/, `${file}: component props must not default the clock to a new Date per render`);
    assert.match(widget, /useRef\(now \|\| new Date\(\)\)/, `${file}: the clock is fixed once per mount`);
  }
  assert.match(panel, /brain-glass/);
  assert.match(dashboard, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_minmax\(300px,0\.85fr\)\]/, 'one three-column grid for the whole dashboard body');
  assert.match(dashboard, /items-stretch/, 'rows stretch so every widget in a row shares the same bottom edge');
  assert.doesNotMatch(dashboard, /xl:items-start|items-start/, 'no row is allowed to leave a widget shorter than its neighbours');
});
