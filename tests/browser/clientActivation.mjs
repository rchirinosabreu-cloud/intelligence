// Flujo real del directorio con API aislada; no carga .env ni contacta producción.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '../..');
const server = await createServer({
  configFile: false, root, envDir: path.join(root, 'tests/fixtures'),
  optimizeDeps: { entries: ['tests/fixtures/client-edit-preview.html'] },
  esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': path.join(root, 'src') } },
  define: { 'import.meta.env.VITE_API_URL': 'window.location.origin' },
  logLevel: 'error', server: { host: '127.0.0.1', port: 0, proxy: {} },
});
let browser;
try {
  await server.listen();
  await mkdir(path.join(root, 'output/client-scope'), { recursive: true });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(60000);
    const user = { id: 'test-admin', name: 'Dirección', role: 'ADMIN' };
    const client = {
      id: 'sample', name: 'Cliente de muestra', slug: 'sample', isArchived: false,
      responsible: { id: 'cm', name: 'Community actual' }, projectManager: { id: 'pm', name: 'PM actual' },
    };
    let rejectNext = false;
    let patchCount = 0;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(({ user }) => {
      localStorage.setItem('currentUser', JSON.stringify(user));
      localStorage.setItem('authToken', `x.${btoa(JSON.stringify({ exp: 4102444800 }))}.x`);
    }, { user });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let body = [];
      let status = 200;
      if (url.pathname === '/api/auth/me') body = user;
      if (url.pathname === '/api/clients') body = [client];
      if (url.pathname === '/api/clients/sample/archive') {
        patchCount += 1;
        const input = route.request().postDataJSON();
        assert.deepEqual(Object.keys(input), ['isArchived'], 'no se envían contratos ni responsables');
        if (rejectNext) { status = 500; body = { error: 'No se pudo cambiar el estado' }; rejectNext = false; }
        else { client.isArchived = input.isArchived; body = client; }
      }
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`${origin}/tests/fixtures/client-edit-preview.html?tab=directorio`);
    await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
    const active = page.getByRole('region', { name: 'Clientes activos', exact: true });
    const inactive = page.getByRole('region', { name: 'Clientes inactivos', exact: true });
    const options = () => page.getByRole('button', { name: 'Opciones de Cliente de muestra' });
    await options().click();
    await page.getByRole('menuitem', { name: 'Desactivar cliente' }).click();
    const confirm = page.getByRole('alertdialog');
    await confirm.waitFor();
    assert.match(await confirm.innerText(), /historial/i);
    assert.equal(patchCount, 0, 'abrir la confirmación no cambia el cliente');
    await confirm.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(patchCount, 0, 'cancelar no envía cambios');
    assert.match(await active.innerText(), /Cliente de muestra/);

    await options().click();
    await page.getByRole('menuitem', { name: 'Desactivar cliente' }).click();
    await confirm.getByRole('button', { name: 'Desactivar', exact: true }).click();
    await page.getByText('Cliente desactivado', { exact: true }).waitFor();
    assert.equal(patchCount, 1);
    assert.doesNotMatch(await active.innerText(), /Cliente de muestra/);
    await page.getByRole('button', { name: 'Clientes inactivos (1)' }).click();
    assert.match(await inactive.innerText(), /Community actual/);
    assert.match(await inactive.innerText(), /PM actual/);
    await page.screenshot({ path: path.join(root, `output/client-scope/clientes-inactivos-${theme}.png`) });

    // El conteo dice cuántos están en operación y cuántos en el historial (10 de noviembre de 2026).
    assert.match(await page.locator('[data-directory-count]').innerText(), /0 clientes activos[\s\S]*1 inactivo/);
    // Reactivar va a la vista, no dentro de un menú: los clientes que vuelven no se buscan.
    const reactivate = () => inactive.getByRole('button', { name: 'Reactivar', exact: true });
    rejectNext = true;
    await reactivate().click();
    await confirm.getByRole('button', { name: 'Reactivar', exact: true }).click();
    await page.getByText('No se pudo cambiar el estado', { exact: true }).waitFor();
    assert.match(await inactive.innerText(), /Cliente de muestra/, 'el fallo conserva el estado visible');
    await reactivate().click();
    await confirm.getByRole('button', { name: 'Reactivar', exact: true }).click();
    await page.getByText('Cliente reactivado', { exact: true }).waitFor();
    assert.match(await active.innerText(), /Cliente de muestra/);
    assert.match(await page.locator('[data-directory-count]').innerText(), /1 cliente activo/);
    await page.screenshot({ path: path.join(root, `output/client-scope/directorio-conteo-${theme}.png`) });
    assert.equal(client.isArchived, false);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Desactivar, cancelar, fallo y reactivar: correctos en claro y oscuro.');
} finally {
  await browser?.close();
  await server.close();
}
