import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { buildMetricReportHtml } from '../../src/services/metricReportPdf.js';

// Synthetic evidence only; no database, uploaded captures or paid model calls.
const period = { start: '2026-08-01', end: '2026-08-31' };
const fixture = {
  name: 'Reporte de desempeño digital', client: { name: 'MultiK' }, startDate: period.start, endDate: period.end, status: 'PUBLISHED',
  normalizedMetrics: { schemaVersion: 2, dataVersion: 1, issues: [], panels: [], facts: ['INSTAGRAM', 'FACEBOOK'].flatMap(platform =>
    ['views', 'interactions', 'followers'].map((key, index) => ({ factId: `${platform}-${key}`, platform, key, label: key, scope: 'TOTAL',
      contextKey: 'account_content', entityLevel: 'ACCOUNT', period, unit: 'count', value: 100 + index, precision: 'EXACT', status: 'OBSERVED',
      sourceIds: ['synthetic'], observationIds: [`${platform}-${key}`] }))) },
  narrative: { generationMode: 'EVIDENCE_AI', dataVersion: 1, headline: 'Resumen ejecutivo', summaryPoints: ['Resultados de muestra.'], sections: [], actionPlan: [] },
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32'
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/chromium'), headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  await page.setViewportSize({ width: 673, height: 1000 });
  await page.emulateMedia({ media: 'print' });
  await page.setContent(buildMetricReportHtml(fixture));
  const geometry = await page.evaluate(() => {
    const title = document.querySelector('.cover-title'), client = document.querySelector('.cover .client'), heading = title.parentElement;
    const range = document.createRange();
    range.setStart(title.firstChild, title.textContent.lastIndexOf('digital'));
    range.setEnd(title.firstChild, title.textContent.length);
    const digital = range.getBoundingClientRect(), name = client.getBoundingClientRect();
    return { digitalTop: digital.top, digitalRight: digital.right, clientTop: name.top, clientLeft: name.left,
      lines: heading.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(heading).lineHeight), text: heading.textContent };
  });
  assert.ok(Math.abs(geometry.digitalTop - geometry.clientTop) < 2, `Client must share the digital line: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.clientLeft > geometry.digitalRight, 'The title and client need visible word spacing');
  assert.ok(Math.abs(geometry.lines - 2) < 0.1, `The A4 title must occupy two lines: ${JSON.stringify(geometry)}`);
  assert.match(geometry.text, /digital\s+MultiK/);

  const checks = [];
  for (const width of [1440, 390, 320]) for (const colorScheme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 1100 });
    await page.emulateMedia({ media: 'screen', colorScheme });
    await page.setContent(buildMetricReportHtml(fixture));
    const check = await page.evaluate(() => {
      const rgb = css => {
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
        canvas.width = canvas.height = 1; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const luminance = channels => channels.map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
        .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
      const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      const paper = getComputedStyle(document.querySelector('.document')).backgroundColor;
      const selectors = ['.cover h1', '.cover .client', '.brand', '.cover-network h3', '.cover-metric span', '.cover-metric strong'];
      const ratios = selectors.map(selector => {
        const node = document.querySelector(selector), card = node.closest('.cover-metric');
        return { selector, ratio: contrast(luminance(rgb(getComputedStyle(node).color)), luminance(rgb(card ? getComputedStyle(card).backgroundColor : paper))) };
      });
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, ratios,
        heading: rgb(getComputedStyle(document.querySelector('.cover h1')).color),
        client: rgb(getComputedStyle(document.querySelector('.cover .client')).color),
        cards: [...document.querySelectorAll('.cover-metric')].slice(0, 3).map(node => rgb(getComputedStyle(node).backgroundColor)) };
    });
    assert.ok(check.scrollWidth <= width, `Horizontal overflow at ${width}`);
    for (const item of check.ratios) assert.ok(item.ratio >= 4.5, `Insufficient contrast ${colorScheme}: ${JSON.stringify(item)}`);
    if (colorScheme === 'light') {
      assert.deepEqual(check.heading, [31, 60, 88], 'Titles use the approved dark blue');
      assert.deepEqual(check.client, [109, 40, 217], 'The client name retains its approved violet');
      assert.equal(new Set(check.cards.map(color => color.join(','))).size, 3, 'The three card tones remain distinct');
      check.cards.forEach(([red, green, blue]) => assert.ok(blue > red && green >= red && red > 220, 'Cards use subtle blue tints'));
    }
    checks.push({ width, colorScheme, minimumContrast: Math.min(...check.ratios.map(item => item.ratio)) });
  }
  console.log(JSON.stringify({ title: geometry, checks }, null, 2));
} finally { await browser.close(); }
