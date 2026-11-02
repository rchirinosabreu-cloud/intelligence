// La liga de noviembre (27 de octubre, 2 y 3 de noviembre de 2026): recorrido real contra las muestras locales del
// dashboard y de Bria. Nada en el dashboard; la copa asomada al borde derecho, que sale al pasar el cursor; el panel
// «La carrera del mes» acoplado a la derecha sin niveles ni barras, con la pista compacta y sin nombres (el nombre
// al pasar el cursor), hoy con sus extras, el podio y el regalo de la semana, que va a la API; `?carrera`; claro,
// oscuro y celular; y el aviso de las 3 encima de la mascota. Sin base de datos ni producción.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createDashboardPreview } from '../../scripts/preview-dashboard.js';
import { createBriaPreview } from '../../scripts/preview-bria.js';

const output = process.env.SCREENSHOT_DIR || 'output/platform-league'; await mkdir(output, { recursive: true });
const dashboard = await createDashboardPreview({ port: 3261 });
const bria = await createBriaPreview({ port: 3762 });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const shoot = (name, options = {}) => page.screenshot({ path: path.join(output, `${name}.png`), ...options });
const dock = page.locator('[data-league-dock]');
const race = page.locator('[data-league-panel]');
const settle = async () => { await page.waitForFunction(() => document.fonts.status === 'loaded'); await page.waitForTimeout(900); };
const clipOf = async (locator, pad = 8) => { const b = await locator.boundingBox(); return { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 }; };
try {
  await page.goto(`${dashboard.origin}/`);
  await page.getByRole('heading', { name: 'Anuncios' }).waitFor();
  await dock.waitFor();
  await settle();
  // Nada en el dashboard: ni tarjeta ni niveles.
  assert.equal(await page.locator('[data-dashboard-league]').count(), 0, 'no league card in the dashboard');
  assert.doesNotMatch(await page.locator('main').innerText(), /Liga de noviembre|Leyenda|\bPro\b/);
  // La copa, asomada a medias en el borde derecho, a media altura.
  const peek = await dock.boundingBox();
  assert.ok(peek.x + peek.width > 1440 + 20, 'half of the tab is outside the window');
  assert.ok(peek.x < 1440, 'and half of it peeks in');
  assert.ok(Math.abs(peek.y + peek.height / 2 - 500) < 40, 'at mid height');
  await shoot('copa-asomada', { clip: { x: 1440 - 120, y: 420, width: 120, height: 160 } });
  await dock.hover();
  await page.waitForTimeout(400);
  const out = await dock.boundingBox();
  assert.ok(out.x + out.width <= 1440 + 1, 'on hover it comes all the way out');
  await shoot('copa-cursor', { clip: { x: 1440 - 120, y: 420, width: 120, height: 160 } });

  // La carrera: un panel acoplado a la derecha; el dashboard sigue debajo, sin tapar.
  await dock.click();
  await race.waitFor();
  await page.waitForTimeout(900);
  const panel = await race.boundingBox();
  assert.ok(panel.x + panel.width <= 1440 - 8 && panel.width <= 400 && panel.y >= 70, 'docked on the right, not a giant window');
  assert.ok(await page.getByRole('heading', { name: 'Anuncios' }).isVisible(), 'the dashboard stays visible and usable behind it');
  assert.match(await race.locator('[data-race-hero]').innerText(), /Rodny/);
  assert.match(await race.locator('[data-race-panel-score]').innerText(), /70\s*puntos/);
  assert.doesNotMatch(await race.innerText(), /Leyenda|\bPro\b|En ritmo|Arranque|\/ 100|de 100/, 'no levels, no ceiling');
  assert.equal(await race.locator('[data-race-panel-level]').count(), 0);
  assert.match(await race.locator('[data-race-position]').innerText(), /Vas 4\.º de 13/);
  assert.match(await race.locator('[data-race-today-points]').innerText(), /\+15 hoy/);
  // La pista: trece carriles cortos, sin nombres, cada avatar en su puntaje; el nombre solo al pasar el cursor.
  assert.equal(await race.locator('[data-race-lane]').count(), 13, 'thirteen lanes');
  assert.equal(await race.locator('[data-race-lane-self="true"]').count(), 1);
  assert.equal(await race.locator('[data-race-lane] [data-runner-avatar="pixel"]').count(), 13, 'a pixel avatar per lane');
  const trackBox = await race.locator('[data-race-track]').boundingBox();
  assert.ok(trackBox.height < 420, `the track is compact: ${Math.round(trackBox.height)} px for thirteen lanes`);
  const visibleTrackText = await race.locator('[data-race-track]').evaluate((node) => { const clone = node.cloneNode(true); clone.querySelectorAll('[data-race-lane-tip]').forEach((tip) => tip.remove()); return clone.textContent; });
  assert.doesNotMatch(visibleTrackText, /Melissa|Rodny|Helen/, 'no names on the track, only the marks');
  assert.equal(await race.locator('[data-race-lane-tip]').evaluateAll((tips) => tips.filter((tip) => getComputedStyle(tip).opacity !== '0').length), 0, 'every name is hidden until hover');
  const melissa = await race.locator('[data-race-runner="melissa"]').boundingBox();
  const david = await race.locator('[data-race-runner="david"]').boundingBox();
  assert.ok(melissa.x > david.x + 150, 'the position is the score: 95 is well to the right of 20');
  assert.equal(await race.locator('[data-race-runner="melissa"] [data-race-lane-tip]').evaluate((node) => getComputedStyle(node).opacity), '0', 'hidden until hover');
  await race.locator('[data-race-runner="melissa"]').hover();
  await page.waitForTimeout(350);
  assert.equal(await race.locator('[data-race-runner="melissa"] [data-race-lane-tip]').evaluate((node) => getComputedStyle(node).opacity), '1', 'the name appears on hover');
  assert.match(await race.locator('[data-race-runner="melissa"] [data-race-lane-tip]').innerText(), /Melissa · 95 puntos/);
  // El personaje se mueve siempre: la animación en píxel está activa en cada avatar.
  const animation = await race.locator('[data-race-runner="melissa"] [data-runner-avatar]').evaluate((node) => getComputedStyle(node).animationName);
  assert.equal(animation, 'league-pixel-idle');
  await shoot('carrera-claro');
  await shoot('carrera-panel-claro', { clip: await clipOf(race) });
  // Hoy: cinco hábitos y los dos extras, con sus puntos.
  assert.match(await race.locator('[data-race-today]').innerText(), /3 de 4 hábitos · 15 puntos/);
  assert.equal(await race.locator('[data-race-today-habit]').count(), 5);
  assert.equal(await race.locator('[data-race-today-extra]').count(), 2);
  assert.equal(await race.locator('[data-race-today-extra="PRIMERO_EN_ABRIR"]').getAttribute('data-race-today-state'), 'missed');
  assert.equal(await race.locator('[data-race-today-extra="PRIMERO_EN_REUNION"]').getAttribute('data-race-today-state'), 'idle', 'no source yet: not in play');
  assert.match(await race.locator('[data-race-podium]').innerText(), /Melissa[\s\S]*95 pts/);
  // Regalar los 10 puntos de la semana: a una sola persona, con una línea; la muestra responde como el servidor.
  await race.locator('[data-race-kudos-open]').scrollIntoViewIfNeeded();
  await race.locator('[data-race-kudos-open]').click();
  await race.locator('[data-race-kudos-form]').waitFor();
  await race.locator('input[name="kudos-to"][value="helen"]').check({ force: true });
  await race.getByPlaceholder('Una línea: por qué').fill('Resolvió el carrusel de Alpina en una tarde.');
  await race.locator('[data-race-kudos-form]').scrollIntoViewIfNeeded();
  await shoot('carrera-regalar', { clip: await clipOf(race) });
  const [kudosRequest] = await Promise.all([
    page.waitForRequest((request) => request.url().endsWith('/api/league/kudos') && request.method() === 'POST'),
    race.getByRole('button', { name: 'Regalar', exact: true }).click()
  ]);
  assert.deepEqual(JSON.parse(kudosRequest.postData()), { memberId: 'helen', note: 'Resolvió el carrusel de Alpina en una tarde.' }, 'the gift goes to the API');
  await race.locator('[data-race-kudos-given]').waitFor();
  assert.match(await race.locator('[data-race-kudos-given]').innerText(), /le diste tus 10 puntos a Helen/);
  await page.keyboard.press('Escape');
  await race.waitFor({ state: 'hidden' });

  // `?carrera` abre el panel de una vez (es a donde mandan los avisos de Bria), también en oscuro.
  await page.goto(`${dashboard.origin}/?carrera&dark`);
  await race.waitFor();
  await settle();
  await shoot('carrera-oscuro');
  await shoot('carrera-panel-oscuro', { clip: await clipOf(race) });
  await page.keyboard.press('Escape');
  await race.waitFor({ state: 'hidden' });
  await shoot('copa-oscuro', { clip: { x: 1440 - 120, y: 420, width: 120, height: 160 } });

  // Primeros días del mes: quien ganó el mes anterior, en el panel.
  await page.goto(`${dashboard.origin}/?ganador&carrera`);
  await race.locator('[data-race-winner]').waitFor();
  await settle();
  assert.match(await race.locator('[data-race-winner]').innerText(), /Melissa ganó la liga de octubre con 610 puntos/);
  await shoot('carrera-ganador', { clip: await clipOf(race) });
  // Sin ficha en Equipo (404), no hay copa.
  await page.goto(`${dashboard.origin}/?liga=no`);
  await page.getByRole('heading', { name: 'Anuncios' }).waitFor();
  await page.waitForTimeout(800);
  assert.equal(await dock.count(), 0, 'no league, no trophy');

  // Celular: la copa cabe y la carrera cabe con sus trece carriles.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${dashboard.origin}/`);
  await dock.waitFor();
  await settle();
  await shoot('copa-celular');
  await dock.click();
  await race.waitFor();
  await page.waitForTimeout(900);
  const raceBox = await race.boundingBox();
  assert.ok(raceBox.x >= 0 && raceBox.x + raceBox.width <= 390, 'the race fits a phone width');
  assert.equal(await race.locator('[data-race-lane]').count(), 13);
  await shoot('carrera-celular');
  await race.locator('[data-race-track]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shoot('carrera-celular-pista');
  await page.keyboard.press('Escape');

  // El aviso de las 3, encima de Bria: el mismo aviso de siempre con los puntos y la posición, sin anillo ni nivel.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${bria.origin}/?liga`);
  const nudge = page.getByRole('status', { name: 'Aviso de Bria' });
  await nudge.waitFor();
  await page.waitForTimeout(700);
  assert.equal(await nudge.getAttribute('data-bria-nudge'), 'LIGA_DIA');
  assert.match(await nudge.locator('[data-bria-nudge-delta]').innerText(), /\+15 hoy/);
  assert.match(await nudge.locator('[data-bria-nudge-progress]').innerText(), /Vas 6\.º de 13/);
  assert.doesNotMatch(await nudge.innerText(), /Pro|Leyenda|En ritmo/);
  assert.equal(await nudge.getByRole('link', { name: 'Ver la carrera' }).getAttribute('href'), '/dashboard?carrera');
  const nudgeClip = async () => { const b = await nudge.boundingBox(); return { x: b.x - 24, y: b.y - 24, width: 1440 - b.x + 8, height: 900 - b.y + 24 }; };
  await shoot('liga-aviso-claro', { clip: await nudgeClip() });
  await page.goto(`${bria.origin}/?liga&dark`);
  await nudge.waitFor();
  await page.waitForTimeout(700);
  await shoot('liga-aviso-oscuro', { clip: await nudgeClip() });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, simulatedApi: true, realComponents: true, screenshots: 15, output }));
} finally { await browser.close(); await dashboard.close(); await bria.close(); }
