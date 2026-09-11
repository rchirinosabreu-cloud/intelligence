import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';

let preview, browser;
before(async () => {
  preview = await createRecognitionPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/mentions', { recursive: true });
});
after(async () => { await browser?.close(); await preview?.close(); });

async function openComposer(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', ...options });
  await page.goto(`${preview.origin}/tests/fixtures/mentions-preview.html`);
  const editor = page.locator('.ProseMirror[contenteditable="true"]');
  await editor.waitFor();
  return { page, editor };
}

for (const method of ['mouse', 'Enter']) {
  test(`mention selected with ${method} replaces the entire evolving query, not only @`, async () => {
    const { page, editor } = await openComposer();
    try {
      await editor.pressSequentially('@sara', { delay: 40 });
      await page.getByRole('button', { name: 'Sara Herrera', exact: true }).waitFor();
      if (method === 'mouse') await page.getByRole('button', { name: 'Sara Herrera', exact: true }).click();
      else await editor.press('Enter');
      assert.equal((await editor.innerText()).trim(), '@Sara Herrera');
      assert.equal(await editor.locator('[data-type="mention"][data-id="sample-sara"]').count(), 1);
      assert.equal(await page.locator('[data-saved-comment]').innerText(), '', 'choosing a mention must not send a comment');
      if (method === 'mouse') await page.screenshot({ path: 'output/mentions/mention-replaced.png', animations: 'disabled' });
    } finally { await page.close(); }
  });
}

test('editing the query then selecting preserves surrounding text and another mention', async () => {
  const { page, editor } = await openComposer();
  try {
    await editor.pressSequentially('Hola @mel', { delay: 35 });
    await page.getByRole('button', { name: 'Melissa Castaño', exact: true }).click();
    await editor.pressSequentially('y @sarx', { delay: 35 });
    await editor.press('Backspace');
    await page.getByRole('button', { name: 'Sara Herrera', exact: true }).waitFor();
    await editor.press('Enter');
    await editor.pressSequentially('revisa esto.');
    assert.equal((await editor.innerText()).trim(), 'Hola @Melissa Castaño y @Sara Herrera revisa esto.');
    assert.equal(await editor.locator('[data-type="mention"]').count(), 2);
    await page.getByRole('button', { name: 'Simular envío', exact: true }).click();
    assert.match(await page.locator('[data-saved-comment]').innerText(), /data-id="sample-sara"/);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.screenshot({ path: 'output/mentions/mentions-dark.png', animations: 'disabled' });
  } finally { await page.close(); }
});

test('a mouse selection inside the task dialog keeps the dialog open and removes the query', async () => {
  const { page } = await openComposer();
  page.setDefaultTimeout(6000);
  try {
    await page.getByRole('button', { name: 'Probar dentro de una tarea' }).click();
    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await editor.pressSequentially('@sar', { delay: 40 });
    await page.getByRole('button', { name: 'Sara Herrera', exact: true }).click();
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.equal((await editor.innerText()).trim(), '@Sara Herrera');
    await page.screenshot({ path: 'output/mentions/mention-dialog.png', animations: 'disabled' });
  } finally { await page.close(); }
});

test('touch selection replaces the query without sending the comment', async () => {
  const { page, editor } = await openComposer({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await editor.pressSequentially('@sar', { delay: 30 });
    await page.getByRole('button', { name: 'Sara Herrera', exact: true }).tap();
    assert.equal((await editor.innerText()).trim(), '@Sara Herrera');
    assert.equal(await page.locator('[data-saved-comment]').innerText(), '');
    await page.screenshot({ path: 'output/mentions/mention-mobile.png', animations: 'disabled' });
  } finally { await page.close(); }
});
