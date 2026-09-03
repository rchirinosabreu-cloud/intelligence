import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('announcements and focus radar occupy each other previous dashboard positions for every user', async () => {
  const source = await readFile(
    new URL('../src/components/modules/Dashboard.jsx', import.meta.url),
    'utf8'
  );

  const announcements = source.indexOf('<DashboardAnnouncements');
  const achievements = source.indexOf('Logros recientes');
  const focusRadar = source.indexOf('Radar de Foco');
  const upcoming = source.indexOf('Próximos pendientes');

  assert.ok(announcements >= 0, 'the dashboard must render announcements');
  assert.ok(focusRadar >= 0, 'the dashboard must render the focus radar');
  assert.ok(
    announcements < achievements && achievements < focusRadar && focusRadar < upcoming,
    'announcements must replace the old radar position and radar must replace the old announcements position'
  );
});

test('announcements and recent achievements share the same fixed-height dashboard surface', async () => {
  const [dashboardSource, announcementsSource] = await Promise.all([
    readFile(new URL('../src/components/modules/Dashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/modules/DashboardAnnouncements.jsx', import.meta.url), 'utf8')
  ]);

  assert.match(
    dashboardSource,
    /const topDashboardPanelClass = cn\(dashboardPanelClass, 'h-\[470px\] max-h-\[470px\]'\)/,
    'the top dashboard row must define one shared height contract'
  );
  assert.equal(
    (dashboardSource.match(/topDashboardPanelClass/g) || []).length,
    3,
    'the shared height contract must be declared once and applied to both widgets'
  );
  assert.match(
    announcementsSource,
    /className="flex-1[^"\n]*overflow-y-auto[^"\n]*min-h-0/,
    'announcements must scroll internally instead of making its widget taller than achievements'
  );
});
