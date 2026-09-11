import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { chooseOption } from './selectHelpers.mjs';

let server, browser, origin;
const errors = [];
before(async () => {
  const { createRecognitionPreview } = await import('../../scripts/preview-recognitions.js');
  server = await createRecognitionPreview({ port: 0 });
  origin = server.origin;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/recognitions', { recursive: true });
});
after(async () => { await browser?.close(); await server?.close(); });

async function pageFor(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, ...options });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Logros recientes', exact: true }).waitFor({ timeout: 40000 });
  await page.locator('[data-achievements-feed] [data-completed-task-id]').first().waitFor();
  return page;
}

test('keeps completed tasks, original achievements titles and history filters instead of replacing them', async () => {
  const page = await pageFor();
  assert.equal(await page.getByRole('heading', { name: 'Logros recientes', exact: true }).count(), 1);
  assert.equal(await page.getByRole('heading', { name: 'Reconocimientos del equipo', exact: true }).count(), 0);
  const panel = page.locator('[data-achievements-feed]');
  await panel.getByText('Organizar materiales de entrega', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Probar buen comienzo' }).click();
  await page.getByRole('button', { name: 'Cerrar reconocimiento' }).click();
  await panel.getByRole('button', { name: 'Ver historial completo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Historial de logros', exact: true });
  await dialog.getByText('Organizar materiales de entrega', { exact: true }).waitFor();
  assert.equal(await dialog.getByText('Registro detallado de tareas completadas', { exact: true }).count(), 1);
  const plain = dialog.locator('[data-completed-task-id="recognition-completed-plain"]');
  assert.equal(await plain.locator('[data-task-recognitions]').count(), 0);
  const recognized = dialog.locator('[data-completed-task-id="recognition-completed-rodny"]');
  assert.match(await recognized.innerText(), /Definir concepto de campaña/);
  assert.equal(await recognized.getByText('Buen comienzo', { exact: true }).count(), 1);
  assert.equal(await dialog.getByRole('button', { name: 'Regresar al tablero' }).count(), 0, 'editor cannot reopen tasks');
  await chooseOption(dialog.getByRole('combobox'), 'recognition-demo-member');
  assert.equal(await dialog.getByText('Diseñar parrilla', { exact: true }).count(), 0);
  await chooseOption(dialog.getByRole('combobox'), 'all');
  const previousDay = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  await dialog.locator('input[type="date"]').fill(previousDay);
  await dialog.getByText('Revisar calendario editorial', { exact: true }).waitFor();
  assert.equal(await dialog.getByText('Diseñar parrilla', { exact: true }).count(), 0);
  await dialog.getByPlaceholder('Buscar tarea o cliente...').fill('Diseñar parrilla');
  await dialog.getByText('Diseñar parrilla', { exact: true }).waitFor();
  assert.equal(await dialog.locator('input[type="date"]').isDisabled(), true);
  assert.equal(await dialog.getByText('Revisar calendario editorial', { exact: true }).count(), 0);
  await dialog.getByPlaceholder('Buscar tarea o cliente...').fill('');
  await dialog.getByText('Revisar calendario editorial', { exact: true }).waitFor();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  await dialog.locator('input[type="date"]').fill(today);
  await dialog.getByText('Definir concepto de campaña', { exact: true }).waitFor();
  await dialog.screenshot({ path: 'output/recognitions/history-light.png', animations: 'disabled' });
  await page.close();
});

test('real dashboard, matching panel heights, personal notice never blocks search, close and history work', async () => {
  const page = await pageFor();
  await page.getByRole('button', { name: 'Probar buen comienzo' }).click();
  const notice = page.getByRole('status', { name: 'Reconocimiento personal' });
  await notice.waitFor();
  assert.equal(await notice.getByText('Buen comienzo', { exact: true }).count(), 1);
  assert.match(await notice.innerText(), /Eres el primero del equipo en completar una tarea\.\s+Cada avance cuenta\./);
  const lines = await notice.locator('p').filter({ hasText: 'Cada avance cuenta.' }).evaluate(element => {
    const text = element.firstChild;
    const range = document.createRange();
    const start = text.textContent.indexOf('Cada avance cuenta.');
    range.setStart(text, start);
    range.setEnd(text, start + 'Cada avance cuenta.'.length);
    return { sentence: range.getBoundingClientRect().toJSON(), paragraph: element.getBoundingClientRect().toJSON() };
  });
  assert.ok(Math.abs(lines.sentence.left - lines.paragraph.left) < 1, 'Cada avance cuenta starts at the left of a new line');
  assert.ok(lines.sentence.top > lines.paragraph.top + 10, 'the final sentence is below the first line');
  assert.doesNotMatch(await notice.innerText(), /Bria celebra contigo/);
  const firstOfTeam = page.locator('[data-achievements-feed] [data-completed-task-id]').filter({ hasText: 'Buen comienzo' });
  assert.equal(await firstOfTeam.count(), 1, 'the local scenario has only one team opener today');
  assert.match(await firstOfTeam.innerText(), /Rodny Chirinos/);
  assert.match(await firstOfTeam.innerText(), /Definir concepto de campaña/);
  await page.getByRole('textbox', { name: 'Buscar en Brainstudio' }).fill('Trabajo sin interrupciones');
  assert.equal(await page.getByRole('textbox', { name: 'Buscar en Brainstudio' }).inputValue(), 'Trabajo sin interrupciones');
  assert.equal(await page.locator('[role="dialog"]').count(), 0);
  await page.getByRole('heading', { name: 'Logros recientes', exact: true }).scrollIntoViewIfNeeded();
  const heights = await page.evaluate(() => {
    const panel = document.querySelector('[data-achievements-feed]');
    return [panel.getBoundingClientRect().height, panel.previousElementSibling.getBoundingClientRect().height];
  });
  assert.ok(Math.abs(heights[0] - heights[1]) < 2);
  await page.screenshot({ path: 'output/recognitions/dashboard-light.png', animations: 'disabled' });
  await notice.screenshot({ path: 'output/recognitions/notice-light.png', animations: 'disabled' });
  await notice.getByRole('button', { name: 'Cerrar reconocimiento' }).click();
  await notice.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Ver historial completo' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /Historial de logros/);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.close();
});

test('demo events are deduplicated and resettable; motion has intermediate frames', async () => {
  const page = await pageFor();
  const button = page.getByRole('button', { name: 'Probar entrega anticipada' });
  const frames = await page.evaluate(async () => {
    const values = [];
    document.querySelector('[aria-label="Probar entrega anticipada"]').click();
    for (let i = 0; i < 32; i++) {
      await new Promise(requestAnimationFrame);
      const el = document.querySelector('[data-recognition-notice]');
      if (el) values.push(Number(getComputedStyle(el).opacity));
    }
    return values;
  });
  assert.ok(frames.some(value => value > 0 && value < 1), 'entrance must have intermediate frames');
  assert.match(await page.getByRole('status', { name: 'Reconocimiento personal' }).innerText(), /Entrega anticipada/);
  const count = await page.locator('[data-achievements-feed] [data-task-recognitions] span').count();
  await button.click();
  assert.equal(await page.locator('[data-achievements-feed] [data-task-recognitions] span').count(), count);
  await page.getByRole('button', { name: 'Reiniciar muestra' }).click();
  await page.getByRole('status', { name: 'Reconocimiento personal' }).waitFor({ state: 'hidden' });
  await page.close();
});

test('mobile dark reduced motion keeps message readable, static, and in viewport', async () => {
  const page = await pageFor({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Cambiar tema' }).click();
  await page.getByLabel('Estilo del aviso').selectOption('celebration');
  await page.getByRole('button', { name: 'Probar 50 tareas semanales' }).click();
  const notice = page.locator('[data-recognition-notice]');
  await notice.waitFor();
  const state = await notice.evaluate(el => ({ rect: el.getBoundingClientRect().toJSON(), transform: getComputedStyle(el).transform, canvases: el.querySelectorAll('canvas').length, overflow: document.documentElement.scrollWidth > innerWidth }));
  assert.ok(state.rect.x >= 0 && state.rect.right <= 390 && state.rect.bottom <= 844);
  assert.equal(state.canvases, 0);
  assert.equal(state.overflow, false);
  assert.ok(state.transform === 'none' || state.transform === 'matrix(1, 0, 0, 1, 0, 0)');
  await page.screenshot({ path: 'output/recognitions/mobile-dark.png', animations: 'disabled' });
  await notice.getByRole('button', { name: 'Cerrar reconocimiento' }).click();
  await page.getByRole('button', { name: 'Ver historial completo' }).click();
  const history = page.getByRole('dialog', { name: 'Historial de logros', exact: true });
  await history.getByText('Definir concepto de campaña', { exact: true }).waitFor();
  const bounds = await history.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  await page.screenshot({ path: 'output/recognitions/history-mobile-dark.png', animations: 'disabled' });
  await page.close();
});

test('only six agreed scenarios render the approved copy and remain single demo records', async () => {
  const page = await pageFor({ reducedMotion: 'reduce' });
  assert.equal(await page.getByRole('button', { name: /^Probar / }).count(), 6);
  const cases = [
    ['buen comienzo', 'Buen comienzo', 'Eres el primero del equipo en completar una tarea.\nCada avance cuenta.'],
    ['entrega anticipada', 'Entrega anticipada', 'Terminaste ese pendiente antes de lo previsto. Anticiparte también suma.'],
    ['on fire', 'On fire', 'Hoy completaste ocho tareas. ¡Qué manera de hacer avanzar las cosas!'],
    ['ponerse al día', 'Al día', 'Resolviste todo lo que tenías vencido, buen trabajo.'],
    ['parrilla aprobada', 'Parrilla aprobada', 'El cliente aprobó tu parrilla, mandemos a producción'],
    ['50 tareas semanales', 'Ya son 50', 'Llevas 50 tareas cumplidas en esta semana, puro trabajo y dedicación. ¡Felicidades!'],
  ];
  const notice = page.getByRole('status', { name: 'Reconocimiento personal' });
  for (const [button, title, message] of cases) {
    await page.getByRole('button', { name: `Probar ${button}`, exact: true }).click();
    await notice.getByText(title, { exact: true }).waitFor();
    assert.equal(await notice.getByText(message, { exact: true }).count(), 1);
    assert.doesNotMatch(await notice.innerText(), /Bria celebra contigo|Constancia que suma/);
    const count = await page.locator('[data-achievements-feed] [data-task-recognitions] span').count();
    await page.getByRole('button', { name: `Probar ${button}`, exact: true }).click();
    assert.equal(await page.locator('[data-achievements-feed] [data-task-recognitions] span').count(), count);
    await notice.screenshot({ path: `output/recognitions/scenario-${button.replaceAll(' ', '-')}.png`, animations: 'disabled' });
    await notice.getByRole('button', { name: 'Cerrar reconocimiento' }).click();
    await notice.waitFor({ state: 'hidden' });
  }
  await page.getByRole('button', { name: 'Ver historial completo' }).click();
  const history = page.getByRole('dialog');
  await history.getByText('Definir concepto de campaña', { exact: true }).waitFor();
  assert.equal(await history.getByText('Ya son 50', { exact: true }).count(), 1);
  assert.equal(await history.getByText('Parrilla aprobada', { exact: true }).count(), 0, 'a plan award must not be attached to an unrelated task');
  await page.close();
});

test('preview API denies real writes and unknown routes instead of calling production', async () => {
  for (const route of ['/api/tasks', '/api/financial/movements']) {
    const res = await fetch(`${origin}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 403);
  }
  assert.equal((await fetch(`${origin}/api/not-implemented`)).status, 404);
  assert.deepEqual(errors, []);
});

test('celebration renders local particles, works on Gestion and returns to the shared feed', async () => {
  const page = await pageFor();
  await page.getByRole('link', { name: 'Gestión', exact: true }).click();
  try {
    await page.getByRole('heading', { name: 'Gestión de Tareas' }).waitFor({ timeout: 10000 });
  } catch (error) {
    console.error('Gestion preview:', page.url(), await page.locator('body').innerText(), errors);
    throw error;
  }
  await page.getByLabel('Estilo del aviso').selectOption('celebration');
  await page.getByRole('button', { name: 'Probar buen comienzo' }).click();
  await page.locator('[data-recognition-notice] canvas').waitFor();
  assert.equal(await page.locator('[data-recognition-notice] canvas').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await page.screenshot({ path: 'output/recognitions/gestion-celebration.png', animations: 'disabled' });
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.locator('[data-achievements-feed] [data-completed-task-id]').first().waitFor();
  assert.match(await page.locator('[data-achievements-feed]').innerText(), /Rodny Chirinos/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('automatic dismissal waits while hovered and preserves the record in the feed', async () => {
  const page = await pageFor({ reducedMotion: 'reduce' });
  await page.getByRole('checkbox', { name: 'Mantener aviso visible' }).uncheck();
  await page.getByRole('button', { name: 'Probar buen comienzo' }).click();
  const notice = page.locator('[data-recognition-notice]');
  await notice.waitFor();
  await notice.hover();
  await page.clock.install();
  await page.clock.fastForward(12000);
  assert.equal(await notice.isVisible(), true);
  await page.mouse.move(10, 10);
  await page.clock.fastForward(10000);
  await notice.waitFor({ state: 'hidden' });
  assert.match(await page.locator('[data-achievements-feed]').innerText(), /Rodny Chirinos/);
  await page.close();
});
