// Auditoría de contraste de botones sobre pantallas reales (Rodny, 18 de noviembre de 2026: «botón oscuro y letra
// oscura … es una forma de razonar … cómo manejar los contrastes»). Por cada botón visible con fondo propio mide el
// color de la letra contra el fondo realmente pintado (también si es un degradado: el color más repetido de la
// captura del botón) y avisa de los que no llegan a 4,5:1 (texto) o 3:1 (botón solo con icono). Claro y oscuro.
//   node tests/browser/buttonContrast.mjs            → informe en output/contraste-botones/informe.json
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const out = 'output/contraste-botones'; mkdirSync(out, { recursive: true });
const lum = ([r, g, b]) => { const c = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const dominant = (png) => {
  const counts = new Map();
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 200) continue;
    const key = [0, 1, 2].map(k => png.data[i + k] >> 3).join(',');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const [key] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || ['31,31,31'];
  return key.split(',').map(v => (Number(v) << 3) + 4);
};

const SCREENS = [
  ['preview-bria-mascot.js', 'createBriaMascotPreview', ['/clientes']],
  ['preview-manager.js', 'createManagerPreview', ['/manager', '/manager?tab=reuniones']],
  ['preview-brands.js', 'createBrandsPreview', ['/clientes?tab=marcas']],
  ['preview-dashboard.js', 'createDashboardPreview', ['/']],
  ['preview-crm.js', 'createCrmPreview', ['/crm']],
  ['preview-ad-budgets.js', 'createAdBudgetsPreview', ['/pautas']],
  ['preview-operational-notices.mjs', 'createOperationalNoticePreview', ['/']],
  ['preview-client-operations.js', 'createClientOperationsPreview', ['/clientes']],
];

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const findings = [];
for (const [file, fn, paths] of SCREENS) {
  let preview;
  try { preview = await (await import(`../../scripts/${file}`))[fn]({ port: 0 }); } catch (error) { findings.push({ screen: file, error: error.message.split('\n')[0] }); continue; }
  for (const theme of ['light', 'dark']) {
    for (const path of paths) {
      const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, colorScheme: theme });
      if (theme === 'dark') await page.addInitScript(() => { try { localStorage.setItem('theme', 'dark'); } catch {} });
      try {
        const url = theme === 'dark' ? `${preview.origin}${path}${path.includes('?') ? '&' : '?'}dark` : `${preview.origin}${path}`;
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        // Las muestras se ponen en oscuro con ?dark; si alguna no lo lee, se fuerza la clase como lo hace la plataforma.
        if (theme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));
        await page.waitForTimeout(4000);
        if (theme === 'dark' && !(await page.evaluate(() => document.documentElement.classList.contains('dark')))) throw new Error('el modo oscuro no se aplicó');
        const handles = await page.$$('button, a[role="button"], a[class*="rounded"]');
        for (const handle of handles) {
          const info = await handle.evaluate((el) => {
            const cs = getComputedStyle(el), r = el.getBoundingClientRect();
            const filled = (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) && !/, 0\.\d+\)$/.test(cs.backgroundColor) && cs.backgroundColor.split(',').length !== 4) || cs.backgroundImage !== 'none';
            const text = (el.innerText || '').trim();
            return { filled, visible: r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < innerHeight && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5,
              color: cs.color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number), text: text.slice(0, 40), label: el.getAttribute('aria-label') || '', w: r.width, h: r.height, disabled: el.disabled };
          });
          if (!info.filled || !info.visible || info.disabled) continue;
          const buffer = await handle.screenshot({ animations: 'disabled', timeout: 5000 }).catch(() => null);
          if (!buffer) continue;
          const shot = PNG.sync.read(buffer);
          const bg = dominant(shot), ratio = contrast(info.color, bg), need = info.text ? 4.5 : 3;
          // Tono medio (Rodny: «oscuro sobre oscuro» con 5,1:1 medido): el fondo tiene que ser claramente claro con letra
          // oscura o claramente oscuro con letra clara. Luminancia del fondo entre 0,18 y 0,45 no es ninguna de las dos.
          const midTone = lum(bg) > 0.18 && lum(bg) < 0.45;
          if (ratio < need || midTone) findings.push({ screen: `${file} ${path}`, theme, button: info.text || info.label, ratio: Math.round(ratio * 100) / 100, need, midTone, text: info.color, background: bg });
        }
      } catch (error) { findings.push({ screen: `${file} ${path}`, theme, error: error.message.split('\n')[0] }); }
      await page.close();
    }
  }
  await preview.close?.();
}
await browser.close();
writeFileSync(`${out}/informe.json`, JSON.stringify(findings, null, 2));
const bad = findings.filter(f => f.ratio);
console.log(`${bad.length} botones por debajo del mínimo; ${findings.filter(f => f.error).length} pantallas con error.`);
process.exit(0);
