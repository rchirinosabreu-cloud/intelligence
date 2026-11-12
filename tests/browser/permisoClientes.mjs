// El permiso «Ver la operación completa de clientes» y las vistas de quien no lo tiene
// (Rodny, 12 de noviembre de 2026: «necesito crear un permiso para que quien yo quiera vea los
// clientes completos» · «esas vistas como están ahora también están mal»).
// Muestra local: npx vite --host 127.0.0.1 --port 3006
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const base = process.env.CLIENTES_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/permiso-clientes.html';
const outDir = new URL('../../output/permiso-clientes/', import.meta.url);
const shot = (name) => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1300 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.locator('[data-equipo-extras]').waitFor();

  // 1. En Equipo, la casilla se le ofrece a quien le sirve y a nadie viene marcada.
  const extras = page.locator('[data-equipo-extras]');
  const casilla = extras.locator('[data-team-client-operations-toggle]');
  await casilla.waitFor();
  assert.equal(await casilla.isChecked(), false, 'nadie la trae marcada');
  assert.match((await extras.innerText()).replace(/\s+/g, ' '), /Ver la operación completa de clientes/);
  assert.match((await extras.innerText()).replace(/\s+/g, ' '), /El semáforo del mes, el avance de cada parrilla y la carga del equipo/);
  // A quien ya la ve por su cargo no se le ofrece: marcarla no cambiaría nada.
  await extras.locator('[data-role-option="PROJECT_MANAGER"]').click();
  assert.equal(await casilla.count(), 0, 'a un project manager no se le ofrece');
  await extras.locator('[data-role-option="EDITOR"]').click();
  await casilla.waitFor();
  await extras.screenshot({ path: shot('01-casilla-en-equipo.png'), animations: 'disabled' });

  // 2. Sin el permiso: sus cuentas primero, y ninguna acción que el servidor vaya a negar.
  const section = page.locator('main');
  assert.equal(await page.getByRole('button', { name: 'Nuevo cliente' }).count(), 0, 'no se le ofrece crear clientes');
  assert.equal(await page.getByRole('tab', { name: 'Operación' }).count(), 0, 'sin permiso no hay pestañas');
  assert.equal(await page.getByLabel('Community manager').count(), 0, 'el filtro por CM es de quien reparte cuentas');
  const mias = page.locator('[data-directory-mine]');
  await mias.waitFor();
  const texto = (await mias.innerText()).replace(/\s+/g, ' ');
  assert.match(texto, /Tus clientes \(2\)/);
  assert.match(texto, /Desarrollo Económico/);
  assert.match(texto, /Mima's Kitchen/);
  assert.equal(await page.locator('[aria-label^="Opciones de"]').count(), 0, 'sin menú de editar ni desactivar');
  // Entrar al espacio de un cliente sí: eso no cambia nada.
  assert.ok(await page.locator('[aria-label="Abrir el espacio de Mima\'s Kitchen"]').count() > 0);
  await page.screenshot({ path: shot('02-sin-permiso.png'), fullPage: true, animations: 'disabled' });

  // 3. Con el permiso: la operación completa, pero sin las acciones del cargo.
  await page.locator('[data-view-option="permiso"]').click();
  await page.getByRole('tab', { name: 'Operación' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Nuevo cliente' }).count(), 0, 'ver no es crear clientes');
  await page.getByRole('tab', { name: 'Directorio' }).click();
  assert.equal(await page.locator('[aria-label^="Opciones de"]').count(), 0);
  await page.screenshot({ path: shot('03-con-permiso.png'), fullPage: true, animations: 'disabled' });

  // 4. Un administrador conserva todo lo de siempre, sin dividir la lista.
  await page.locator('[data-view-option="admin"]').click();
  await page.getByRole('tab', { name: 'Directorio' }).click();
  assert.equal(await page.locator('[data-directory-mine]').count(), 0, 'un manager conserva la lista de siempre');
  assert.ok(await page.getByRole('button', { name: 'Nuevo cliente' }).count() > 0);
  assert.ok(await page.locator('[aria-label^="Opciones de"]').count() > 0);
  assert.ok(await page.getByLabel('Community manager').count() > 0);

  // 5. Oscuro y celular.
  await page.locator('[data-view-option="cm"]').click();
  await page.locator('[data-toggle-theme]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: shot('04-oscuro.png'), fullPage: true, animations: 'disabled' });
  await page.locator('[data-toggle-theme]').click();

  await page.setViewportSize({ width: 390, height: 1300 });
  await page.waitForTimeout(400);
  // Las tablas se desplazan dentro de su tarjeta; la página no. Sin `relative` en la tarjeta, el
  // `sr-only` de la columna de acciones —absoluto— se colocaba fuera del recorte y estiraba la página.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `se sale a lo ancho ${overflow}px`);
  await page.screenshot({ path: shot('05-celular.png'), fullPage: true, animations: 'disabled' });

  assert.deepEqual(errors, [], `errores de la pantalla: ${errors.join(' | ')}`);
  console.log('Permiso de clientes: recorrido completo. Capturas en output/permiso-clientes/');
} finally {
  await browser.close();
}
