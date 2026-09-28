import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createMfaPreview } from '../../scripts/preview-mfa.js';
import { totpCode, TOTP_PERIOD_SECONDS } from '../../src/lib/totp.js';

// Recorrido real de la verificación en dos pasos (27 de septiembre de 2026): pantallas de
// verdad contra la API local en memoria, con capturas en output/mfa. Nada sale a internet.

const OUT = 'output/mfa';
let preview, browser;

test.before(async () => {
    preview = await createMfaPreview({ port: 0 });
    browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

const currentCode = (secret) => totpCode(secret, Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS));

const signIn = async (page, email) => {
    await page.getByRole('heading', { name: 'Bienvenido de nuevo' }).waitFor();
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill('MuestraBrain2026!');
    await page.locator('button[type=submit]').click();
};

test('un administrador activa el MFA obligatorio y después entra con código de respaldo', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(60000);
    const remote = [];
    page.on('request', (request) => { if (!request.url().startsWith(preview.origin) && /^https?:/.test(request.url())) remote.push(request.url()); });

    await page.goto(`${preview.origin}/`);
    await signIn(page, 'rodny@example.test');

    // Rol obligado sin MFA: la única pantalla es la de activación.
    await page.getByRole('heading', { name: 'Activa la verificación en dos pasos' }).waitFor();
    assert.match(page.url(), /\/activar-verificacion$/);
    await page.screenshot({ path: `${OUT}/01-obligatorio.png`, fullPage: true });

    await page.getByRole('button', { name: 'Vincular mi app autenticadora' }).click();
    await page.getByAltText('Código QR para vincular la app autenticadora').waitFor();
    await page.screenshot({ path: `${OUT}/02-qr.png`, fullPage: true });

    const secret = (await page.locator('p.font-mono').innerText()).replace(/\s/g, '');
    await page.getByLabel('Código de seis dígitos de la app').fill('000000');
    await page.getByRole('button', { name: 'Activar verificación en dos pasos' }).click();
    await page.getByRole('alert').waitFor();
    await page.getByLabel('Código de seis dígitos de la app').fill(currentCode(secret));
    await page.getByRole('button', { name: 'Activar verificación en dos pasos' }).click();

    await page.getByText('no volverás a verlos').waitFor();
    const codes = await page.locator('ul li').allInnerTexts();
    assert.equal(codes.length, 10);
    await page.screenshot({ path: `${OUT}/03-codigos-respaldo.png`, fullPage: true });
    await page.getByRole('button', { name: 'Ya los guardé, terminar' }).click();

    await page.getByText(/Te quedan 10 códigos de respaldo/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Desactivar' }).count(), 0, 'un rol obligado no ve Desactivar');
    await page.screenshot({ path: `${OUT}/04-perfil-activo.png`, fullPage: true });

    // Segundo inicio de sesión: la contraseña ya no basta.
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await signIn(page, 'rodny@example.test');
    await page.getByRole('heading', { name: 'Verificación en dos pasos' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('authToken')), null, 'sin código no hay sesión');
    await page.screenshot({ path: `${OUT}/05-login-codigo.png`, fullPage: true });

    await page.getByLabel('Código de verificación').fill('000000');
    await page.getByRole('button', { name: 'Verificar y entrar' }).click();
    await page.getByText(/El código no es válido/).waitFor();

    await page.getByLabel('Código de verificación').fill(codes[0].toUpperCase());
    await page.getByRole('button', { name: 'Verificar y entrar' }).click();
    await page.getByText(/Te quedan 9 códigos de respaldo/).waitFor();

    assert.deepEqual(remote, []);
    await page.close();
});

test('una editora activa el MFA por elección y lo puede desactivar; se ve bien en móvil oscuro', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(60000);
    await page.goto(`${preview.origin}/`);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await signIn(page, 'ana@example.test');

    await page.getByText(/Está desactivada/).waitFor();
    await page.screenshot({ path: `${OUT}/06-movil-oscuro-desactivada.png`, fullPage: true });
    await page.getByRole('button', { name: 'Activar' }).click();
    await page.getByRole('button', { name: 'Vincular mi app autenticadora' }).click();
    const secret = (await page.locator('p.font-mono').innerText()).replace(/\s/g, '');
    await page.screenshot({ path: `${OUT}/07-movil-oscuro-qr.png`, fullPage: true });
    await page.getByLabel('Código de seis dígitos de la app').fill(currentCode(secret));
    await page.getByRole('button', { name: 'Activar verificación en dos pasos' }).click();
    await page.getByRole('button', { name: 'Ya los guardé, terminar' }).click();

    await page.getByRole('button', { name: 'Desactivar' }).click();
    await page.getByLabel('Contraseña').fill('MuestraBrain2026!');
    // El código ya usado al activar no vale: se espera al siguiente paso de 30 s.
    const waitMs = (TOTP_PERIOD_SECONDS * 1000) - (Date.now() % (TOTP_PERIOD_SECONDS * 1000)) + 500;
    await page.waitForTimeout(waitMs);
    await page.getByLabel('Código de la app o de respaldo').fill(currentCode(secret));
    await page.screenshot({ path: `${OUT}/08-movil-oscuro-desactivar.png`, fullPage: true });
    await page.getByRole('button', { name: 'Desactivar' }).last().click();
    await page.getByText(/Está desactivada/).waitFor({ timeout: 10000 });
    await page.close();
});
