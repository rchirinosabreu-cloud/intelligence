// Real panel and avatars, simulated API; no production data or writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createDashboardPreview } from '../../scripts/preview-dashboard.js';
import { leagueDemoPayload } from '../fixtures/leaguePreviewData.js';

const output = 'output/recognition-panel';
await mkdir(output, { recursive: true });
const preview = await createDashboardPreview({ port: 3262 });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let closed = false;
let standings = 'tied';
await page.route('**/api/league', async route => {
  const data = leagueDemoPayload();
  data.score = 10;
  data.position = { rank: 3, of: 13 };
  data.scoreBreakdown = { confirmed: closed ? 10 : 0, provisional: closed ? 0 : 10 };
  data.today.isProvisional = !closed;
  data.today.isConfirmed = closed;
  data.today.points = 10;
  data.race.lanes = data.race.lanes.map((p, i) => ({ ...p, score: i < 2 ? 15 : 10,
    scoreBreakdown: { confirmed: closed ? (i < 2 ? 15 : 10) : 0, provisional: closed ? 0 : (i < 2 ? 15 : 10) } }));
  if (standings !== 'tied') data.race.lanes = data.race.lanes.map((p, i) => {
    const score = standings === 'zero' ? 0 : Math.max(0, 30 - i * 10);
    return { ...p, score, scoreBreakdown: { confirmed: closed ? score : 0, provisional: closed ? 0 : score } };
  });
  await route.fulfill({ json: data });
});
const panel = page.locator('[data-league-panel]');
try {
  await page.goto(`${preview.origin}/?carrera`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await panel.locator('[data-race-panel-score]').waitFor();
  assert.equal(await panel.locator('[data-league-score-breakdown]').count(), 1, 'confirmed and provisional points must be visible separately');
  assert.match(await panel.locator('[data-league-score-breakdown]').innerText(), /0 confirmados[\s\S]*10 provisionales de hoy/);
  assert.match(await panel.innerText(), /pueden subir o bajar/i);
  await panel.screenshot({ path: `${output}/puntos-provisionales-claro.png` });
  await panel.getByRole('tab', { name: 'Equipo', exact: true }).click();
  const podium = panel.locator('[data-race-podium]');
  await podium.waitFor();
  assert.equal(await podium.locator('[data-podium-member]').count(), 13, 'no tied participant is cut off');
  assert.deepEqual(await podium.locator('[data-podium-rank]').evaluateAll(nodes => nodes.map(n => n.dataset.podiumRank)), ['1', '3']);
  assert.match(await podium.innerText(), /Puesto compartido/);
  await panel.screenshot({ path: `${output}/podio-empates-claro.png` });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  assert.equal(await panel.evaluate(el => el.scrollWidth > el.clientWidth), false);
  await panel.screenshot({ path: `${output}/podio-empates-movil-oscuro.png` });
  closed = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await panel.locator('[data-league-score-breakdown]').waitFor();
  assert.match(await panel.locator('[data-league-score-breakdown]').innerText(), /10 confirmados[\s\S]*0 provisionales de hoy/);
  assert.match(await panel.innerText(), /El cierre de hoy ya está confirmado/);
  await panel.getByText('Tus hábitos de hoy', { exact: true }).click();
  assert.match(await panel.innerText(), /Cierre confirmado/);
  await panel.screenshot({ path: `${output}/puntos-confirmados-movil.png` });
  standings = 'unique';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await panel.getByRole('tab', { name: 'Equipo', exact: true }).click();
  await podium.waitFor();
  assert.equal(await podium.locator('[data-podium-member]').count(), 3);
  assert.deepEqual(await podium.locator('[data-podium-rank]').evaluateAll(nodes => nodes.map(n => n.dataset.podiumRank)), ['2', '1', '3']);
  await panel.screenshot({ path: `${output}/podio-sin-empates-movil.png` });
  standings = 'zero';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await panel.getByRole('tab', { name: 'Equipo', exact: true }).click();
  assert.equal(await podium.count(), 0, 'zero scores must not manufacture a podium');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, simulatedApi: true, output }));
} finally { await browser.close(); await preview.close(); }
