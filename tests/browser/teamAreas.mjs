import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { createWelcomePreview } from '../../scripts/preview-welcome.js';

// El área en Equipo (Rodny, 28 de octubre de 2026): el cargo sigue libre y el área se marca de una lista;
// sin área elegida aparece marcada la que se deduce del cargo. Muestra aislada, sin cuentas reales.

const OUT = 'output/team-areas';
let preview, browser;
test.before(async () => {
    preview = await createWelcomePreview({ port: 0 });
    browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

const openEditor = async (page, query) => {
    page.setDefaultNavigationTimeout(60000);
    await page.goto(`${preview.origin}/tests/fixtures/team-access.html?${query}`);
    await page.getByTitle('Editar').first().click();
    const dialog = page.getByRole('dialog', { name: 'Editar miembro' });
    await dialog.waitFor();
    return dialog;
};

test('el área deducida del cargo viene marcada y se guarda lo que se marque', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    page.setDefaultTimeout(10000);
    const dialog = await openEditor(page, 'modules');

    assert.equal(await dialog.getByLabel('Cargo').inputValue(), 'Diseñadora');
    assert.equal(await dialog.getByLabel('Diseño gráfico', { exact: true }).isChecked(), true, 'deducida del cargo');
    assert.equal(await dialog.getByLabel('Dirección', { exact: true }).isChecked(), false);
    await dialog.getByLabel('Dirección', { exact: true }).check();
    await dialog.screenshot({ path: `${OUT}/01-areas-claro.png` });

    await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const [saved] = await page.evaluate(() => window.__savedBodies);
    assert.deepEqual(saved.areas, ['DIRECCION', 'DISENO']);

    await page.getByTitle('Editar').first().click();
    const reopened = page.getByRole('dialog', { name: 'Editar miembro' });
    await reopened.waitFor();
    assert.equal(await reopened.getByLabel('Dirección', { exact: true }).isChecked(), true, 'al volver a abrir');
    await page.close();
});

test('se ve bien en el celular en oscuro', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000);
    const dialog = await openEditor(page, 'modules&dark');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await dialog.getByText('Área', { exact: true }).scrollIntoViewIfNeeded();
    await dialog.screenshot({ path: `${OUT}/02-areas-movil-oscuro.png` });
    await page.close();
});
