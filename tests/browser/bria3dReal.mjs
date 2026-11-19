// Bria en 3D sobre las pantallas reales de la plataforma: la mascota flotante, el chat, el logro, la bienvenida,
// la revisión de la parrilla y los avisos de tareas. Capturas en claro, oscuro y celular en output/bria-3d-real.
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { createBriaMascotPreview } from '../../scripts/preview-bria-mascot.js';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';
import { createWelcomePreview } from '../../scripts/preview-welcome.js';

const out = path.resolve('output/bria-3d-real'); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(out, `${name}.png`), ...opts });
const settle = page => page.waitForTimeout(1400);
const step = async (name, fn) => { try { await fn(); console.log('ok', name); } catch (error) { console.log('FALLO', name, error.message.split('\n')[0]); } };
const setTheme = (page, dark) => page.evaluate(d => { document.documentElement.classList.toggle('dark', d); localStorage.setItem('theme', d ? 'dark' : 'light'); }, dark);

// 1. Plataforma con la mascota y el chat
const mascotPreview = await createBriaMascotPreview({ port: 0 });
for (const [label, viewport, dark] of [['escritorio-claro', { width: 1440, height: 900 }, false], ['escritorio-oscuro', { width: 1440, height: 900 }, true], ['celular', { width: 390, height: 844 }, false]]) {
  await step(`plataforma ${label}`, async () => {
    const page = await browser.newPage({ viewport });
    await page.goto(mascotPreview.origin);
    await page.getByRole('button', { name: 'Preguntarle a Bria' }).waitFor({ timeout: 120000 });
    await setTheme(page, dark); await settle(page);
    await shot(page, `1-plataforma-${label}`);
    await page.getByRole('button', { name: 'Preguntarle a Bria' }).click();
    await page.getByLabel('Mensaje para Bria').waitFor(); await settle(page);
    await shot(page, `2-chat-vacio-${label}`);
    const input = page.getByLabel('Mensaje para Bria');
    await input.fill('¿Qué tengo pendiente hoy?'); await input.press('Enter');
    await page.locator('[data-bria-working]').waitFor({ timeout: 8000 }); await page.waitForTimeout(700);
    await shot(page, `3-chat-trabajando-${label}`);
    if (label === 'escritorio-claro') {
      await page.getByRole('button', { name: 'Cerrar Bria' }).click();
      const trigger = page.locator('[data-bria-assistant-trigger]');
      await page.waitForFunction(() => document.querySelector('[data-bria-mascot]')?.dataset.briaState === 'celebrate', null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1300);
      await trigger.screenshot({ path: path.join(out, '4-mascota-celebrando.png') });
    }
    await page.close();
  });
}
await mascotPreview.close();

// 2. El logro
const recognition = await createRecognitionPreview({ port: 0 });
for (const [label, viewport, dark] of [['claro', { width: 1440, height: 900 }, false], ['oscuro', { width: 1440, height: 900 }, true], ['celular', { width: 390, height: 844 }, false]]) {
  await step(`logro ${label}`, async () => {
    const page = await browser.newPage({ viewport });
    await page.goto(recognition.origin);
    await page.getByRole('button', { name: 'Probar buen comienzo' }).waitFor({ timeout: 60000 });
    await setTheme(page, dark);
    await page.getByRole('button', { name: 'Probar buen comienzo' }).click();
    const notice = page.getByRole('status', { name: 'Reconocimiento personal' }); await notice.waitFor();
    await page.waitForTimeout(500); await shot(page, `5-logro-pildora-${label}`);
    await notice.getByRole('button', { name: 'Abrir el logro Buen comienzo' }).click();
    await page.waitForTimeout(1500); await shot(page, `6-logro-abierto-${label}`);
    await page.close();
  });
}
// 3. Avisos de tareas (mismas rutas del servidor de logros)
for (const [label, query] of [['muchas-horas', ''], ['devuelta', 'returned']]) {
  await step(`aviso ${label}`, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const task = { id: '11111111-1111-4111-8111-111111111111', title: 'Diseñar parrilla', status: query ? 'DEVUELTA' : 'EN_CURSO', clientName: 'Aristea',
      creatorId: 'helen', assignee: { userId: 'helen', isActive: true }, startedAt: new Date(Date.now() - 16 * 3600000), accumulatedWorkMs: 0,
      elapsedMs: 16 * 3600000, returnedAt: new Date(Date.now() - 7200000) };
    await page.route('**/api/**', route => route.fulfill({ json: route.request().method() === 'GET' ? { tasks: [task] } : { success: true } }));
    await page.goto(`${recognition.origin}/tests/fixtures/task-alert-trace.html?${query}`);
    await page.getByRole('dialog').waitFor({ timeout: 20000 }); await settle(page);
    await shot(page, `7-aviso-${label}`);
    await page.close();
  });
}
await recognition.close();

// 4. Bienvenida
const welcome = await createWelcomePreview({ port: 0 });
await step('bienvenida', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${welcome.origin}/tests/fixtures/welcome-preview.html`);
  await page.getByRole('dialog').waitFor({ timeout: 60000 }); await settle(page);
  await shot(page, '8-bienvenida');
  await page.close();
});
await welcome.close();

// 5. Revisión de Bria en la parrilla
const source = await readFile('tests/browser/briaFindingsCarousel.mjs', 'utf8');
const block = source.slice(source.indexOf('const findings'), source.indexOf('const server'));
const result = new Function(`${block}; return result;`)();
const vite = await createServer({ logLevel: 'error', optimizeDeps: { entries: ['tests/fixtures/bria-review.html'] }, server: { host: '127.0.0.1', port: 0, open: false } });
await vite.listen();
await step('parrilla', async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  await page.route('**/api/**', route => route.fulfill({ json: result }));
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/tests/fixtures/bria-review.html`);
  await page.getByRole('button', { name: 'Ver más', exact: true }).click();
  await page.locator('[data-bria-finding-card]').first().waitFor(); await settle(page);
  await shot(page, '9-parrilla-revision');
  const dismiss = page.getByRole('button', { name: /Descartar/ }).first();
  if (await dismiss.count()) { await dismiss.click(); await page.getByRole('dialog').waitFor(); await settle(page); await shot(page, '10-parrilla-descartar'); }
  await page.close();
});
await vite.close();
await browser.close();
