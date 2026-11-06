import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createNavigationPreview } from '../../scripts/preview-navigation.js';

test('proteger, introducir clave y volver a bloquear oculta el contenido en Drive', async () => {
  const preview = await createNavigationPreview({ port: 0 });
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(7000);
  let passwordProtected = false, unlocked = false;
  const folder = () => ({ id: 'private-folder', name: 'Documentos privados', canManagePassword: true, passwordProtected, locked: passwordProtected && !unlocked });
  try {
    await page.route('**/api/drive/**', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.endsWith('/password')) { passwordProtected = true; unlocked = false; return route.fulfill({ json: { success: true } }); }
      if (url.pathname.endsWith('/unlock')) {
        if (request.postDataJSON().password !== 'Clave de prueba 2026') return route.fulfill({ status: 422, json: { message: 'La contraseña no es correcta.' } });
        unlocked = true; return route.fulfill({ json: { success: true } });
      }
      if (url.pathname.endsWith('/lock')) { unlocked = false; return route.fulfill({ json: { success: true } }); }
      if (url.pathname.endsWith('/contents')) {
        if (url.searchParams.has('folderId') && !unlocked) return route.fulfill({ status: 423, json: { error: 'DRIVE_FOLDER_LOCKED', message: 'Introduce la contraseña para abrir esta carpeta.', folderId: 'private-folder' } });
        return route.fulfill({ json: url.searchParams.has('folderId') ? { currentFolder: folder(), breadcrumbs: [folder()], folders: [], files: [{ id: 'private-file', kind: 'UPLOAD', name: 'Contrato reservado.pdf', mimeType: 'application/pdf' }] }
          : { folders: [folder()], files: [] } });
      }
      return route.fulfill({ status: 404, json: {} });
    });
    await page.goto(`${preview.origin}/drive`);
    await page.getByRole('button', { name: 'Proteger Documentos privados' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nueva contraseña', { exact: true }).fill('Clave de prueba 2026');
    await dialog.getByLabel('Repetir contraseña', { exact: true }).fill('Clave de prueba 2026');
    await dialog.getByRole('button', { name: 'Guardar contraseña', exact: true }).click();
    await page.getByRole('button', { name: /^Documentos privados/ }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
    await dialog.getByRole('button', { name: 'Desbloquear', exact: true }).click();
    await dialog.getByText('La contraseña no es correcta.').waitFor();
    assert.equal(await page.getByText('Contrato reservado.pdf', { exact: true }).count(), 0);
    await mkdir('output/drive-password', { recursive: true });
    await page.screenshot({ path: 'output/drive-password/clave-incorrecta.png' });
    await dialog.getByLabel('Contraseña', { exact: true }).fill('Clave de prueba 2026');
    await dialog.getByRole('button', { name: 'Desbloquear', exact: true }).click();
    await page.getByText('Contrato reservado.pdf', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Bloquear carpetas', exact: true }).click();
    await page.getByText('Introduce la contraseña para abrir esta carpeta.', { exact: true }).first().waitFor();
    assert.equal(await page.getByText('Contrato reservado.pdf', { exact: true }).count(), 0);
    await page.screenshot({ path: 'output/drive-password/bloqueado.png' });
  } finally { await page.close(); await browser.close(); await preview.close(); }
});
