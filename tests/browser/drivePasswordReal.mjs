import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

test('Drive real: dirección necesita clave, descarga autorizada, bloqueo y móvil oscuro', async () => {
  const access = JSON.parse(await readFile('output/drive-password/access.json', 'utf8'));
  assert.equal(access.origin, 'http://127.0.0.1:3184');
  assert.equal((await fetch(`${access.origin}/api/health`).then(r => r.json())).isolatedTaskPieceTest, true);
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${access.origin}/drive?folderId=${access.folderId}`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type=email]').fill(access.users.manager.email);
    await page.locator('input[type=password]').fill(access.users.manager.password);
    await page.getByRole('button', { name: 'Acceder', exact: true }).click();
    await page.getByRole('button', { name: 'Desbloquear carpeta', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Desbloquear carpeta' });
    await dialog.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
    await dialog.getByRole('button', { name: 'Desbloquear', exact: true }).click();
    await dialog.getByText('La contraseña no es correcta.').waitFor();
    assert.equal(await page.getByText('pieza-de-prueba.png', { exact: true }).count(), 0);
    await page.screenshot({ path: 'output/drive-password/real-clave.png', animations: 'disabled' });
    await dialog.getByLabel('Contraseña', { exact: true }).fill(access.password);
    await dialog.getByRole('button', { name: 'Desbloquear', exact: true }).click();
    await page.getByText('pieza-de-prueba.png', { exact: true }).waitFor();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar pieza-de-prueba.png', exact: true }).click();
    assert.equal((await download).suggestedFilename(), 'pieza-de-prueba.png');
    await page.screenshot({ path: 'output/drive-password/real-desbloqueado.png', animations: 'disabled' });
    await page.getByRole('button', { name: 'Bloquear carpetas', exact: true }).click();
    await page.getByRole('button', { name: 'Desbloquear carpeta', exact: true }).waitFor();
    assert.equal(await page.getByText('pieza-de-prueba.png', { exact: true }).count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Desbloquear carpeta', exact: true }).click();
    await dialog.getByLabel('Contraseña', { exact: true }).waitFor();
    await page.screenshot({ path: 'output/drive-password/real-movil-oscuro.png', animations: 'disabled' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.deepEqual(errors, []);
  } catch (error) {
    await page.screenshot({ path: 'output/drive-password/real-fallo.png', animations: 'disabled' });
    throw error;
  } finally { await browser.close(); }
});
