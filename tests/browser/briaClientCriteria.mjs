import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await mkdir('output', { recursive: true });
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const [name, width, height, dark] of [['desktop', 1366, 1000, false], ['mobile', 390, 844, false], ['tablet', 768, 1024, false], ['mobile-dark', 390, 844, true], ['small-mobile', 320, 568, false], ['landscape', 844, 390, false]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let writable = true, fail = false, hold;
    let result = { clientId: 'client', clientName: 'Cliente de ejemplo', canPropose: true, criteria: [{ id: 'criterion', text: 'Usar un tono cercano y tratar a la audiencia de tú.', category: 'MARCA', status: 'PROPOSED', version: 1,
      history: [{ action: 'PROPOSE', actorName: 'Responsable de ejemplo', actorRole: 'EDITOR', at: '2026-09-06T12:00:00Z', reason: 'La guía actual del cliente define este tratamiento.', version: 1 }] }] };
    await page.route('**/api/**', async route => {
      const request = route.request();
      if (request.method() === 'GET') return route.fulfill({ json: { ...result, criteria: result.criteria.map(item => ({ ...item, canValidate: writable })) } });
      if (hold) await new Promise(resolve => { hold.resolve = resolve; });
      if (fail) return route.fulfill({ status: 500, json: { error: 'Error de prueba: no se guardó.' } });
      const body = request.postDataJSON();
      assert.ok(body.reason.trim());
      if (request.method() === 'PATCH') {
        assert.equal(body.version, result.criteria[0].version);
        result.criteria[0] = { ...result.criteria[0], status: body.action === 'REVOKE' ? 'REVOKED' : 'APPROVED', version: body.version + 1,
          history: [...result.criteria[0].history, { action: body.action, reason: body.reason, actorName: 'Validador de ejemplo', actorRole: 'PROJECT_MANAGER', at: new Date().toISOString(), version: body.version + 1 }] };
        return route.fulfill({ json: result.criteria[0] });
      }
      assert.equal(request.method(), 'POST');
      assert.ok(body.requestId);
      const created = { ...body, id: 'new', version: 1, status: 'PROPOSED', history: [] };
      result.criteria.push(created);
      return route.fulfill({ status: 201, json: created });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/bria-criteria.html`);
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
    await page.getByRole('button', { name: 'Criterios del cliente', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Usar un tono cercano y tratar a la audiencia de tú.').waitFor();
    await dialog.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    await page.evaluate(() => document.fonts.ready);
    const contrast = await dialog.locator('[data-bria-header]').evaluate(header => {
      const colors = [...getComputedStyle(header).backgroundImage.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)].map(match => match.slice(1).map(Number));
      const luminance = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      return colors.map(color => 1.05 / (luminance(color) + .05));
    });
    assert.ok(contrast.length >= 2 && contrast.every(ratio => ratio >= 4.5), `White header contrast: ${contrast}`);
    const actionContrast = await dialog.getByRole('button', { name: 'Rechazar', exact: true }).evaluate(button => {
      let element = button, background;
      while (element) { const color = getComputedStyle(element).backgroundColor; if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') { background = color; break; } element = element.parentElement; }
      const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const values = [luminance(getComputedStyle(button).color), luminance(background)].sort((a, b) => a - b);
      return (values[1] + .05) / (values[0] + .05);
    });
    assert.ok(actionContrast >= 4.5, `${name}: destructive label contrast ${actionContrast}`);
    await page.screenshot({ path: `output/bria-criteria-${name}.png`, fullPage: true });
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height + 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok((await dialog.locator('button').evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().height > 0).map(n => n.getBoundingClientRect().height))).every(h => h >= 44));
    await dialog.getByRole('button', { name: 'Aprobar', exact: true }).click();
    assert.equal(await dialog.getByRole('button', { name: 'Confirmar aprobación' }).isDisabled(), true);
    await dialog.getByLabel('Motivo de la decisión').fill('Confirmado con la guía vigente.');
    fail = true;
    await dialog.getByRole('button', { name: 'Confirmar aprobación' }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Error de prueba' }).waitFor();
    assert.equal(await dialog.getByLabel('Motivo de la decisión').inputValue(), 'Confirmado con la guía vigente.');
    fail = false; hold = {};
    await dialog.getByRole('button', { name: 'Confirmar aprobación' }).click();
    assert.equal(await dialog.getByLabel('Motivo de la decisión').count(), 1);
    await page.waitForFunction(() => document.querySelector('button[disabled][data-saving="true"]'));
    hold.resolve(); hold = null;
    await dialog.getByText('Aprobado', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Historial', exact: true }).click();
    await dialog.getByText('Confirmado con la guía vigente.').waitFor();
    await page.screenshot({ path: `output/bria-criteria-history-${name}.png`, fullPage: true });
    await dialog.getByRole('button', { name: 'Revocar', exact: true }).click();
    await dialog.getByLabel('Motivo de la decisión').fill('La estrategia del cliente cambió.');
    await dialog.getByRole('button', { name: 'Confirmar revocación' }).click();
    await dialog.getByText('Revocado', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Proponer criterio', exact: true }).click();
    await dialog.getByLabel('Criterio', { exact: true }).fill('Evitar promesas de resultados garantizados.');
    await dialog.getByLabel('Por qué debe recordarlo Bria').fill('Restricción confirmada en la guía vigente.');
    assert.equal(await dialog.getByRole('button', { name: 'Guardar propuesta', exact: true }).isEnabled(), true);
    await page.screenshot({ path: `output/bria-criteria-proposal-${name}.png`, fullPage: true });
    await dialog.getByRole('button', { name: 'Guardar propuesta', exact: true }).click();
    await dialog.getByText('Evitar promesas de resultados garantizados.').waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    writable = false;
    await page.getByRole('button', { name: 'Criterios del cliente', exact: true }).click();
    await dialog.getByText('Evitar promesas de resultados garantizados.').waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Aprobar', exact: true }).count(), 0);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const scaled = await dialog.evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth, overflow: [...element.querySelectorAll('*')].filter(child => child.getBoundingClientRect().right > element.getBoundingClientRect().right + 1).map(child => ({ tag: child.tagName, text: child.textContent.slice(0, 50), classes: child.className })) }));
    if (scaled.scroll > scaled.width + 1) await page.screenshot({ path: `output/bria-criteria-overflow-${name}.png`, fullPage: true });
    assert.ok(scaled.scroll <= scaled.width + 1, `${name}: dialog overflow with 200% text ${JSON.stringify(scaled)}`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.mouse.click(4, 4);
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    console.log(`${name}: bounded modal, 44px targets, server-first, proposal/approval/revocation/history, permissions, ESC/outside OK`);
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }
