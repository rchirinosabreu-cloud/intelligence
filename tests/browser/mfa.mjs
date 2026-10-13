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

// La única salida a internet permitida es la tipografía del negocio (Roboto Condensed,
// Google Fonts, desde el 10 de octubre de 2026): todo lo demás es la API local.
const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

const watchRemote = (page) => {
    const remote = [];
    page.on('request', (request) => {
        const url = request.url();
        if (!url.startsWith(preview.origin) && /^https?:/.test(url) && !FONT_HOSTS.test(url)) remote.push(url);
    });
    return remote;
};

test('un administrador activa el MFA sin pulsar botones, entra con código de respaldo y su dispositivo queda recordado', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(60000);
    const remote = watchRemote(page);

    await page.goto(`${preview.origin}/`);
    await signIn(page, 'rodny@example.test');

    // Rol obligado sin MFA: la única pantalla es la de activación.
    await page.getByRole('heading', { name: 'Activa la verificación en dos pasos' }).waitFor();
    assert.match(page.url(), /\/activar-verificacion$/);
    await page.screenshot({ path: `${OUT}/01-obligatorio.png`, fullPage: true });

    await page.getByRole('button', { name: 'Vincular mi app autenticadora' }).click();
    await page.getByAltText('Código QR para vincular la app autenticadora').waitFor();
    assert.equal(await page.locator('[data-otp-box]').count(), 6, 'seis casillas');
    await page.screenshot({ path: `${OUT}/02-qr.png`, fullPage: true });

    // El sexto dígito envía solo: ningún clic en «Activar».
    const secret = (await page.locator('p.font-mono').innerText()).replace(/\s/g, '');
    await page.getByLabel('Código de seis dígitos de la app').fill('000000');
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByLabel('Código de seis dígitos de la app').inputValue(), '', 'un código fallido se vacía');
    await page.getByLabel('Código de seis dígitos de la app').fill(currentCode(secret));

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
    assert.equal(await page.getByLabel('Recordar este dispositivo por 7 días').isChecked(), true, 'recordar viene marcado');
    await page.getByLabel('Código de verificación').pressSequentially('123');
    await page.screenshot({ path: `${OUT}/05-login-casillas.png`, fullPage: true });

    await page.getByLabel('Código de verificación').fill('000000');
    await page.getByText(/El código no es válido/).waitFor();
    await page.screenshot({ path: `${OUT}/06-login-codigo-fallido.png`, fullPage: true });

    await page.getByRole('button', { name: 'Usar un código de respaldo' }).click();
    await page.getByLabel('Código de respaldo').fill(codes[0].toUpperCase());
    await page.getByRole('button', { name: 'Verificar y entrar' }).click();
    await page.getByText(/Te quedan 9 códigos de respaldo/).waitFor();

    // Mismo navegador, otra vez: durante la semana la contraseña basta.
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await signIn(page, 'rodny@example.test');
    await page.getByRole('heading', { name: /Mi Espacio/ }).waitFor();
    assert.equal(await page.getByLabel('Código de verificación').count(), 0, 'no pidió el código');
    assert.ok(await page.evaluate(() => localStorage.getItem('authToken')), 'entró con la sesión');
    await page.screenshot({ path: `${OUT}/07-dispositivo-recordado.png`, fullPage: true });

    // Un dispositivo nuevo siempre pide el código.
    const other = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    other.setDefaultTimeout(8000);
    const otherRemote = watchRemote(other);
    await other.goto(`${preview.origin}/`);
    await signIn(other, 'rodny@example.test');
    await other.getByRole('heading', { name: 'Verificación en dos pasos' }).waitFor();
    assert.equal(await other.evaluate(() => localStorage.getItem('authToken')), null);
    await other.close();

    // Un pase alterado no sirve: vuelve a pedir el código y el navegador lo olvida.
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.evaluate(() => {
        const devices = JSON.parse(localStorage.getItem('brain:mfa-trusted-devices'));
        devices['rodny@example.test'] = `${devices['rodny@example.test']}x`;
        localStorage.setItem('brain:mfa-trusted-devices', JSON.stringify(devices));
    });
    await signIn(page, 'rodny@example.test');
    await page.getByRole('heading', { name: 'Verificación en dos pasos' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('brain:mfa-trusted-devices')), null);

    assert.deepEqual(remote, []);
    assert.deepEqual(otherRemote, []);
    await page.close();
});

