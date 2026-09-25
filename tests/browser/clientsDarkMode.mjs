// Comprueba en el navegador que la pantalla de Clientes es legible en modo oscuro.
//
// `dark:bg-white/2` no genera CSS —la escala de opacidad de Tailwind va de cinco en cinco— así que en
// oscuro ganaba el `bg-zinc-50/50` que la acompañaba y la cabecera de la tabla quedaba como una banda
// clara sobre fondo oscuro. Lo que se mide aquí no es la clase escrita, sino **el color ya calculado**:
// un fondo claro solo vale si es casi transparente.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const PAGE = '/tests/fixtures/client-edit-preview.html';

const client = (id, name, slug, isArchived = false) => ({
  id, name, slug, isArchived,
  responsible: { id: `m-${id}`, name: 'Melissa', avatarUrl: null },
  agencyContexts: [],
  healthRecords: []
});

const CLIENTS = [
  client('c1', 'PromoGroup IPS', 'promogroup'),
  client('c2', 'ENDOVA', 'endova'),
  client('c3', 'Corporación Titanes', 'titanes'),
  client('c4', 'Elvira Utria', 'elvira-utria', true)
];

/** Un fondo claro (RGB alto) solo es admisible si es casi transparente; si no, tapa el tema oscuro. */
const isLightWash = ({ r, g, b, a }) => (r + g + b) / 3 > 200 && a > 0.1;

const parseColor = (value) => {
  const nums = String(value).match(/[\d.]+/g)?.map(Number) || [];
  return { r: nums[0] ?? 0, g: nums[1] ?? 0, b: nums[2] ?? 0, a: nums[3] ?? (nums.length ? 1 : 0) };
};

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0, open: false } });
let browser;

try {
  await server.listen();
  await mkdir('output', { recursive: true });
  const port = server.httpServer.address().port;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  });

  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });

    // Un solo manejador a propósito: Playwright prueba las rutas empezando por la última registrada,
    // así que un comodín añadido después se come a la ruta concreta que se registró antes.
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (!url.includes('/api/')) return route.continue();
      const archived = url.includes('isArchived=true');
      const body = url.includes('/api/clients')
        ? CLIENTS.filter(entry => entry.isArchived === archived)
        : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.goto(`http://127.0.0.1:${port}${PAGE}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.body.textContent.includes('PromoGroup IPS'));

    // El color ya calculado de la cabecera de la tabla y de las filas.
    const surfaces = await page.evaluate(() => {
      const head = document.querySelector('thead tr');
      const rows = [...document.querySelectorAll('tbody tr')].slice(0, 3);
      const read = (node) => (node ? getComputedStyle(node).backgroundColor : null);
      return { head: read(head), rows: rows.map(read), rowCount: rows.length };
    });

    assert.ok(surfaces.head, 'la tabla de clientes se dibuja');
    assert.ok(surfaces.rowCount > 0, 'y con clientes dentro');

    for (const [where, color] of [['la cabecera', surfaces.head], ...surfaces.rows.map((c, i) => [`la fila ${i + 1}`, c])]) {
      assert.ok(
        !isLightWash(parseColor(color)),
        `${where} no queda clara sobre el fondo oscuro (${color})`
      );
    }

    await page.screenshot({ path: `output/clientes-oscuro-${name}.png`, fullPage: true });
    await page.close();
  }

  console.log('[Clientes] Modo oscuro verificado. Capturas en output/clientes-oscuro-*.png');
} finally {
  await browser?.close();
  await server.close();
}
