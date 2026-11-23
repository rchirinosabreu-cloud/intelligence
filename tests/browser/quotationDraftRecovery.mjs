// «Nueva propuesta» no se queda atrapada en su borrador (Rodny y Elisa, 23 de noviembre de 2026: «¿por qué no
// me deja descartar los borradores?»; a Elisa «Algo falló en esta pantalla» no la dejaba crear cotizaciones).
// Requiere la muestra local en 3007: npx vite --config tests/fixtures/quotation-vite.config.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const base = process.env.QUOTATION_DEMO_URL || 'http://127.0.0.1:3007/tests/fixtures/quotation-proposal.html';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => { if (!localStorage.getItem('currentUser')) localStorage.setItem('currentUser', JSON.stringify({ id: 'muestra' })); });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}?view=new`, { timeout: 60000, waitUntil: 'domcontentloaded' });
    const company = page.getByPlaceholder('Ej: Acme Corp SAS');
    await company.waitFor();
    await page.waitForTimeout(500);
    // Sin tocar nada no hay borrador: los términos sugeridos los puso la pantalla.
    assert.equal(await page.locator('[data-form-draft]').count(), 0, 'una propuesta intacta no es un borrador');
    await company.fill('Café Altura');
    await page.getByText('Borrador conservado en este navegador.').waitFor();
    await page.getByRole('button', { name: 'Descartar borrador' }).click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-form-draft]').count(), 0, 'descartar quita el borrador');
    assert.equal(await company.inputValue(), '');
    // Un borrador con valores que no cuadran (duración con decimales, descuento de 150 %) abre igual.
    await company.fill('Café Altura');
    await page.getByText('Borrador conservado en este navegador.').waitFor();
    const poisoned = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(name => name.startsWith('brain.formDraft.') && name.endsWith('quotation%3Anew'));
      if (!key) return false;
      const entry = JSON.parse(localStorage.getItem(key));
      entry.form.durationMonths = 1.5; entry.form.discountType = 'PERCENTAGE'; entry.form.discountValue = '150';
      localStorage.setItem(key, JSON.stringify(entry)); return true;
    });
    assert.ok(poisoned, 'el borrador local existe');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('Se recuperó lo que estabas escribiendo.').waitFor();
    assert.equal(await page.getByText('Algo falló en esta pantalla').count(), 0);
    const issue = page.locator('[data-quotation-issue]');
    await issue.waitFor();
    assert.match(await issue.innerText(), /descuento porcentual no puede superar 100%/);
    await issue.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/quotation-draft-issue-${viewport.width}.png`, animations: 'disabled' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sin desborde horizontal');
    await page.getByRole('button', { name: 'Descartar borrador' }).click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-form-draft]').count(), 0);
    assert.equal(await issue.count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('OK');
} finally { await browser.close(); }
