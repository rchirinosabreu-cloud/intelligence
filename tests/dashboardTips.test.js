import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLATFORM_TIPS, bogotaDayKey, pickDashboardTip } from '../src/lib/dashboardTips.js';

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

test('the dashboard renders the tip inside the personal reminders column and aligns every row', () => {
  const dashboard = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');
  const tipWidget = readFileSync('src/components/modules/dashboard/DashboardTip.jsx', 'utf8');

  assert.match(dashboard, /<DashboardTip/);
  assert.ok(dashboard.indexOf('<DashboardTip') < dashboard.indexOf('<DashboardCrmAttention'), 'the tip opens the reminders column');
  assert.match(dashboard, /pickDashboardTip|dailyTip/, 'the tip comes from the tested selector');
  assert.match(tipWidget, /pickDashboardTip\(/);
  assert.match(tipWidget, /localStorage/, 'a dismissed tip stays hidden for the day on this device');
  assert.match(tipWidget, /aria-label="Ocultar por hoy"/);
  assert.match(tipWidget, /brain-glass/);
  assert.match(dashboard, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_minmax\(300px,0\.85fr\)\]/, 'one three-column grid for the whole dashboard body');
  assert.match(dashboard, /items-stretch/, 'rows stretch so every widget in a row shares the same bottom edge');
  assert.doesNotMatch(dashboard, /xl:items-start|items-start/, 'no row is allowed to leave a widget shorter than its neighbours');
});
