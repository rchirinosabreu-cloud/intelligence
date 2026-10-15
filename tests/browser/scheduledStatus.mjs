// Recorrido real del estado «Programado» en el editor de parrilla (15 de octubre de 2026).
//
// Se mira la pieza que está programada en Instagram y ya publicada en Facebook: su estado lo lleva la
// cola, así que el desplegable de Estado tiene que decirlo y no dejarse escribir. Antes ponerla a mano
// en «Publicado» cancelaba la publicación que faltaba y el reel no salía.
//
//   node tests/browser/scheduledStatus.mjs
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const PAGE = '/tests/fixtures/plan-editor-preview.html';
const OUT = process.env.SHOT_DIR || 'tests/screenshots/estado-programado';
await mkdir(OUT, { recursive: true });

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0, open: false } });
await server.listen();
const base = `http://127.0.0.1:${server.config.server.port}`;

const browser = await chromium.launch({ channel: 'chrome' });
const problems = [];
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: theme });
    const page = await context.newPage();
    // La muestra no tiene backend: el refresco de sesión y las miniaturas responden 500 a propósito.
    const noise = /Auth refresh|asset preview|Failed to load resource/i;
    page.on('console', (msg) => { if (msg.type() === 'error' && !noise.test(msg.text())) problems.push(`${theme}: ${msg.text()}`); });
    page.on('pageerror', (error) => { if (!noise.test(error.message)) problems.push(`${theme}: ${error.message}`); });
    await page.goto(`${base}${PAGE}`, { waitUntil: 'networkidle' });
    // La muestra no sigue `prefers-color-scheme`: el tema va por la clase `dark` del `<html>`, igual
    // que en la plataforma. Sin esto, la pasada «oscura» salía clara y no comprobaba nada.
    await page.evaluate((mode) => document.documentElement.classList.toggle('dark', mode === 'dark'), theme);

    await page.getByText('Qué llevar el día de tu consulta').first().click();
    await page.waitForTimeout(900);

    const reason = page.locator('[data-piece-queue-owns-status]');
    const visible = await reason.isVisible().catch(() => false);
    const text = (await reason.textContent().catch(() => ''))?.trim() || '';
    // El `Select` compartido dibuja su propia lista accesible en escritorio: lo que muestra es su texto,
    // no el `value` de un `<select>` nativo.
    const value = await page.evaluate(() => {
      const field = document.querySelector('[aria-label="Estado de la pieza"]');
      if (!field) return 'sin campo';
      // El `Select` compartido dibuja su propia lista accesible en escritorio: lo que vale es lo que se
      // lee en el control, no el `value` de un `<select>` nativo.
      return (field.value || field.innerText || field.getAttribute('data-value') || '').toString().trim()
        || (field.closest('div')?.innerText || '').split('\n')[0].trim();
    });
    console.log(`[${theme}] estado del desplegable: ${value}`);
    console.log(`[${theme}] explicación visible: ${visible}`);
    console.log(`[${theme}] dice: ${text.slice(0, 160)}`);
    if (!visible) problems.push(`${theme}: la explicación de la cola no se ve`);
    if (!/programado/i.test(value)) problems.push(`${theme}: el desplegable muestra «${value}» y no «Programado»`);
    if (!/Sale sola/i.test(text)) problems.push(`${theme}: la explicación no dice que sale sola`);
    if (text.length > 110) problems.push(`${theme}: la explicación ocupa ${text.length} caracteres en una columna de 176 px`);

    await page.screenshot({ path: `${OUT}/${theme}-editor.png` });
    await page.locator('nav').first().screenshot({ path: `${OUT}/${theme}-carril.png` });
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (problems.length) {
  console.error(`\nFALLÓ:\n- ${problems.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`\nTodo bien. Capturas en ${OUT}`);
}
