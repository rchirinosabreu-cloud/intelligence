// Real components, isolated API, no production database.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createDashboardPreview } from '../../scripts/preview-dashboard.js';

const output = process.env.SCREENSHOT_DIR || 'output/recognition-panel';
await mkdir(output, { recursive: true });
const preview = await createDashboardPreview({ port: 3261 });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultNavigationTimeout(90000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const panel = page.locator('[data-league-panel]');
const tab = name => panel.getByRole('tab', { name, exact: true });
const shot = async name => {
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.waitForTimeout(250);
  await panel.screenshot({ path: path.join(output, `${name}.png`) });
};
try {
  await page.goto(`${preview.origin}/`);
  const dock = page.locator('[data-league-dock]');
  await dock.waitFor();
  await page.waitForTimeout(300);
  const hiddenDock = await dock.boundingBox();
  assert.ok(Math.abs(hiddenDock.x + hiddenDock.width / 2 - 1440) < 2, 'half of the trophy tab stays outside the viewport');
  await page.screenshot({ path: path.join(output, 'copa-pestana-claro.png'), clip: { x: 1320, y: 420, width: 120, height: 160 } });
  await dock.hover({ position: { x: 5, y: 20 } });
  await page.waitForTimeout(350);
  assert.ok(Math.abs((await dock.boundingBox()).x + hiddenDock.width - 1440) < 2, 'hover reveals the whole tab');
  await dock.click();
  await tab('Mi mes').waitFor({ timeout: 10000 });
  assert.equal(await tab('Mi mes').getAttribute('aria-selected'), 'true');
  assert.match(await panel.locator('[data-race-panel-score]').innerText(), /100\s*puntos/);
  // La semana arranca en cero cada lunes y convive con el mes (Rodny, 9 de noviembre de 2026).
  assert.match(await panel.locator('[data-race-week]').innerText(), /Esta semana[\s\S]*del 2 al 8 de noviembre[\s\S]*100\s*pts[\s\S]*puesto 1/);
  assert.equal(await panel.locator('[data-race-track]').count(), 0);
  const avatar = panel.locator('[data-race-hero] [data-runner-avatar="pixel"]');
  await avatar.waitFor();
  assert.match(await avatar.locator('img').getAttribute('src'), /assets\/team-pixel\/poses\/rodny/);
  const firstPose = await avatar.getAttribute('data-avatar-pose');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-league-panel] img')].every(img => img.complete && img.naturalWidth > 0));
  assert.ok((await panel.boundingBox()).width <= 400);
  assert.equal(await page.locator('[data-dashboard-league]').count(), 0);
  assert.ok(await page.getByRole('heading', { name: 'Anuncios' }).isVisible());
  await shot('mi-mes-claro');
  assert.equal(await avatar.evaluate(el => getComputedStyle(el).animationDuration), '4s');
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  await dock.click();
  await avatar.waitFor();
  assert.notEqual(await avatar.getAttribute('data-avatar-pose'), firstPose);
  await shot('pose-al-reabrir');
  await tab('Logros').click();
  await panel.locator('[data-recognition-collection]').waitFor();
  assert.equal(await panel.locator('[data-recognition-badge]').count(), 6);
  assert.equal(await panel.locator('[data-recognition-badge="FIRST_TASK"]').getAttribute('data-earned'), 'true');
  assert.equal(await panel.locator('[data-recognition-badge="WEEKLY_FIFTY"]').getAttribute('data-earned'), 'false');
  assert.equal(await panel.locator('[data-recognition-history] li').count(), 4);
  await shot('logros-claro');
  await tab('Equipo').click();
  assert.equal(await panel.locator('[data-league-member]').count(), 13);
  const weekRanking = panel.locator('[data-race-week-ranking]');
  assert.equal(await weekRanking.locator('[data-league-week-member]').count(), 13, 'everyone with weekly points is in the weekly ranking');
  assert.match(await weekRanking.innerText(), /Esta semana[\s\S]*Arranca en cero cada lunes/);
  assert.match(await panel.locator('[data-race-last-week]').innerText(), /Melissa ganó la semana pasada con 60 puntos/);
  const weekBox = await weekRanking.boundingBox(), monthBox = await panel.locator('[data-race-podium]').boundingBox();
  assert.ok(weekBox.y < monthBox.y, 'the week comes before the month');
  // El podio de la semana va primero y la clasificación en tarjetas de tres por fila (Rodny, 9 de noviembre de 2026).
  const weekPodium = weekRanking.locator('[data-race-week-podium]');
  assert.ok((await weekPodium.boundingBox()).y < (await weekRanking.locator('[data-league-week-member]').first().boundingBox()).y, 'the week podium comes before the weekly list');
  assert.deepEqual(await weekPodium.locator('[data-podium-rank]').evaluateAll(nodes => nodes.map(n => n.dataset.podiumRank)), ['2', '1', '3']);
  assert.equal(await weekPodium.locator('[data-podium-member]').count(), 4, 'a tie for third shows both people in the same step');
  const weekPodiumBox = await weekPodium.boundingBox();
  assert.ok(weekPodiumBox.height < 260, `the week podium stays compact even with a tie (${Math.round(weekPodiumBox.height)}px)`);
  assert.match(await weekPodium.innerText(), /Podio de la semana[\s\S]*Puesto compartido/);
  for (const attribute of ['data-league-week-member', 'data-league-member']) {
    const tops = await panel.locator(`[${attribute}]`).evaluateAll(nodes => nodes.slice(0, 4).map(node => node.getBoundingClientRect().top));
    assert.ok(tops.slice(0, 3).every(top => Math.abs(top - tops[0]) < 1) && tops[3] > tops[0], `${attribute} lists three people per row`);
  }
  await panel.getByText('5 puntos para…', { exact: true }).waitFor();
  assert.match(await panel.locator('[data-race-kudos]').innerText(), /Cada semana podrás regalar cinco puntos/);
  assert.equal(await panel.locator('[data-league-member] [data-runner-avatar="pixel"]').count(), 13);
  assert.match(await panel.locator('[data-league-member="mariceth"]').innerText(), /Mariceth/);
  await shot('equipo-claro');
  await panel.locator('[data-race-kudos-open]').click();
  await panel.locator('input[name="kudos-to"][value="helen"]').check();
  await panel.getByPlaceholder('Una línea: por qué').fill('Gracias por ayudarme con la entrega.');
  const [request] = await Promise.all([
    page.waitForRequest(req => req.url().endsWith('/api/league/kudos') && req.method() === 'POST'),
    panel.getByRole('button', { name: 'Regalar', exact: true }).click(),
  ]);
  assert.deepEqual(request.postDataJSON(), { memberId: 'helen', note: 'Gracias por ayudarme con la entrega.' });
  await panel.locator('[data-race-kudos-given]').waitFor();
  await tab('Mi mes').click();
  await tab('Equipo').click();
  assert.match(await panel.locator('[data-race-kudos-given]').innerText(), /esta semana.*Helen/);
  await panel.locator('[data-race-kudos]').screenshot({ path: path.join(output, 'regalo-mensual.png') });
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await dock.evaluate(el => el === document.activeElement), true, 'closing returns focus to the dock');

  await page.goto(`${preview.origin}/?carrera&dark`);
  await tab('Mi mes').waitFor();
  await shot('mi-mes-oscuro');
  await tab('Mi mes').focus();
  await page.keyboard.press('ArrowRight');
  await panel.getByRole('tab', { name: 'Logros', selected: true }).waitFor();
  assert.equal(await tab('Logros').getAttribute('aria-selected'), 'true');
  await shot('logros-oscuro');
  await tab('Equipo').click();
  await shot('equipo-oscuro');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await panel.locator('[data-runner-avatar]').first().evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.keyboard.press('Escape');
  await dock.evaluate(el => el.blur());
  await page.mouse.move(10, 10);
  const reducedDock = await dock.boundingBox();
  assert.ok(Math.abs(reducedDock.x + reducedDock.width / 2 - 1440) < 2, 'reduced motion preserves the half-hidden position');
  assert.equal(await dock.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.screenshot({ path: path.join(output, 'copa-pestana-oscuro.png'), clip: { x: 1320, y: 420, width: 120, height: 160 } });
  await page.keyboard.press('Tab');
  await dock.focus();
  assert.ok(Math.abs((await dock.boundingBox()).x + reducedDock.width - 1440) < 2, 'keyboard focus reveals the tab');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(preview.origin);
  await dock.waitFor();
  await page.mouse.move(10, 10);
  const mobileDock = await dock.boundingBox();
  assert.ok(Math.abs(mobileDock.x + mobileDock.width / 2 - 390) < 2);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.goto(`${preview.origin}/?carrera`);
  await tab('Mi mes').waitFor();
  await shot('mi-mes-movil');
  const box = await panel.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  for (const name of ['Mi mes', 'Logros', 'Equipo']) {
    await tab(name).click();
    assert.equal(await panel.evaluate(el => el.scrollWidth <= el.clientWidth), true);
  }
  await shot('equipo-movil');

  await page.route('**/api/league/recognitions', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"No pudimos cargar tus logros."}' }));
  await page.goto(`${preview.origin}/?carrera`);
  await tab('Logros').click();
  await panel.getByText('No pudimos cargar tus logros.').waitFor();
  assert.equal(await panel.locator('[data-recognition-badge]').count(), 0, 'failed history is not an empty collection');
  await shot('logros-error');
  await page.unroute('**/api/league/recognitions');
  await panel.getByRole('button', { name: 'Reintentar logros' }).click();
  await panel.locator('[data-recognition-collection]').waitFor();

  await page.route('**/api/league/recognitions', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ month: '2026-11', total: 0, counts: {}, recent: [], hasMore: false }) }));
  await page.goto(`${preview.origin}/?carrera`);
  await tab('Logros').click();
  await panel.getByText('Tu colección de noviembre está por comenzar.').waitFor();
  assert.equal(await panel.locator('[data-earned="true"]').count(), 0);
  await page.route('**/api/league', async route => {
    const response = await route.fetch();
    const league = await response.json();
    league.score = 0; league.position = null; league.podium = []; league.nextStep = null;
    league.scoreBreakdown = { confirmed: 0, provisional: 0 };
    league.startsAt = '2026-11-03T13:00:00Z';
    league.streak = { days: 0 }; league.kudos = { score: 0, received: [], givenThisWeek: null, weeklyBudget: 5, weekKey: '2026-W45' };
    league.race.lanes = league.race.lanes.map(person => ({ ...person, score: 0, scoreBreakdown: league.scoreBreakdown }));
    league.week = { ...league.week, score: 0, position: null, podium: [], lanes: league.week.lanes.map(person => ({ ...person, score: 0 })), lastWeek: { ...league.week.lastWeek, leaders: [] } };
    league.today = { day: '2026-11-03', habits: {}, extras: {}, earned: 0, possible: 0, points: 0, isProvisional: true, isConfirmed: false };
    await route.fulfill({ response, json: league });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${preview.origin}/?carrera`);
  await panel.getByText('Tu mes está comenzando', { exact: true }).waitFor();
  assert.match(await panel.locator('[data-race-panel-score]').innerText(), /^0\s*puntos/);
  await shot('inicio-cero');
  await panel.getByText('Tus hábitos de hoy', { exact: true }).click();
  for (const description of [
    'Registraste tu tiempo correctamente, sin sesiones olvidadas.',
    'Terminaste pendientes antes de la fecha de entrega.',
    'Las tareas que has creado tienen un comentario o un archivo que da mejor contexto.',
    'Nadie te devolvió un pendiente',
    'Dejaste registro de tu trabajo en la plataforma: un movimiento, una gestión, una pieza, una lectura de pauta, una jornada o una tarea con reloj.',
    'Fuiste el primero en ingresar a la plataforma desde las 8:00 am',
    'Fuiste de los dos primeros en ingresar a la reunión semanal',
  ]) assert.ok(await panel.getByText(description, { exact: true }).isVisible());
  await shot('habitos-corregidos');
  await tab('Equipo').click();
  assert.equal(await panel.locator('[data-race-podium]').count(), 0);
  assert.equal(await panel.locator('[data-race-week-podium]').count(), 0, 'a week at zero has no podium');
  assert.equal(await panel.locator('[data-league-member]').count(), 13);
  assert.equal(await panel.locator('[data-league-week-member]').count(), 0, 'a week at zero lists nobody');
  assert.match(await panel.locator('[data-race-week-ranking]').innerText(), /La semana está comenzando/);
  assert.equal(await panel.locator('[data-race-last-week]').count(), 0);
  for (const member of await panel.locator('[data-league-member]').all()) assert.match(await member.innerText(), /0\s*pts/);
  await shot('equipo-cero');
  await page.unroute('**/api/league');
  await page.unroute('**/api/league/recognitions');
  await page.goto(`${preview.origin}/?liga=no`);
  await page.getByRole('heading', { name: 'Anuncios' }).waitFor();
  await page.waitForTimeout(600);
  assert.equal(await dock.count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, output, simulatedApi: true, realComponents: true }));
} catch (error) {
  console.error({ pageErrors: errors, body: (await page.locator('body').innerText()).slice(0, 2500) });
  await page.screenshot({ path: path.join(output, 'failure.png') });
  throw error;
} finally { await browser.close(); await preview.close(); }
