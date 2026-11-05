import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { chooseOption } from './selectHelpers.mjs';

const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3715/tests/fixtures/financial-integrity.html';
const output = 'output/receivable-collection-scope';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
    for (const [name, viewport, dark] of [['claro', { width: 1440, height: 1050 }, false], ['oscuro', { width: 1440, height: 1050 }, true], ['movil', { width: 390, height: 844 }, false]]) {
        const page = await browser.newPage({ viewport });
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`${base}?collectionScope`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByRole('tab', { name: 'Cuentas por cobrar', exact: true }).waitFor({ timeout: 60000 });
        if (dark) await page.getByRole('button', { name: 'Cambiar tema' }).click();
        await page.getByRole('tab', { name: 'Cuentas por cobrar', exact: true }).click();
        await page.getByRole('button', { name: 'Nueva cuenta por cobrar', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await chooseOption(dialog.getByRole('combobox', { name: 'Modalidad de cobro' }), 'MENSUAL');
        await page.screenshot({ path: `${output}/nueva-${name}.png` });
        await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
        await page.getByRole('button', { name: 'Nueva cuenta por cobrar', exact: true }).click();
        assert.match(await dialog.getByRole('combobox', { name: 'Modalidad de cobro' }).innerText(), /Mensualidad/);
        await chooseOption(dialog.getByRole('combobox', { name: 'Cliente de la cuenta por cobrar' }), 'demo-client');
        await dialog.getByLabel('Valor', { exact: true }).fill('120000');
        await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
        await dialog.waitFor({ state: 'detached' });
        assert.equal(await page.evaluate(() => window.__createdReceivables[0].collectionMode), 'MENSUAL');
        await page.getByRole('button', { name: /Cliente de muestra/ }).click();
        const first = page.locator('[data-receivable="demo-debt"]');
        await chooseOption(first.getByRole('combobox', { name: 'Modalidad de cobro' }), 'PUNTUAL');
        await page.getByText('Cartera actualizada.').waitFor();
        await first.locator('[data-collection-activity-add]').click();
        await page.locator('[data-collection-channel="LLAMADA"]').click();
        await first.locator('[data-collection-activity="LLAMADA"]').waitFor();
        assert.equal(await page.locator('[data-receivable="demo-debt-second"] [data-collection-activity="LLAMADA"]').count(), 0);
        assert.equal(await page.locator('[data-collection-activities="general"] [data-collection-activity="LLAMADA"]').count(), 0);
        assert.equal(await page.evaluate(() => window.__collectionActivities[0].receivableId), 'demo-debt');
        const second = page.locator('[data-receivable="demo-debt-second"]');
        assert.match(await second.locator('[data-receivable-mode]').innerText(), /Cuota/);
        assert.equal(await second.getByLabel('Modalidad de cobro').count(), 0, 'la cuota aprobada conserva su origen');
        await first.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/cartera-${name}.png` });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'sin desborde horizontal');
        assert.deepEqual(errors, []);
        await page.close();
    }
    const reader = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    await reader.goto(`${base}?collectionScope&viewer=reader`, { waitUntil: 'domcontentloaded' });
    await reader.getByRole('tab', { name: 'Cuentas por cobrar', exact: true }).click();
    await reader.getByRole('button', { name: /Cliente de muestra/ }).click();
    assert.equal(await reader.locator('[data-collection-activity-add]').count(), 0);
    assert.equal(await reader.getByRole('combobox', { name: 'Modalidad de cobro' }).count(), 0);
    await reader.close();
    console.log('Modalidad y gestión específica comprobadas en claro, oscuro y móvil.');
} finally { await browser.close(); }
