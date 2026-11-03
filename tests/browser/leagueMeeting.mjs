import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createDashboardPreview } from '../../scripts/preview-dashboard.js';
const preview = await createDashboardPreview({ port: 3263 });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultNavigationTimeout(90000); page.setDefaultTimeout(15000);
let canManage = false, entry = null;
await page.route('**/api/league', async route => {
  const response = await route.fetch(), league = await response.json();
  league.score = 10; league.position = { rank: 1, of: 13 };
  league.race.lanes = league.race.lanes.map(lane => ({ ...lane, score: 10 }));
  league.meetings = { canManage, minDate: '2026-11-03', maxDate: '2026-11-04', entries: entry ? [entry] : [] };
  await route.fulfill({ response, json: league });
});
await page.route('**/api/league/meetings', async route => {
  assert.deepEqual(route.request().postDataJSON(), { memberId: 'helen', day: '2026-11-03' });
  entry = { memberId: 'helen', name: 'Helen', date: '2026-11-03', weekKey: '2026-W45', points: 10 };
  await route.fulfill({ json: { id: 'manual-meeting', name: 'Helen', points: 10 } });
});
try {
  await page.goto(`${preview.origin}/?carrera`);
  const panel = page.locator('[data-league-panel]');
  await panel.locator('[data-race-position]').waitFor();
  assert.equal(await panel.locator('[data-race-position]').innerText(), 'Vas en el puesto 1');
  assert.equal(await panel.locator('[data-race-position-message]').innerText(), '¡Arriba se siente bien!');
  await panel.getByText('Cómo se cuentan los puntos', { exact: true }).click();
  const rules = panel.locator('details').filter({ hasText: 'Cómo se cuentan los puntos' });
  assert.equal(await rules.locator('li').count(), 5);
  assert.equal(await rules.locator('ul').evaluate(el => getComputedStyle(el).listStyleType), 'disc');
  assert.deepEqual(await rules.locator('li').allTextContents(), [
    'Cada hábito cumplido en un día te suma 5 puntos.',
    'La primera actividad registrada desde las 8:00 am suma 5 puntos.',
    'Si eres el primero en ingresar a la reunión de tráfico, sumarás 10 puntos.',
    'Cada semana tendrás 5 puntos para regalar a otra persona como agradecimiento o reconocimiento.',
    'Las insignias de logros también te sumarán 5 puntos.'
  ]);
  await rules.screenshot({ path: 'output/recognition-panel/reglas-definitivas.png' });
  await panel.getByRole('tab', { name: 'Equipo', exact: true }).click();
  assert.equal(await panel.locator('[data-race-podium]').count(), 0, 'no invented first/second/third podium when everybody is tied');
  const places = await panel.locator('[data-league-member] > span:first-child').allTextContents();
  assert.ok(places.every(place => place === '1'));
  assert.equal(await page.getByRole('button', { name: 'Registrar primero en tráfico' }).count(), 0);
  canManage = true;
  await page.reload();
  await panel.getByRole('tab', { name: 'Equipo', exact: true }).click();
  await panel.getByRole('button', { name: 'Registrar primero en tráfico' }).click();
  await panel.getByLabel('Fecha de la reunión').fill('03/11/2026');
  await panel.getByLabel('Fecha de la reunión').press('Tab');
  await panel.getByRole('combobox', { name: 'Quién llegó primero' }).click();
  await page.getByRole('option', { name: 'Helen', exact: true }).click();
  await panel.locator('[data-league-meetings]').screenshot({ path: 'output/recognition-panel/trafico-admin.png' });
  await panel.getByRole('button', { name: 'Asignar 10 puntos' }).click();
  await panel.locator('[data-league-meetings] li').waitFor();
  assert.match(await panel.locator('[data-league-meetings] li').innerText(), /Helen.*nov.*\+10/s);
  await panel.locator('[data-league-meetings]').screenshot({ path: 'output/recognition-panel/trafico-registrado.png' });
  console.log(JSON.stringify({ passed: true, simulatedApi: true }));
} finally { await browser.close(); await preview.close(); }
