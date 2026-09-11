import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';

let preview, browser;
before(async () => {
  preview = await createRecognitionPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/comment-format', { recursive: true });
});
after(async () => { await browser?.close(); await preview?.close(); });

for (const variant of [
  { name: 'desktop', viewport: { width: 1280, height: 900 } },
  { name: 'mobile-dark', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' },
]) {
  test(`task composer keeps 24px visible below all controls when Format opens (${variant.name})`, async () => {
    const { name, ...options } = variant;
    const page = await browser.newPage(options);
    page.setDefaultTimeout(15000);
    try {
      await page.goto(`${preview.origin}/gestion`);
      await page.getByRole('button', { name: /Nueva tarea/i }).click();
      const panel = page.locator('[data-task-panel-content]');
      const editor = panel.locator('.ProseMirror[contenteditable="true"]').last();
      const shell = panel.locator('[data-rich-text-editor-shell]').last();
      await editor.fill('Observaciones para el equipo.');
      if (name.includes('dark')) await page.evaluate(() => document.documentElement.classList.add('dark'));
      // Arrive at the editor naturally through focus, then position its bottom at
      // the scroll edge, as when scrolling through a long task conversation.
      await shell.evaluate(element => {
        let scroller = element.parentElement;
        while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
        scroller.scrollTop += element.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom;
      });
      const toggle = panel.getByRole('button', { name: 'Opciones de formato' }).last();
      for (const expanded of [true, false, true]) {
        await toggle.click();
        await page.waitForTimeout(360); // 200ms layout animation + temporary anchor release
        const geometry = await shell.evaluate(element => {
          let scroller = element.parentElement;
          while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
          const viewportBottom = Math.min(window.visualViewport.offsetTop + window.visualViewport.height, scroller.getBoundingClientRect().bottom);
          return { gap: viewportBottom - element.getBoundingClientRect().bottom, scrollTop: scroller.scrollTop };
        });
        assert.ok(geometry.gap >= 23.5, `expanded=${expanded}: expected 24px below editor including actions, got ${JSON.stringify(geometry)}`);
        assert.equal((await editor.innerText()).trim(), 'Observaciones para el equipo.');
        assert.equal(await toggle.getAttribute('data-state'), expanded ? 'open' : 'closed');
      }
      await page.screenshot({ path: `output/comment-format/spacing-${name}.png`, animations: 'disabled' });
    } finally { await page.close(); }
  });
}
