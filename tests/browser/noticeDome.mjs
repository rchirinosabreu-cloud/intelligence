// La cúpula de la banda sobre una pantalla real de la plataforma (Rodny, 13 de noviembre de 2026: «muéstrame la cúpula
// cómo se vería en una pantalla real»): la muestra de Operación de clientes —menú, header y tablero— con la banda de
// verdad encima. Deja tres capturas y una hoja en output/avisos-operativos-local/.
//   node tests/browser/noticeDome.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createClientOperationsPreview } from '../../scripts/preview-client-operations.js';
import { PLAN_NOTICE_KIND, planNoticeText } from '../../src/lib/planCloseNotices.js';
import { cycleOf } from '../../src/lib/clientOperations.js';

const OUT = 'output/avisos-operativos-local';
await mkdir(OUT, { recursive: true });

const octubre = cycleOf(2026, 10, 1);
const aviso = (closing) => ({
  id: closing ? 'r1' : 'r2', kind: PLAN_NOTICE_KIND, url: '/clientes/operacion/titanes',
  ...planNoticeText({ clientName: 'Corporación Deportiva Titanes', cycle: octubre, overdue: 2, closing })
});

const TOMAS = [
  // [ruta, cierre (coral) o abierto (verde), tema, ancho, alto, nombre]
  ['/clientes', true, 'light', 1440, 900, 'cupula-real-tablero-coral-claro'],
  ['/clientes/operacion/titanes', false, 'dark', 1440, 900, 'cupula-real-cliente-verde-oscuro'],
  ['/clientes', true, 'light', 390, 844, 'cupula-real-celular-coral']
];

const preview = await createClientOperationsPreview({ port: 0 });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const [ruta, closing, tema, width, height, nombre] of TOMAS) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: tema });
    await page.addInitScript((theme) => { localStorage.setItem('theme', theme); }, tema);
    // Una sola ruta: la consulta devuelve el aviso y «shown»/decisiones responden ok (la muestra rechaza los POST).
    await page.route('**/api/important-notices/**', (route) => route.fulfill({
      json: route.request().url().includes('/current') ? { notice: aviso(closing), nextAt: null } : { ok: true }
    }));
    await page.goto(`${preview.origin}${ruta}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-important-notice]');
    await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), tema === 'dark');
    await page.waitForTimeout(700);
    const band = await page.$eval('[data-important-notice]', (e) => ({ width: e.getBoundingClientRect().width, level: e.dataset.level, hue: getComputedStyle(e).getPropertyValue('--notice-hue').trim() }));
    if (band.width !== width) throw new Error(`la cúpula no ocupa el ancho: ${band.width} de ${width}`);
    if (band.hue !== (closing ? '255 106 104' : '49 170 138')) throw new Error(`tono inesperado para ${band.level}: ${band.hue}`);
    await page.screenshot({ path: `${OUT}/${nombre}.png`, animations: 'disabled' });
    await page.close();
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:28px 32px;background:#f4f4f5;font-family:'Roboto Condensed',sans-serif;color:#18181b;width:1560px}
    h1{font-size:26px;margin:0 0 18px;font-weight:700}.fila{display:flex;gap:16px;align-items:flex-start}figure{margin:0}figcaption{font-size:13px;color:#71717a;margin:0 0 6px}
    img{display:block;border-radius:12px;box-shadow:0 2px 12px rgb(0 0 0/.12)}.grande img{width:1120px}.chica img{width:330px}</style></head><body>
    <h1>La cúpula en la plataforma · Operación de clientes</h1><div class="fila"><div>
    <figure class="grande"><figcaption>Tablero · aviso importante (coral) · claro</figcaption><img src="cupula-real-tablero-coral-claro.png"></figure>
    <figure class="grande" style="margin-top:14px"><figcaption>Página del cliente · seguimiento (verde) · oscuro</figcaption><img src="cupula-real-cliente-verde-oscuro.png"></figure></div>
    <figure class="chica"><figcaption>Celular</figcaption><img src="cupula-real-celular-coral.png"></figure></div></body></html>`;
  await writeFile(`${OUT}/cupula-real.html`, html);
  console.log('Capturas en', OUT);
} finally {
  await browser.close();
  // El servidor de vite no siempre termina de cerrar sus conexiones; no se espera por él para salir.
  await Promise.race([preview.close(), new Promise((resolve) => setTimeout(resolve, 3000))]);
  process.exit(0);
}
