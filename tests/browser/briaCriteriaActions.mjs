import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await mkdir('output', { recursive: true }); await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const [name, width, height, dark] of [['desktop', 1366, 1000, false], ['mobile', 390, 844, false], ['tablet', 768, 1024, false], ['dark', 390, 844, true], ['small-mobile', 320, 568, false], ['landscape', 844, 390, false]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' }); page.setDefaultTimeout(8000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let admin = true, fail = false, removed = false, deleting = null, deletionCalls = 0;
    const criteria = [
      { id: 'approved', category: 'MARCA', status: 'APPROVED', version: 2, text: 'Usar un tono cercano, profesional y sin promesas exageradas.', history: [] },
      { id: 'proposed', category: 'ESTRATEGIA', status: 'PROPOSED', version: 1, text: 'En contenidos de conversión, incluir una llamada a la acción alineada con el objetivo.', history: [] }
    ];
    await page.route('**/api/**', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { clientId: 'client', clientName: 'Cliente de ejemplo', canPropose: true, criteria: criteria.filter(c => !removed || c.id !== 'approved').map(c => ({ ...c, canValidate: true, canDelete: admin })) } });
      assert.equal(route.request().method(), 'DELETE'); deletionCalls++;
      assert.ok(route.request().url().endsWith('/criteria/approved'));
      assert.deepEqual(route.request().postDataJSON(), { version: 2, confirmation: 'ELIMINAR' });
      if (deleting) await new Promise(resolve => { deleting.resolve = resolve; });
      if (fail) return route.fulfill({ status: 500, json: { error: 'No se pudo eliminar. Intenta nuevamente.' } });
      removed = true;
      return route.fulfill({ json: { deleted: true, id: 'approved' } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/bria-criteria.html`);
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
    await page.getByRole('button', { name: 'Criterios del cliente', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText(criteria[0].text, { exact: true }).waitFor();
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[role=dialog]')).opacity) === 1);
    const description = await dialog.getByText('Solo los criterios aprobados se usan', { exact: false }).boundingBox();
    const propose = await dialog.getByRole('button', { name: 'Proponer criterio', exact: true }).boundingBox();
    assert.ok(propose.y >= description.y + description.height + 10, `${name}: propose must sit below description`);
    assert.ok(Math.abs(propose.x - description.x) < 2, `${name}: propose must align left`);
    const approved = dialog.locator('article').filter({ hasText: criteria[0].text });
    const proposed = dialog.locator('article').filter({ hasText: criteria[1].text });
    assert.deepEqual(await proposed.getByRole('button').allTextContents(), ['⋯', 'Aprobar', 'Rechazar', 'Ver detalle']);
    assert.deepEqual(await approved.getByRole('button').allTextContents(), ['⋯', 'Ver detalle']);
    for (const label of ['Aprobar', 'Rechazar']) {
      const action = dialog.getByRole('button', { name: label, exact: true }).first();
      const style = await action.evaluate(button => {
        const css = getComputedStyle(button), rect = button.getBoundingClientRect();
        const context = document.createElement('canvas').getContext('2d');
        const rgb = color => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3); };
        const luminance = color => rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        let surface = button.parentElement;
        while (getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement;
        const values = [luminance(css.color), luminance(getComputedStyle(surface).backgroundColor)].sort((a, b) => a - b);
        return { background: css.backgroundColor, border: css.borderWidth, shadow: css.boxShadow, width: rect.width, height: rect.height, color: rgb(css.color), contrast: (values[1] + .05) / (values[0] + .05) };
      });
      assert.equal(style.background, 'rgba(0, 0, 0, 0)'); assert.equal(style.border, '0px');
      assert.ok(style.shadow === 'none' || style.shadow.replaceAll('rgba(0, 0, 0, 0) 0px 0px 0px 0px', '').replaceAll(', ', '') === '', `${label}: no visible shadow`);
      assert.ok(style.width >= 44 && style.height >= 44, `${label}: touch target`);
      if (label === 'Aprobar') assert.ok(style.color[1] > style.color[0] * 1.5 && style.color[2] > style.color[0] * 1.5, `${label}: turquoise text`);
      else assert.ok(Math.max(...style.color) - Math.min(...style.color) < 20, `${label}: neutral text`);
      assert.ok(style.contrast >= 4.5, `${name}/${label}: contrast ${style.contrast}`);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `output/bria-criteria-actions-${name}.png`, fullPage: true });
    const openApprovedMenu = async () => {
      await approved.getByRole('button', { name: 'Más opciones', exact: true }).click();
      const menu = page.getByRole('menu');
      await menu.waitFor();
      await menu.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
      assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['Revocar', 'Eliminar']);
      for (const item of await menu.getByRole('menuitem').all()) {
        const css = await item.evaluate(element => ({ color: getComputedStyle(element).color, height: element.getBoundingClientRect().height, semantic: element.classList.contains('text-destructive') }));
        assert.ok(css.semantic && css.height >= 44, `destructive menu action with touch target: ${JSON.stringify(css)}`);
        for (const focused of [false, true]) {
          if (focused) await item.focus();
          await item.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
          const contrast = await item.evaluate(element => {
            const context = document.createElement('canvas').getContext('2d');
            const luminance = color => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0); };
            let surface = element;
            while (getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement;
            const values = [luminance(getComputedStyle(element).color), luminance(getComputedStyle(surface).backgroundColor)].sort((a, b) => a - b);
            return (values[1] + .05) / (values[0] + .05);
          });
          assert.ok(contrast >= 4.5, `${name}: menu ${await item.textContent()} ${focused ? 'focused' : 'normal'} contrast ${contrast}`);
        }
      }
    };
    await openApprovedMenu();
    await page.screenshot({ path: `output/bria-criteria-menu-${name}.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await page.getByRole('menu').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Más opciones');
    assert.equal(await dialog.isVisible(), true, 'Escape closes only the menu');
    assert.equal(await approved.getByRole('button', { name: 'Más opciones', exact: true }).evaluate(el => el === document.activeElement), true);
    await openApprovedMenu();
    await page.getByRole('menuitem', { name: 'Eliminar', exact: true }).click();
    await dialog.getByText('Esta acción no se puede deshacer.', { exact: false }).waitFor();
    const confirm = dialog.getByRole('button', { name: 'Eliminar definitivamente', exact: true });
    assert.equal(await confirm.isDisabled(), true);
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click(); assert.equal(deletionCalls, 0);
    await openApprovedMenu();
    await page.getByRole('menuitem', { name: 'Eliminar', exact: true }).click();
    await dialog.getByLabel('Escribe ELIMINAR para confirmar').fill('ELIMINAR');
    await confirm.evaluate(async button => { await Promise.all(button.getAnimations().map(animation => animation.finished)); });
    await page.screenshot({ path: `output/bria-criteria-delete-${name}.png`, fullPage: true });
    fail = true; await confirm.click(); await dialog.getByRole('alert').waitFor();
    assert.equal(await dialog.getByLabel('Escribe ELIMINAR para confirmar').inputValue(), 'ELIMINAR'); assert.equal(removed, false);
    fail = false; deleting = {}; await confirm.click();
    await page.waitForFunction(() => document.querySelector('button[data-saving="true"]'));
    assert.equal(removed, false); assert.equal(await dialog.getByLabel('Escribe ELIMINAR para confirmar').count(), 1);
    deleting.resolve(); deleting = null;
    await dialog.getByText(criteria[1].text, { exact: true }).waitFor();
    assert.equal(await dialog.getByText(criteria[0].text, { exact: true }).count(), 0);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    admin = false;
    await page.getByRole('button', { name: 'Criterios del cliente', exact: true }).click();
    await dialog.getByText(criteria[1].text, { exact: true }).waitFor();
    await proposed.getByRole('button', { name: 'Más opciones', exact: true }).click();
    assert.deepEqual(await page.getByRole('menuitem').allTextContents(), ['Ajustar']);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.getByRole('button', { name: 'Aprobar', exact: true }).count(), 1);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `${name}: 200% text overflow`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.mouse.click(3, 3); await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    console.log(`${name}: hierarchy, text actions, AA contrast, admin deletion confirmation/server-first and non-admin UI OK`);
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }
