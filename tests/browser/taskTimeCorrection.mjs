// Corregir el tiempo de una sesión (Rodny, 23 de octubre de 2026): un administrador acorta una sesión que se pasó y
// detiene un reloj que nadie pausó; la tarea vuelve a Pendiente. Un project manager ve las sesiones, sin «Corregir».
// Muestra local: npx vite --host 127.0.0.1 --port 3006
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const base = process.env.TIME_CORRECTION_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/task-time-correction-preview.html';
const outDir = new URL('../../output/task-time-correction/', import.meta.url);
const shot = name => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const scheme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 520, height: 900 }, colorScheme: scheme });
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}${scheme === 'dark' ? '?dark' : ''}`, { timeout: 90000, waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Ver sesiones' }).click();
    await page.locator('[data-work-session="s1"]').waitFor();

    // Una sesión cerrada que marcó 9 h 12 min: no se deja alargar, y se acorta con motivo.
    await page.locator('[data-work-session="s1"] [data-work-session-correct]').click();
    const dialog = page.locator('[data-time-correction-dialog]');
    await dialog.waitFor();
    await dialog.getByLabel('Horas').fill('10');
    await dialog.getByLabel('Motivo').fill('Se le olvidó pausar al salir');
    await dialog.getByRole('button', { name: 'Corregir tiempo' }).click();
    assert.match(await dialog.getByRole('alert').innerText(), /solo acorta/);
    await dialog.getByLabel('Horas').fill('1');
    assert.equal(await dialog.getByRole('alert').count(), 0, 'el motivo del error se va al corregir el campo');
    await dialog.getByLabel('Minutos').fill('30');
    await page.screenshot({ path: shot(`dialogo-${scheme}.png`), animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Corregir tiempo' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.match(await page.locator('[data-work-session="s1"]').innerText(), /Corregida: marcaba 9 h 12 min · Se le olvidó pausar al salir/);

    // El reloj que sigue corriendo desde ayer: se detiene con el tiempo real y la tarea vuelve a Pendiente.
    await page.locator('[data-work-session="s2"] [data-work-session-correct]').click();
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /sigue corriendo/);
    await dialog.getByLabel('Horas').fill('2');
    await dialog.getByLabel('Motivo').fill('Se fue sin pausar');
    await dialog.getByRole('button', { name: 'Corregir tiempo' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.match(await page.locator('[data-preview-status]').innerText(), /Pendiente/);
    assert.match(await page.locator('[data-work-session="s2"]').innerText(), /Detenida al corregir/);
    await page.locator('[data-task-work-history]').screenshot({ path: shot(`historial-${scheme}.png`), animations: 'disabled' });
    assert.deepEqual(errors, []);
    await page.close();
  }
  const pm = await browser.newPage({ viewport: { width: 520, height: 900 } });
  await pm.goto(`${base}?pm`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await pm.getByRole('button', { name: 'Ver sesiones' }).click();
  await pm.locator('[data-work-session="s1"]').waitFor();
  assert.equal(await pm.locator('[data-work-session-correct]').count(), 0, 'un project manager no corrige');
  console.log('Corregir tiempo: OK');
} finally {
  await browser.close();
}
