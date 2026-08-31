import { chromium } from 'playwright-core';

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const ALLOWED_REMOTE_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'labs.brainstudioagencia.com']);
const executablePath = () => process.env.CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : '/usr/bin/chromium');

export const validateReportHTML = (html) => {
  if (typeof html !== 'string' || !html.trim()) throw new Error('El contenido HTML del reporte está vacío.');
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) throw new Error('El reporte supera el tamaño máximo permitido.');
};

export const renderReportPDF = async (html) => {
  validateReportHTML(html);
  const browser = await chromium.launch({ executablePath: executablePath(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('data:') || url.startsWith('about:')) return route.continue();
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' && ALLOWED_REMOTE_HOSTS.has(parsed.hostname)) return route.continue();
      } catch {}
      return route.abort('blockedbyclient');
    });
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(async () => document.fonts?.ready);
    return await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  } finally {
    await browser.close();
  }
};
