import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { createWelcomePreview } from '../../scripts/preview-welcome.js';
import { PLATFORM_MODULES } from '../../src/lib/platformModules.js';

// Casillas de módulos en Equipo (Rodny, 12 de octubre de 2026): salen de la lista única y
// Drive tiene la suya. Muestra aislada, sin cuentas reales ni conexiones externas.

const OUT = 'output/modules';
let preview, browser;
test.before(async () => {
    preview = await createWelcomePreview({ port: 0 });
    browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

const openEditor = async (page, query = 'modules') => {
    page.setDefaultNavigationTimeout(60000);
    await page.goto(`${preview.origin}/tests/fixtures/team-access.html?${query}`);
    await page.getByTitle('Editar').first().click();
    const dialog = page.getByRole('dialog', { name: 'Editar miembro' });
    await dialog.waitFor();
    return dialog;
};

test('la ventana muestra una casilla por módulo, Drive incluida, y quien tenía Minutas la ve marcada', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.setDefaultTimeout(10000);
    const dialog = await openEditor(page);

    for (const { label } of PLATFORM_MODULES) {
        assert.equal(await dialog.getByLabel(label, { exact: true }).count(), 1, label);
    }
    assert.equal(await dialog.getByLabel('Drive', { exact: true }).isChecked(), true, 'heredada de Minutas');
    assert.equal(await dialog.getByLabel('Minutas', { exact: true }).isChecked(), true);
    assert.equal(await dialog.getByLabel('CRM', { exact: true }).isChecked(), false);
    await dialog.screenshot({ path: `${OUT}/01-equipo-casillas.png` });

    // Quitar Drive y dejar Minutas: se guarda cada una por su lado.
    await dialog.getByLabel('Drive', { exact: true }).uncheck();
    await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const [saved] = await page.evaluate(() => window.__savedBodies);
    assert.equal(saved.modulePermissions.drive, false);
    assert.equal(saved.modulePermissions.minutas, true);
    assert.equal(saved.modulePermissions.gestion, true);

    await page.getByTitle('Editar').first().click();
    const reopened = page.getByRole('dialog', { name: 'Editar miembro' });
    await reopened.waitFor();
    assert.equal(await reopened.getByLabel('Drive', { exact: true }).isChecked(), false, 'al volver a abrir la ventana');
    assert.equal(await reopened.getByLabel('Minutas', { exact: true }).isChecked(), true);
    await page.close();
});

test('elegir un rol marca los módulos de ese rol, Drive incluida; se ve bien en móvil oscuro', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000);
    const dialog = await openEditor(page, 'modules&dark');

    const roleSelect = dialog.getByLabel('Rol de Permisos del Sistema');
    await roleSelect.selectOption('VIEWER');
    assert.equal(await dialog.getByLabel('Drive', { exact: true }).isChecked(), true);
    assert.equal(await dialog.getByLabel('Gestión (Tareas)', { exact: true }).isChecked(), false);
    await roleSelect.selectOption('PROJECT_MANAGER');
    for (const { label } of PLATFORM_MODULES) {
        assert.equal(await dialog.getByLabel(label, { exact: true }).isChecked(), true, label);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await dialog.screenshot({ path: `${OUT}/02-equipo-movil-oscuro.png` });
    await page.close();
});
