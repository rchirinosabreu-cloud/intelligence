import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

// Las flechas de los hallazgos (Rodny, 15 de octubre de 2026: «la flecha para ver más
// hallazgos en la parrilla, no me está funcionando»).
//
// El carril vive dentro del cuerpo del panel y el panel **abre cerrado** (25 de septiembre
// de 2026). Lo que medía si se puede desplazar solo corría al cambiar el número de
// hallazgos, así que en el caso normal —la revisión ya cargada y la persona abriendo el
// panel después— el carril se medía cuando todavía no existía: las dos flechas se
// quedaban deshabilitadas para siempre, aunque el carril midiera 4824 px dentro de 1252.
//
// Esta comprobación no puede hacerse sin navegador: hace falta medir de verdad.

const findings = Array.from({ length: 13 }, (_, index) => ({
  id: `finding-${index + 1}`,
  status: 'OPEN',
  category: 'CONSISTENCIA',
  severity: index % 3 === 0 ? 'CRITICAL' : 'WARNING',
  title: `Hallazgo ${index + 1}`,
  detail: 'Detalle del hallazgo para la prueba.',
  recommendation: 'Recomendación del hallazgo para la prueba.',
  itemId: 'piece',
  evidenceIds: []
}));

const result = {
  review: {
    summary: 'Hola, revisé esta parrilla y encontré 13 oportunidades prioritarias.',
    verdict: 'REQUIERE_AJUSTES',
    score: 80,
    coverage: 100,
    scope: { complete: true, reviewedItems: 12, totalItems: 12, batchCount: 2, crossBatchTextComparison: false },
    dimensions: Object.fromEntries(['ESTRATEGIA', 'MARCA', 'GRAMATICA', 'CONSISTENCIA'].map(key => [key, { assessable: true }])),
    findings
  },
  evidence: [],
  meta: { planId: 'verification-fixture', state: 'CURRENT', cached: true, memorySourcesUsed: 0, reviewedAt: '2026-10-15T15:00:00Z' }
};

const server = await createServer({
  logLevel: 'error',
  optimizeDeps: { entries: ['tests/fixtures/bria-review.html'] },
  server: { host: '127.0.0.1', port: 0, open: false }
});

let browser;
try {
  await mkdir('output', { recursive: true });
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  });

  for (const [name, width, height, reducedMotion] of [
    ['desktop', 1366, 1000, 'no-preference'],
    ['desktop-reducido', 1366, 1000, 'reduce'],
    ['mobile', 390, 844, 'no-preference']
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ json: result }));
    await page.goto(`http://127.0.0.1:${port}/tests/fixtures/bria-review.html`);

    // El caso de Rodny: la revisión ya está cargada y el panel se abre después.
    await page.getByRole('button', { name: 'Ver más', exact: true }).click();
    await page.locator('[data-bria-finding-card]').first().waitFor();
    await page.evaluate(() => document.fonts.ready);

    const rail = page.locator('[aria-label="Hallazgos de Bria"]');
    const previous = page.getByRole('button', { name: 'Hallazgos anteriores', exact: true });
    const next = page.getByRole('button', { name: 'Siguientes hallazgos', exact: true });
    const scrollLeft = () => rail.evaluate(element => Math.round(element.scrollLeft));
    const settle = async () => {
      // El desplazamiento se anima, así que se espera a que la posición deje de cambiar.
      let last = -1;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const current = await scrollLeft();
        if (current === last) return current;
        last = current;
        await page.waitForTimeout(60);
      }
      return last;
    };

    const measurements = await rail.evaluate(element => ({
      scrollable: element.scrollWidth - element.clientWidth,
      cards: element.querySelectorAll('[data-bria-finding-card]').length
    }));
    assert.equal(measurements.cards, 13, `${name}: deberían dibujarse los 13 hallazgos`);
    assert.ok(measurements.scrollable > 0, `${name}: el carril tiene que poder desplazarse`);

    // Nada más abrir: solo se puede avanzar.
    assert.equal(await previous.isDisabled(), true, `${name}: al principio no hay hallazgos anteriores`);
    assert.equal(
      await next.isDisabled(),
      false,
      `${name}: con ${measurements.scrollable}px por recorrer, la flecha de avanzar tiene que estar habilitada al abrir el panel`
    );
    await page.screenshot({ path: `output/bria-hallazgos-inicio-${name}.png`, fullPage: true });

    // Avanzar mueve el carril de verdad.
    await next.click();
    const afterFirstStep = await settle();
    assert.ok(afterFirstStep > 0, `${name}: la flecha tiene que desplazar el carril (quedó en ${afterFirstStep})`);
    assert.equal(await previous.isDisabled(), false, `${name}: después de avanzar se puede volver`);
    await page.screenshot({ path: `output/bria-hallazgos-avanzado-${name}.png`, fullPage: true });

    // Se llega hasta el último hallazgo y ahí la flecha se apaga.
    for (let step = 0; step < 10 && !(await next.isDisabled()); step += 1) {
      await next.click();
      await settle();
    }
    assert.equal(await next.isDisabled(), true, `${name}: al final del carril no hay más hallazgos`);
    // Lo que se promete es que se llega al último hallazgo. En móvil la tarjeta mide
    // `84vw`, unos pocos píxeles más que el carril porque `vw` cuenta la barra de
    // desplazamiento, así que se mide la porción visible en vez de exigir encaje exacto.
    const lastCard = await rail.evaluate(element => {
      const cards = [...element.querySelectorAll('[data-bria-finding-card]')];
      const last = cards[cards.length - 1].getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const visible = Math.min(last.right, box.right) - Math.max(last.left, box.left);
      return { atEnd: last.right <= box.right + 1, share: visible / last.width };
    });
    assert.ok(lastCard.atEnd, `${name}: el final del último hallazgo tiene que quedar a la vista`);
    assert.ok(lastCard.share > 0.95, `${name}: el último hallazgo se ve solo al ${Math.round(lastCard.share * 100)} %`);
    await page.screenshot({ path: `output/bria-hallazgos-final-${name}.png`, fullPage: true });

    // Y se puede volver al principio.
    for (let step = 0; step < 10 && !(await previous.isDisabled()); step += 1) {
      await previous.click();
      await settle();
    }
    assert.equal(await scrollLeft(), 0, `${name}: volver tiene que dejar el carril en el primer hallazgo`);
    assert.equal(await previous.isDisabled(), true, `${name}: en el primer hallazgo no hay anteriores`);
    assert.equal(await next.isDisabled(), false, `${name}: desde el principio se puede volver a avanzar`);

    // Cerrar y volver a abrir no deja las flechas muertas.
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.getByRole('button', { name: 'Ver más', exact: true }).click();
    await page.locator('[data-bria-finding-card]').first().waitFor();
    await page.waitForFunction(
      () => document.querySelector('button[aria-label="Siguientes hallazgos"]')?.disabled === false,
      null,
      { timeout: 5000 }
    );

    assert.deepEqual(errors, [], `${name}: sin errores de página`);
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${name}: el carril no puede desbordar la página`
    );
    console.log(`${name}: flechas activas al abrir, recorren los 13 hallazgos y vuelven al principio`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
