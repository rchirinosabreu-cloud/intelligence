import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createGovernancePreview } from '../../scripts/preview-ai-governance.js';

// Recorrido real de «Reportar un incidente» y del registro único de incidentes (12 de octubre de 2026) sobre
// la muestra local: menú de cuenta, ruta, servicio y PostgreSQL reales en la base aislada governance_test
// (127.0.0.1:55449). Los avisos a administración se capturan en la muestra en vez de ir a la campana.
// Deja capturas en `SCREENSHOT_DIR` (por defecto output/incidentes).
const outDir = path.resolve(process.env.SCREENSHOT_DIR || 'output/incidentes');
await mkdir(outDir, { recursive: true });

const preview = await createGovernancePreview({ port: Number(process.env.GOVERNANCE_PREVIEW_PORT || 3113) });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const description = `Me llegó un correo que parecía del banco pidiendo la clave (${Date.now()}).`;

const watch = (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource') && !message.text().includes('[Gobierno IA]')) errors.push(message.text());
  });
  return errors;
};

try {
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errors = watch(page);
    await page.goto(`${preview.origin}/reportar-incidente`);
    await page.getByRole('button', { name: 'Abrir menú de cuenta' }).click();
    await page.getByRole('menuitem', { name: 'Reportar un incidente' }).waitFor();
    await page.screenshot({ path: path.join(outDir, '1-menu-de-cuenta.png') });
    await page.getByRole('menuitem', { name: 'Reportar un incidente' }).click();
    const dialog = page.locator('[data-incident-report-dialog]');
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Enviar reporte' }).isDisabled(), true, 'sin descripción no se envía');
    await dialog.locator('#incident-report-description').fill(description);
    await dialog.locator('#incident-report-client-answer').click();
    await page.getByRole('option', { name: 'No sé' }).click();
    await dialog.locator('#incident-report-client').click();
    await page.getByRole('option', { name: 'Cliente de muestra A' }).click();
    await page.screenshot({ path: path.join(outDir, '2-dialogo-lleno.png') });
    await dialog.getByRole('button', { name: 'Enviar reporte' }).click();
    await page.getByText('Reporte enviado. Administración ya fue avisada.').waitFor();
    await dialog.waitFor({ state: 'detached' });
    await page.getByText('Reportaron un incidente de seguridad').waitFor();
    await page.screenshot({ path: path.join(outDir, '3-enviado-y-aviso-a-administracion.png') });
    // Quien reporta no gana lectura del registro.
    const status = await page.evaluate(() => fetch('/api/ai-governance/incidents', { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } }).then((r) => r.status));
    assert.equal(status, 403);
    assert.deepEqual(errors, []);
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = watch(page);
    await page.goto(`${preview.origin}/gobierno-ia?tab=incidents`);
    const card = page.locator('article', { hasText: description }).first();
    await card.waitFor();
    assert.match(await card.textContent(), /Reportado por Prueba Editor/);
    assert.match(await card.textContent(), /no sabe si afecta a un cliente/);
    await page.screenshot({ path: path.join(outDir, '4-registro-administracion.png'), fullPage: true });
    await card.getByRole('button', { name: 'Ver / editar' }).click();
    await page.getByRole('dialog').getByText(/desde la plataforma/).waitFor();
    assert.equal(await page.locator('#gov-recipientEmail').count(), 0, 'sin decidir el cliente no se pide correo');
    await page.locator('#gov-affectsClient').click();
    await page.getByRole('option', { name: 'Sí' }).click();
    assert.equal(await page.locator('#gov-recipientEmail').count(), 1, 'si afecta a un cliente se pide el correo');
    await page.locator('#gov-affectsClient').click();
    await page.getByRole('option', { name: 'No', exact: true }).click();
    assert.equal(await page.locator('#gov-recipientEmail').count(), 0);
    await page.locator('#gov-incidentType').click();
    await page.getByRole('option', { name: 'Ingeniería social' }).click();
    await page.screenshot({ path: path.join(outDir, '5-completar-reporte.png'), fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${preview.origin}/reportar-incidente?dark`);
    await page.getByRole('button', { name: 'Abrir menú de cuenta' }).click();
    await page.getByRole('menuitem', { name: 'Reportar un incidente' }).click();
    await page.locator('[data-incident-report-dialog]').waitFor();
    await page.screenshot({ path: path.join(outDir, '6-movil-oscuro.png') });
    await page.close();
  }
  console.log(`Capturas en ${outDir}`);
} finally {
  await browser.close();
  await preview.close();
}
