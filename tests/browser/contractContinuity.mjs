import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createOperationalNoticePreview } from '../../scripts/preview-operational-notices.mjs';

test('la banda confirma la decisión, conserva obligaciones y persiste al recargar', async () => {
  const preview = await createOperationalNoticePreview({ port: 0 });
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/continuidad-local', { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(preview.origin);
    await page.getByLabel('Caso', { exact: true }).selectOption('renovacion');
    const button = page.getByRole('button', { name: 'El cliente no renovará', exact: true });
    await button.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /25 nov 2026/);
    assert.match(await dialog.innerText(), /publicaciones, entregas, informes y cobros pendientes/);
    assert.equal(await dialog.getByRole('button', { name: 'Volver', exact: true }).evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(preview.data.clientContractDecision.length, 0);
    assert.ok(await button.isVisible(), 'cancelar no atiende el aviso');
    for (const [theme, width] of [['claro', 1440], ['oscuro', 1440], ['movil', 390]]) {
      if (theme === 'oscuro') await page.getByRole('button', { name: 'Tema oscuro', exact: true }).click();
      await page.setViewportSize({ width, height: 1000 });
      await button.click(); await dialog.waitFor();
      await dialog.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
      const confirm = dialog.getByRole('button', { name: 'Confirmar no renovación', exact: true });
      assert.equal(await confirm.evaluate(e => getComputedStyle(e).color), 'rgb(255, 255, 255)');
      assert.ok((await confirm.boundingBox()).height >= 44);
      await page.screenshot({ path: `output/continuidad-local/confirmar-${theme}.png`, animations: 'disabled' });
      await dialog.getByRole('button', { name: 'Volver', exact: true }).click();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await button.click();
    await dialog.getByLabel('Nota del acuerdo (opcional)').fill('El cliente confirmó que no desea renovar.');
    await dialog.getByRole('button', { name: 'Confirmar no renovación', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.locator('[data-important-notice]').waitFor({ state: 'detached' });
    assert.equal(preview.data.clientContract[0].renewalDecision, 'NO_RENOVAR');
    assert.equal(preview.data.clientContractDecision.length, 1);
    assert.equal(preview.data.clientContract[0].status, 'ACTIVO');
    assert.equal(preview.data.clientContract[0].endDate, '2026-11-25');
    await page.reload();
    assert.equal(await button.count(), 0);
    const summary = page.locator('[data-contract-continuity]');
    await summary.waitFor();
    assert.match(await summary.innerText(), /Registrado por Kamila/);
    await page.screenshot({ path: 'output/continuidad-local/decision-registrada.png', animations: 'disabled' });
    await summary.getByRole('button', { name: 'Corregir decisión', exact: true }).click();
    await dialog.getByLabel('Motivo de la corrección').fill('El cliente pidió revisar una propuesta de continuidad.');
    await dialog.getByRole('button', { name: 'Confirmar corrección', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(preview.data.clientContractDecision.length, 2);
    assert.equal(preview.data.clientContract[0].renewalDecision, 'PENDIENTE');
    assert.equal(preview.data.client[0].monthlyCloses.length, 1, 'no se confirma ningún cierre adicional');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await preview.close(); }
});
