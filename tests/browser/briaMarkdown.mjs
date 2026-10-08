import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createBriaPreview } from '../../scripts/preview-bria.js';
const preview = await createBriaPreview({ port: 3733 });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage();
const markdown = '# Revisión\n\n**Fecha confirmada** y *propuesta*.\n\n- Primera pieza\n- Segunda pieza\n\n| Archivo | Estado |\n| --- | --- |\n| `demostracion.xlsx` | **Leído** |\n\nImagen: `demostracion.png`.\n\n```json\n{"estado":"leído"}\n```';
try {
  await page.route('**/api/bria/conversations/*/messages', async route => {
    const original = await route.fetch(); const row = await original.json(); row.turns.at(-1).text = markdown;
    await route.fulfill({ response: original, json: row });
  });
  await page.goto(`${preview.origin}/?abierta`);
  await page.getByLabel('Mensaje para Bria').fill('Prueba de formato');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  const answer = page.locator('[data-conversation-turn="assistant"]').last();
  await answer.locator('table code').waitFor();
  for (const dark of [false, true]) {
    await page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
    assert.equal(await answer.locator('table code').innerText(), 'demostracion.xlsx');
    const decoration = await answer.locator('table code').evaluate(code => ({ before: getComputedStyle(code, '::before').content, after: getComputedStyle(code, '::after').content }));
    for (const content of Object.values(decoration)) assert.ok(['none', 'normal', '""'].includes(content), `No literal formatting delimiters in ${dark ? 'dark' : 'light'}: ${content}`);
    assert.equal(await answer.locator('h1').innerText(), 'Revisión');
    assert.equal(await answer.locator('li').count(), 2);
    assert.equal(await answer.locator('strong').count(), 2);
    assert.equal(await answer.locator('em').innerText(), 'propuesta');
    assert.equal(await answer.locator('pre code').innerText(), '{"estado":"leído"}\n');
  }
  console.log('Rich text, tables and code render without decorative backticks in both themes.');
} finally { await browser.close(); await preview.close(); }