test('una cuenta nueva cambia su clave temporal y después activa el autenticador, sin volver al formulario', async () => {
    // Mariceth, 13 de octubre de 2026: el cambio de clave chocaba con el autenticador pendiente.
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(60000);
    await page.goto(`${preview.origin}/`);
    await page.getByRole('heading', { name: 'Bienvenido de nuevo' }).waitFor();
    await page.locator('input[type=email]').fill('nueva@example.test');
    await page.locator('input[type=password]').fill('ClaveTemporal-0000');
    await page.locator('button[type=submit]').click();

    await page.getByRole('heading', { name: 'Actualiza tu contrasena' }).waitFor();
    await page.getByLabel('Contrasena actual').fill('ClaveTemporal-0000');
    await page.getByLabel('Tu nueva contrasena').fill('MiClaveNueva-2026');
    await page.getByLabel('Confirmar nueva contrasena').fill('MiClaveNueva-2026');
    await page.screenshot({ path: `${OUT}/13-cuenta-nueva-clave.png`, fullPage: true });
    await page.getByRole('button', { name: 'Guardar nueva contrasena' }).click();

    // La clave se guardó: vuelve al login con el aviso, no al formulario.
    await page.getByText(/Contrasena actualizada/).waitFor();
    assert.equal(preview.db.byEmail('nueva@example.test').mustChangePassword, false);

    await page.locator('input[type=email]').fill('nueva@example.test');
    await page.locator('input[type=password]').fill('MiClaveNueva-2026');
    await page.locator('button[type=submit]').click();
    await page.getByRole('heading', { name: 'Activa la verificación en dos pasos' }).waitFor();
    await page.screenshot({ path: `${OUT}/14-cuenta-nueva-activar.png`, fullPage: true });
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
    await page.screenshot({ path: `${OUT}/10-movil-oscuro-desactivada.png`, fullPage: true });
    await page.getByRole('button', { name: 'Activar' }).click();
    await page.getByRole('button', { name: 'Vincular mi app autenticadora' }).click();
    const secret = (await page.locator('p.font-mono').innerText()).replace(/\s/g, '');
    await page.getByLabel('Código de seis dígitos de la app').pressSequentially('12');
    await page.screenshot({ path: `${OUT}/11-movil-oscuro-qr-casillas.png`, fullPage: true });
    await page.getByLabel('Código de seis dígitos de la app').fill(currentCode(secret));
    await page.getByRole('button', { name: 'Ya los guardé, terminar' }).click();

    await page.getByRole('button', { name: 'Desactivar' }).click();
    // Sin contraseña, la sexta casilla no envía: desactivar exige las dos cosas.
    const waitMs = (TOTP_PERIOD_SECONDS * 1000) - (Date.now() % (TOTP_PERIOD_SECONDS * 1000)) + 500;
    await page.waitForTimeout(waitMs);
    await page.getByLabel('Código de la app').fill(currentCode(secret));
    await page.waitForTimeout(500);
    assert.equal(await page.getByText(/Está desactivada/).count(), 0, 'sin contraseña no se desactiva');

    await page.getByLabel('Contraseña').fill('MuestraBrain2026!');
    await page.screenshot({ path: `${OUT}/12-movil-oscuro-desactivar.png`, fullPage: true });
    await page.getByRole('button', { name: 'Desactivar' }).last().click();
    await page.getByText(/Está desactivada/).waitFor({ timeout: 10000 });
    await page.close();
});
