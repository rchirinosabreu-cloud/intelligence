import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { chooseOption, nativeSelect } from './selectHelpers.mjs';
const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  await page.goto(base);
  await page.getByRole('button', { name: /Cartera/ }).click();
  const row = page.getByRole('button', { name: /Cliente de muestra/ });
  await row.waitFor();
  assert.match(await row.innerText(), /800[.,]000/);
  await page.getByText('1 deudores', { exact: true }).waitFor();
  assert.match(await row.innerText(), /Sin vencimiento/);
  await row.click();
  assert.match(await page.locator('body').innerText(), /septiembre de 2026/i);
  await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await chooseOption(page.getByLabel('Origen del pago'), 'EXISTING');
  await chooseOption(page.getByLabel('Ingreso registrado'), 'demo-record-0');
  assert.match(await page.getByRole('dialog').innerText(), /No se creará otro ingreso/);
  const controlsAlign = await page.getByRole('dialog').evaluate(dialog => {
    const labels = [...dialog.querySelectorAll('label')];
    const dateY = labels.find(label => label.textContent.startsWith('Fecha')).querySelector('input').getBoundingClientRect().y;
    const accountY = labels.find(label => label.textContent.startsWith('Cuenta')).querySelector('[data-brain-select], select:not([aria-hidden="true"])').getBoundingClientRect().y;
    return Math.abs(dateY - accountY) <= 1;
  });
  assert.ok(controlsAlign, 'date and account controls must align below their labels');
  await page.screenshot({ path: 'output/financial-payment-preview.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Guardar pago', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.match(await row.innerText(), /600[.,]000/);
  await page.getByRole('button', { name: 'Clientes', exact: true }).click();
  assert.match(await page.locator('tbody').innerText(), /600[.,]000/);
  await page.getByRole('button', { name: /Cartera/ }).click();
  await page.screenshot({ path: 'output/financial-cartera-preview.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Cambiar tema' }).click();
  await page.screenshot({ path: 'output/financial-cartera-dark.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'mobile must not overflow the viewport');
  await row.scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.screenshot({ path: 'output/financial-cartera-mobile.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole('button', { name: 'Cambiar tema' }).click();
  await page.getByRole('button', { name: 'Movimientos', exact: true }).click();
  const ledgerPages = page.getByRole('navigation', { name: 'Paginación de movimientos' });
  await ledgerPages.getByText('Página 1 de 3').waitFor();
  await ledgerPages.getByRole('button', { name: 'Siguiente' }).click();
  await ledgerPages.getByText('Página 2 de 3').waitFor();
  await ledgerPages.getByRole('button', { name: 'Siguiente' }).click();
  await ledgerPages.getByText('Página 3 de 3').waitFor();
  assert.match(await page.locator('tbody').innerText(), /Ingreso de muestra 62/);
  await page.screenshot({ path: 'output/financial-ledger-preview.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Conciliación', exact: true }).click();
  await page.getByText('Conciliado', { exact: true }).waitFor();
  const bankPages = page.getByRole('navigation', { name: 'Paginación de conciliación' });
  for (let i = 0; i < 4; i++) await bankPages.getByRole('button', { name: 'Siguiente' }).click();
  await bankPages.getByText('Página 5 de 5').waitFor();
  await page.getByText('Movimiento bancario 90', { exact: true }).waitFor();
  await page.screenshot({ path: 'output/financial-bank-preview.png', fullPage: true, animations: 'disabled' });
  await page.goto(`${base}?paymentError=1`);
  await page.getByRole('button', { name: /Cartera/ }).click();
  await page.getByRole('button', { name: /Cliente de muestra/ }).click();
  await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await chooseOption(page.getByLabel('Concepto del ingreso'), 'SERVICIO');
  await chooseOption(page.getByRole('dialog').getByLabel('Cuenta'), 'demo-account');
  await page.getByRole('button', { name: 'Guardar pago', exact: true }).click();
  await page.getByRole('dialog').getByText('Pago no guardado (simulado)').waitFor();
  assert.equal(await page.getByText('Pago de cartera registrado.').count(), 0);
  await page.goto(`${base}?carteraError=1`);
  await page.getByRole('button', { name: /Cartera/ }).click();
  await page.getByText('No fue posible cargar la cartera.').waitFor();
  assert.equal(await page.getByText('¡Cartera 100% al día!').count(), 0);
  await page.goto(`${base}?viewer=reader`);
  await page.getByRole('button', { name: /Cartera/ }).click();
  await page.getByRole('button', { name: /Cliente de muestra/ }).click();
  assert.equal(await page.getByRole('button', { name: 'Registrar pago', exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Estado de seguimiento').isDisabled(), true);
  await page.goto(`${base}?legacyPaid=1`);
  await page.getByRole('button', { name: /Cartera/ }).click();
  const legacyRow = page.getByRole('button', { name: /Cliente de muestra/ });
  assert.match(await legacyRow.innerText(), /Saldo por verificar/);
  assert.doesNotMatch(await legacyRow.innerText(), /Sin saldo pendiente/);
  await legacyRow.click();
  assert.equal(await page.getByRole('button', { name: 'Registrar pago', exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Estado de seguimiento').isDisabled(), true);
  await page.getByRole('alert').filter({ hasText: /históricos marcados como pagados/ }).waitFor();
  await page.screenshot({ path: 'output/financial-legacy-review.png', fullPage: true, animations: 'disabled' });

  // Filtro por categoría: la bolsa que se muestra es la de toda la selección, no la de la página.
  await page.goto(base);
  await page.getByRole('button', { name: 'Movimientos', exact: true }).click();
  const bag = async label => (await page.getByText(label, { exact: true }).locator('xpath=following-sibling::p').innerText()).replace(/\s/g, '');
  await page.getByText('Movimientos de la selección', { exact: true }).waitFor();
  assert.equal(await bag('Movimientos de la selección'), '62');
  assert.match(await bag('Ingresos de la selección'), /1\.100\.000/);
  await chooseOption(page.getByRole('combobox', { name: 'Categoría del movimiento' }), 'ADMINISTRATIVO');
  await page.getByText('10', { exact: true }).waitFor();
  // 10 de 62: el total es el de la selección completa, no el de los 25 de la página.
  assert.equal(await bag('Movimientos de la selección'), '10');
  assert.match(await bag('Egresos de la selección'), /100\.000/);
  assert.match(await bag('Ingresos de la selección'), /\$0/);
  assert.match(await page.locator('tbody').innerText(), /Gasto administrativo/);
  assert.doesNotMatch(await page.locator('tbody').innerText(), /Ingreso de muestra/);
  await page.screenshot({ path: 'output/financial-ledger-category.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Quitar filtros', exact: true }).click();
  assert.equal(await bag('Movimientos de la selección'), '62');

  // Un cliente archivado sigue debiendo: tiene que poder elegirse, marcado y después de los activos.
  await page.getByRole('button', { name: 'Registrar movimiento', exact: true }).click();
  const clientSelect = page.getByRole('dialog').getByRole('combobox', { name: 'Cliente' });
  const clientNames = await nativeSelect(clientSelect).locator('option').allInnerTexts();
  assert.deepEqual(clientNames, ['Sin cliente relacionado', 'Cliente de muestra', 'Cliente archivado · archivado']);
  await chooseOption(clientSelect, 'demo-archived');
  await page.screenshot({ path: 'output/financial-archived-client.png', animations: 'disabled' });
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });

  // Reversión de un abono: exige motivo, devuelve el saldo y conserva el abono como evidencia.
  await page.getByRole('button', { name: /Cartera/ }).click();
  const reversalRow = page.getByRole('button', { name: /Cliente de muestra/ });
  await reversalRow.click();
  await page.getByText('ABONOS DE ESTA OBLIGACIÓN', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Revertir', exact: true }).click();
  const reversalDialog = page.getByRole('dialog');
  assert.match(await reversalDialog.innerText(), /deja de descontar saldo/);
  assert.equal(await reversalDialog.getByRole('button', { name: 'Revertir abono', exact: true }).isDisabled(), true, 'reversal must require a reason');
  await reversalDialog.getByRole('textbox').fill('Se digitaron 500 en vez de 500.000');
  await page.screenshot({ path: 'output/financial-payment-reversal.png', animations: 'disabled' });
  await reversalDialog.getByRole('button', { name: 'Revertir abono', exact: true }).click();
  await reversalDialog.waitFor({ state: 'hidden' });
  // El abono ya no descuenta: el saldo vuelve a los 1.200.000 originales.
  await page.getByText('Sin abonos vigentes.', { exact: true }).waitFor();
  assert.match(await reversalRow.innerText(), /1[.,]200[.,]000/);
  // La vista diaria queda limpia, pero la evidencia sigue a un clic.
  assert.equal(await page.getByText('Revertido: Se digitaron 500 en vez de 500.000', { exact: false }).count(), 0, 'a reversed payment is hidden by default');
  await page.getByRole('button', { name: 'Ver 1 abono revertido', exact: true }).click();
  await page.getByText('Revertido: Se digitaron 500 en vez de 500.000', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Revertir', exact: true }).count(), 0, 'a reversed payment cannot be reversed again');
  await page.getByRole('button', { name: 'Ocultar 1 abono revertido', exact: true }).click();
  assert.equal(await page.getByText('Revertido: Se digitaron 500 en vez de 500.000', { exact: false }).count(), 0);
  await page.getByRole('button', { name: 'Ver 1 abono revertido', exact: true }).click();
  await page.screenshot({ path: 'output/financial-payment-reversed.png', fullPage: true, animations: 'disabled' });

  console.log('Financial browser: balances, existing income application, cache, read-only, dates, errors, light/dark/mobile, category filter and payment reversal verified.');
} finally { await browser.close(); }
