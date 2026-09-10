import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

let server, browser, origin;
const output = path.resolve('output/task-attachments');
const user = { id: 'user-demo', name: 'Persona de prueba', role: 'ADMIN' };
const attachments = ['foto-a.png', 'foto-b.png', 'foto-c.png'].map((name, i) => ({
  id: `attachment-${i}`, name, url: `https://t3.storageapi.dev/chat-evidence/demo/${i}/${name}`, commentId: 'comment-demo', taskId: 'task-demo'
}));
before(async () => {
  await mkdir(output, { recursive: true });
  server = await createServer({ configFile: false, envFile: false, envDir: path.resolve('tests/fixtures'), root: process.cwd(), esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': path.resolve('src') } }, server: { host: '127.0.0.1', port: 0, proxy: {}, hmr: false }, logLevel: 'error' });
  await server.listen(); origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); await server?.close(); });

async function demo({ legacy = false, send, delayPreview, viewport = { width: 1440, height: 1080 }, reducedMotion = 'reduce' } = {}) {
  const page = await browser.newPage({ viewport, reducedMotion });
  page.setDefaultTimeout(8000);
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(user => {
    localStorage.setItem('authToken', `e30.${btoa(JSON.stringify({ exp: 9999999999 }))}.test`);
    localStorage.setItem('currentUser', JSON.stringify(user));
  }, user);
  const images = await page.evaluate(() => ['#00a0b5', '#8154b2', '#008276'].map((color, i) => {
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 340;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 600, 340);
    ctx.fillStyle = 'white'; ctx.font = 'bold 44px sans-serif'; ctx.fillText(`Fotografía ${String.fromCharCode(65 + i)}`, 60, 160);
    ctx.font = '22px sans-serif'; ctx.fillText('Archivo de prueba independiente', 60, 215);
    return canvas.toDataURL('image/png').split(',')[1];
  }));
  let comments = [{ id: 'comment-demo', taskId: 'task-demo', authorId: user.id, author: user, type: 'human', createdAt: '2026-09-10T15:00:00Z', content: legacy ? attachments.map(file => file.url).join('\n') : '<p>Comparto las tres fotografías para revisión.</p>', attachments: legacy ? [] : attachments, reactions: [] }];
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (!url.pathname.startsWith('/api/')) return url.origin === origin ? route.continue() : route.abort();
    const json = data => route.fulfill({ json: data });
    if (url.pathname === '/api/auth/me') return json(user);
    if (url.pathname === '/api/team') return json([{ id: 'member-demo', userId: user.id, name: user.name }]);
    if (url.pathname.endsWith('/follow-status')) return json({ isFollowing: false });
    if (url.pathname.endsWith('/trace-open')) return json({ success: true });
    if (url.pathname.endsWith('/work-history')) return json({ cycles: [], sessions: [], summary: { totalSeconds: 0, sessionCount: 0 } });
    if (url.pathname.endsWith('/comments') && req.method() === 'GET') return json(comments);
    if (url.pathname.endsWith('/comments') && req.method() === 'POST') {
      if (send) return send(route);
      comments = [...comments, { ...comments[0], id: 'sent-comment', content: '<p>Mensaje enviado</p>', attachments: [] }];
      return route.fulfill({ status: 201, json: comments.at(-1) });
    }
    if (/\/comments\/comment-demo\/(file|download)$/.test(url.pathname)) {
      requests.push(url);
      if (delayPreview && url.pathname.endsWith('/file')) await delayPreview(url);
      const index = legacy ? attachments.findIndex(a => a.url === url.searchParams.get('url')) : attachments.findIndex(a => a.id === url.searchParams.get('attachmentId'));
      if (index < 0) return route.fulfill({ status: 409, json: { error: 'Selecciona el archivo exacto' } });
      return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Content-Disposition': `attachment; filename="${attachments[index].name}"` }, body: Buffer.from(images[index], 'base64') });
    }
    return route.fulfill({ status: 500, json: { error: `Unexpected local API: ${req.method()} ${url.pathname}` } });
  });
  await page.goto(`${origin}/tests/fixtures/task-attachments.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.getByText('foto-a.png', { exact: true }).waitFor({ timeout: 30000 });
  } catch (error) {
    console.error('Local fixture errors:', errors);
    console.error('Local fixture text:', await page.locator('body').innerText());
    throw error;
  }
  await settleAnimations(page);
  return { page, errors, requests, images };
}

async function settleAnimations(page) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getTiming().iterations)).map(animation => animation.finished.catch(() => {})));
  });
}

async function capture(page, name) {
  // Finish theme transitions before visual QA; don't interact during the dialog entrance animation.
  await settleAnimations(page);
  await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
}

for (const legacy of [false, true]) {
  test(`${legacy ? 'historical' : 'structured'}: preview, card download and viewer download select the same distinct file`, async () => {
    const { page, errors, requests, images } = await demo({ legacy });
    try {
      for (let i = 0; i < attachments.length; i++) {
        const request = page.waitForRequest(req => new URL(req.url()).pathname.endsWith('/file'));
        await page.getByRole('button', { name: 'Vista previa', exact: true }).nth(i).click();
        const url = new URL((await request).url());
        assert.equal(url.searchParams.get(legacy ? 'url' : 'attachmentId'), legacy ? attachments[i].url : attachments[i].id);
        const preview = page.getByRole('dialog', { name: 'Vista previa de imagen', exact: true });
        await preview.waitFor();
        await page.waitForFunction(() => document.querySelector('img[alt="Preview"]')?.naturalWidth === 600);
        const result = await page.evaluate(async () => {
          const buffer = await (await fetch(document.querySelector('img[alt="Preview"]').src)).arrayBuffer();
          return btoa(String.fromCharCode(...new Uint8Array(buffer)));
        });
        assert.equal(result, images[i]);
        if (!legacy && i === 1) await page.screenshot({ path: path.join(output, 'preview-foto-b.png') });
        const viewerDownload = page.waitForEvent('download');
        await preview.getByRole('button', { name: 'DESCARGAR ARCHIVO', exact: true }).click();
        const downloaded = await viewerDownload;
        assert.equal(downloaded.suggestedFilename(), attachments[i].name);
        assert.deepEqual(await readFile(await downloaded.path()), Buffer.from(images[i], 'base64'));
        await preview.getByRole('button', { name: 'Cerrar vista previa' }).click();
        const cardDownload = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Descargar archivo', exact: true }).nth(i).click();
        const cardFile = await cardDownload;
        assert.equal(cardFile.suggestedFilename(), attachments[i].name);
        assert.deepEqual(await readFile(await cardFile.path()), Buffer.from(images[i], 'base64'));
      }
      assert.equal(requests.length, 9, 'One preview fetch and two downloads per file');
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

test('text and multiple files are one send; failure retains the draft; success clears it', async () => {
  let fail = true;
  const submissions = [];
  const { page, errors } = await demo({ send: async route => {
    submissions.push(route.request().postDataBuffer());
    if (fail) return route.fulfill({ status: 500, json: { error: 'No se pudo guardar el mensaje de prueba' } });
    return route.fulfill({ status: 201, json: { id: 'sent-comment', taskId: 'task-demo', content: '<p>Estas son las fotos finales</p>', author: user, authorId: user.id, createdAt: '2026-09-10T16:00:00Z', type: 'human', attachments: [], reactions: [] } });
  } });
  try {
    const editor = page.locator('[contenteditable="true"]').last();
    await editor.fill('Estas son las fotos finales');
    await page.locator('#task-file-upload-focus').setInputFiles([
      { name: 'nueva-a.png', mimeType: 'image/png', buffer: Buffer.from('local-image-a') },
      { name: 'nueva-b.png', mimeType: 'image/png', buffer: Buffer.from('local-image-b') }
    ]);
    assert.equal(submissions.length, 0, 'Choosing files does not send the message');
    await page.getByRole('button', { name: 'Enviar comentario' }).scrollIntoViewIfNeeded();
    await capture(page, 'comment-with-files-light.png');
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await capture(page, 'comment-with-files-dark.png');
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.getByRole('button', { name: 'Enviar comentario' }).click();
    await page.getByText('No se pudo guardar el mensaje de prueba', { exact: true }).waitFor();
    assert.match(await editor.innerText(), /Estas son las fotos finales/);
    await page.getByText('nueva-a.png', { exact: true }).waitFor();
    await page.getByText('nueva-b.png', { exact: true }).waitFor();
    assert.equal(submissions.length, 1);
    for (const expected of ['Estas son las fotos finales', 'nueva-a.png', 'nueva-b.png', 'local-image-a', 'local-image-b']) assert.ok(submissions[0].includes(expected));
    fail = false;
    await page.getByRole('button', { name: 'Enviar comentario' }).click();
    await page.getByText('Comentario enviado', { exact: true }).waitFor();
    assert.equal((await editor.innerText()).trim(), '');
    assert.equal(await page.getByText('nueva-a.png', { exact: true }).count(), 0);
    assert.equal(submissions.length, 2);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

for (const pending of [false, true]) {
test(`a slow previous preview never replaces the most recently selected ${pending ? 'pending' : 'saved'} photo`, async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { page, images } = await demo({ delayPreview: url => url.searchParams.get('attachmentId') === 'attachment-0' ? gate : undefined });
  try {
    if (pending) await page.locator('#task-file-upload-focus').setInputFiles([{ name: 'pendiente.png', mimeType: 'image/png', buffer: Buffer.from(images[2], 'base64') }]);
    const firstRequest = page.waitForRequest(req => req.url().includes('attachmentId=attachment-0'));
    await page.getByRole('button', { name: 'Vista previa', exact: true }).nth(0).click();
    await firstRequest;
    await page.getByRole('button', { name: 'Vista previa', exact: true }).nth(pending ? 3 : 1).click();
    await page.waitForFunction(() => document.querySelector('img[alt="Preview"]')?.naturalWidth === 600);
    const firstResponse = page.waitForResponse(res => res.url().includes('attachmentId=attachment-0'));
    release(); await firstResponse;
    // Let both response bodies and React effects settle before checking pixels.
    await page.waitForLoadState('networkidle');
    const data = await page.evaluate(async () => {
      const buffer = await (await fetch(document.querySelector('img[alt="Preview"]').src)).arrayBuffer();
      return btoa(String.fromCharCode(...new Uint8Array(buffer)));
    });
    assert.ok(data === images[pending ? 2 : 1], 'The image must still be the last selected photo after the older response finishes');
  } finally { release(); await page.close(); }
});
}

test('mobile: pending files can be removed individually and Ctrl+Enter submits the remaining file with its text', async () => {
  const submissions = [];
  const { page, errors } = await demo({ viewport: { width: 390, height: 844 }, send: route => {
    submissions.push(route.request().postDataBuffer());
    return route.fulfill({ status: 201, json: { id: 'sent-mobile', content: '<p>Revisión móvil</p>', author: user, authorId: user.id, type: 'human', attachments: [], reactions: [] } });
  } });
  try {
    const editor = page.locator('[contenteditable="true"]').last();
    await editor.fill('Revisión móvil');
    await page.locator('#task-file-upload-focus').setInputFiles([
      { name: 'conservar.png', mimeType: 'image/png', buffer: Buffer.from('keep') },
      { name: 'quitar.png', mimeType: 'image/png', buffer: Buffer.from('remove') }
    ]);
    await page.getByRole('button', { name: 'Quitar archivo seleccionado' }).nth(1).click();
    await page.getByRole('button', { name: 'Enviar comentario' }).scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const send = document.querySelector('[aria-label="Enviar comentario"]');
      return dialog?.getBoundingClientRect().top === 0 && dialog.scrollTop === 0 && send?.getBoundingClientRect().bottom > innerHeight / 2;
    });
    await capture(page, 'comment-mobile.png');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await editor.press('Control+Enter');
    await page.getByText('Comentario enviado', { exact: true }).waitFor();
    assert.equal(submissions.length, 1);
    assert.ok(submissions[0].includes('Revisión móvil'));
    assert.ok(submissions[0].includes('conservar.png'));
    assert.ok(!submissions[0].includes('quitar.png'));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

async function sampleFormatToggle(page) {
  return page.evaluate(() => new Promise(resolve => {
    const button = document.querySelector('[aria-label="Opciones de formato"]');
    const shell = button.closest('[data-rich-text-editor-shell]');
    const samples = [];
    const start = performance.now();
    const sample = () => {
      const rect = shell.getBoundingClientRect();
      samples.push({ time: performance.now() - start, top: rect.top, bottom: rect.bottom, height: rect.height });
    };
    sample();
    button.click();
    const frame = () => {
      sample();
      // Observe painted frames, after ResizeObserver/layout compensation, not
      // the intermediate layout that a synchronous rAF read can force.
      if (performance.now() - start < 650) requestAnimationFrame(() => setTimeout(frame, 0));
      else resolve(samples);
    };
    requestAnimationFrame(() => setTimeout(frame, 0));
  }));
}

for (const viewport of [{ width: 1440, height: 1080 }, { width: 390, height: 844 }]) {
  test(`format ${viewport.width}px: expands upward smoothly with the bottom anchored and no manual scroll`, async () => {
    const { page, errors } = await demo({ viewport, reducedMotion: 'no-preference' });
    try {
      const editor = page.locator('[contenteditable="true"]').last();
      await editor.fill('Texto que debe conservarse al abrir Formato.');
      await settleAnimations(page);
      await page.locator('[data-rich-text-editor-shell]').last().scrollIntoViewIfNeeded();
      const opening = await sampleFormatToggle(page);
      await page.screenshot({ path: path.join(output, `format-${viewport.width}-open.png`) });
      const first = opening[0], last = opening.at(-1);
      assert.ok(last.height > first.height + 40, 'Format exposes a larger editing area');
      assert.ok(opening.every(frame => Math.abs(frame.bottom - first.bottom) <= 3), 'Opening must keep the bottom edge stable instead of centering/jumping');
      assert.ok(new Set(opening.filter(frame => frame.height > first.height + 2 && frame.height < last.height - 2).map(frame => Math.round(frame.height))).size >= 3, 'Expansion must have visible intermediate frames');
      assert.ok(last.top < first.top && last.top >= 0 && last.bottom <= viewport.height, 'Toolbar and editor stay visible without manual scroll');
      assert.match(await editor.innerText(), /Texto que debe conservarse/);
      const closing = await sampleFormatToggle(page);
      assert.ok(closing.every(frame => Math.abs(frame.bottom - closing[0].bottom) <= 3), 'Closing also keeps the bottom edge stable');
      assert.ok(Math.abs(closing.at(-1).height - first.height) <= 2, 'Closing returns to compact height');
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

test('format: reduced motion and repeated toggles preserve the draft, selection and attachments', async () => {
  const { page, errors } = await demo();
  try {
    const editor = page.locator('[contenteditable="true"]').last();
    const draft = Array.from({ length: 12 }, (_, i) => `Línea ${i + 1}: conservar este comentario.`).join('\n');
    await editor.fill(draft);
    await page.locator('#task-file-upload-focus').setInputFiles([{ name: 'conservar.png', mimeType: 'image/png', buffer: Buffer.from('local attachment') }]);
    await page.locator('[data-rich-text-editor-shell]').last().scrollIntoViewIfNeeded();
    const frames = await sampleFormatToggle(page);
    assert.ok(frames.slice(1).every(frame => Math.abs(frame.height - frames.at(-1).height) <= 1), 'Reduced motion must finish without intermediate animation frames');
    await editor.press('Control+Home');
    await editor.press('Control+Shift+End');
    await page.getByRole('button', { name: 'Negrita', exact: true }).click();
    assert.ok(await editor.locator('strong').count() > 0, 'Formatting applies to the selected text');
    assert.match(await editor.innerText(), /Línea 12: conservar este comentario/);
    await page.getByRole('button', { name: 'Opciones de formato' }).click();
    assert.equal(await page.getByRole('button', { name: 'Negrita', exact: true }).count(), 0, 'Closed formatting controls are not accessible');
    await page.getByRole('button', { name: 'Opciones de formato' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Negrita', exact: true }).waitFor();
    await page.getByText('conservar.png', { exact: true }).waitFor();
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await capture(page, 'format-dark-open.png');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
