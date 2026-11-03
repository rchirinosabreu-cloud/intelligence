// Existing entry point: the new recognition panel plus the unchanged Bria notice.
import './recognitionPanel.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createBriaPreview } from '../../scripts/preview-bria.js';

const preview = await createBriaPreview({ port: 3762 });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultNavigationTimeout(90000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('output/recognition-panel', { recursive: true });
try {
  for (const theme of ['claro', 'oscuro']) {
    await page.goto(`${preview.origin}/?liga${theme === 'oscuro' ? '&dark' : ''}`);
    const nudge = page.getByRole('status', { name: 'Aviso de Bria' });
    await nudge.waitFor();
    assert.equal(await nudge.getAttribute('data-bria-nudge'), 'LIGA_DIA');
    assert.match(await nudge.locator('[data-bria-nudge-delta]').innerText(), /\+15 hoy/);
    assert.match(await nudge.locator('[data-bria-nudge-progress]').innerText(), /Vas 6\.º de 13/);
    assert.equal(await nudge.getByRole('link', { name: 'Ver la carrera' }).getAttribute('href'), '/dashboard?carrera');
    await nudge.screenshot({ path: `output/recognition-panel/aviso-bria-${theme}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('Existing Bria notice and legacy deep link verified.');
} finally { await browser.close(); await preview.close(); }
