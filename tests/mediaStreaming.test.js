import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import express from 'express';
import { normalizeRangeHeader, sendStoredObject } from '../src/lib/mediaRange.js';
import {
  MEDIA_TICKET_AUDIENCE, isMediaDelivery, isMediaTicketPayload, isMediaTicketRoute, mediaTicketFromRequest, signMediaTicket, verifyMediaTicket
} from '../src/lib/mediaTicket.js';
import jwt from 'jsonwebtoken';

// Rodny, 21 de noviembre de 2026: «los vídeos cómo pueden renderizarse mejor para visualización más rápida, que
// no tengan que cargar de nuevo cada vez que uno los abre en la parrilla». El video se entrega por pedazos (el
// reproductor arranca sin bajarlo entero) y un pase en la dirección deja que el `<video>` lo pida por sí mismo.

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const SECRET = 'a'.repeat(40);

const fakeStorage = (bytes, calls = []) => ({
  async getFromS3Stream(key, { range } = {}) {
    calls.push({ key, range });
    if (!range) return { Body: Readable.from([bytes]), ContentLength: bytes.length, ContentType: 'video/mp4', ETag: '"abc"' };
    const [, from, to] = /^bytes=(\d*)-(\d*)$/.exec(range);
    const start = from === '' ? bytes.length - Number(to) : Number(from);
    const end = from === '' || to === '' ? bytes.length - 1 : Math.min(Number(to), bytes.length - 1);
    if (start >= bytes.length) throw Object.assign(new Error('range'), { name: 'InvalidRange', $metadata: { httpStatusCode: 416 } });
    const slice = bytes.subarray(start, end + 1);
    return { Body: Readable.from([slice]), ContentLength: slice.length, ContentRange: `bytes ${start}-${end}/${bytes.length}`, ETag: '"abc"' };
  }
});

async function withServer(storage, run) {
  const app = express();
  app.get('/file', (req, res, next) => sendStoredObject(req, res, { storage, key: 'k/reel.mp4', mimeType: 'video/mp4', name: 'reel final.mp4' }).catch(next));
  const server = await new Promise(resolve => { const listener = http.createServer(app).listen(0, '127.0.0.1', () => resolve(listener)); });
  try { return await run(`http://127.0.0.1:${server.address().port}/file`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('solo se entiende un rango simple; lo demás se ignora y se entrega el archivo entero', () => {
  assert.equal(normalizeRangeHeader('bytes=0-'), 'bytes=0-');
  assert.equal(normalizeRangeHeader('bytes=100-199'), 'bytes=100-199');
  assert.equal(normalizeRangeHeader('bytes=-500'), 'bytes=-500');
  for (const bad of [undefined, '', 'bytes=-', 'bytes=5-2', 'bytes=0-1,5-9', 'items=0-1', 'bytes=a-b']) assert.equal(normalizeRangeHeader(bad), null);
});

test('el servidor entrega el pedazo pedido con 206 y el archivo entero cuando no se pide rango', async () => {
  const bytes = Buffer.from('0123456789abcdefghij');
  const calls = [];
  await withServer(fakeStorage(bytes, calls), async (url) => {
    const whole = await fetch(url);
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get('accept-ranges'), 'bytes');
    assert.equal(whole.headers.get('content-length'), '20');
    assert.equal(whole.headers.get('etag'), '"abc"');
    assert.equal(whole.headers.get('cache-control'), 'private, max-age=300');
    assert.equal(await whole.text(), bytes.toString());

    const part = await fetch(url, { headers: { Range: 'bytes=5-9' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), 'bytes 5-9/20');
    assert.equal(part.headers.get('content-length'), '5');
    assert.equal(part.headers.get('content-type'), 'video/mp4');
    assert.equal(await part.text(), '56789');

    const tail = await fetch(url, { headers: { Range: 'bytes=15-' } });
    assert.equal(tail.status, 206);
    assert.equal(await tail.text(), 'fghij');

    const beyond = await fetch(url, { headers: { Range: 'bytes=999-' } });
    assert.equal(beyond.status, 416);

    const odd = await fetch(url, { headers: { Range: 'bytes=0-1,4-5' } });
    assert.equal(odd.status, 200, 'un rango que no entendemos no rompe: llega el archivo entero');
    await odd.arrayBuffer();
  });
  assert.deepEqual(calls.map(call => call.range), [undefined, 'bytes=5-9', 'bytes=15-', 'bytes=999-', undefined], 'el pedazo se le pide al almacenamiento: el servidor no carga el archivo');
});

test('las dos rutas de piezas finales, la interna y la del portal, entregan por pedazos', () => {
  const routes = read('src/routes/api/content.js');
  const handler = routes.slice(routes.indexOf("router.get('/items/:id/final-assets/:assetId'"), routes.indexOf("router.delete('/items/:id/final-assets/:assetId'"));
  assert.match(handler, /sendStoredObject\(req, res/);
  assert.match(read('src/controllers/publicController.js'), /sendStoredObject\(req, res/);
  assert.match(read('src/components/public/SharedContentPlan.jsx'), /preload="metadata"/, 'el mosaico del portal solo pide el primer cuadro');
});

test('el pase de reproducción solo abre la lectura de piezas finales y nunca vale como sesión', () => {
  const ticket = signMediaTicket({ userId: 'u1', sessionVersion: 3 }, SECRET);
  const payload = verifyMediaTicket(ticket, SECRET);
  assert.equal(payload.userId, 'u1');
  assert.equal(payload.sessionVersion, 3);
  assert.equal(payload.aud, MEDIA_TICKET_AUDIENCE);
  assert.equal(isMediaTicketPayload(payload), true);
  assert.equal(isMediaTicketPayload({ userId: 'u1' }), false);

  const session = jwt.sign({ userId: 'u1', sessionVersion: 3 }, SECRET);
  assert.throws(() => verifyMediaTicket(session, SECRET), 'una sesión puesta en la dirección no sirve de pase');
  assert.throws(() => verifyMediaTicket(ticket, 'b'.repeat(40)));

  const media = { method: 'GET', originalUrl: `/api/content/items/i1/final-assets/a1?v=k&access_token=${ticket}`, query: { access_token: ticket } };
  assert.equal(isMediaTicketRoute(media), true);
  assert.equal(mediaTicketFromRequest(media), ticket);
  for (const other of [
    { method: 'DELETE', originalUrl: '/api/content/items/i1/final-assets/a1' },
    { method: 'GET', originalUrl: '/api/content/items/i1' },
    { method: 'GET', originalUrl: '/api/content/items/i1/final-assets/a1/extra' },
    { method: 'GET', originalUrl: '/api/financials/records' },
    { method: 'POST', originalUrl: '/api/content/items/i1/final-assets' }
  ]) assert.equal(mediaTicketFromRequest({ ...other, query: { access_token: ticket } }), null, `${other.method} ${other.originalUrl}`);

  const auth = read('src/middlewares/authMiddleware.js');
  assert.match(auth, /const mediaTicket = headerToken \? null : mediaTicketFromRequest\(req\)/);
  assert.match(auth, /!mediaTicket && isMediaTicketPayload\(user\)/, 'un pase enviado como sesión se rechaza');
  assert.match(read('src/routes/api/content.js'), /router\.post\('\/media-ticket'/);
});

test('ver videos no gasta el cupo de pedidos de la plataforma ni el del portal', () => {
  assert.equal(isMediaDelivery({ method: 'GET', originalUrl: '/api/content/items/i/final-assets/a?v=1' }), true);
  assert.equal(isMediaDelivery({ method: 'GET', originalUrl: '/api/public/parrilla/tok/items/i/final-assets/a' }), true);
  assert.equal(isMediaDelivery({ method: 'GET', originalUrl: '/api/public/parrilla/tok' }), false);
  assert.equal(isMediaDelivery({ method: 'POST', originalUrl: '/api/content/items/i/final-assets/a' }), false);
  const server = read('server.js');
  assert.match(server, /const apiRateLimiter = exceptMedia\(createRateLimiter\(/);
  assert.match(server, /const publicRateLimiter = exceptMedia\(createRateLimiter\(/);
  assert.match(server, /isMediaDelivery\(req\) \? mediaRateLimiter\(req, res, next\)/);
});

test('la pantalla reproduce por pedazos, guarda al reproducir y vuelve al camino de siempre si algo falla', () => {
  const viewer = read('src/components/modules/ContentPlan/FinalMediaPreview.jsx');
  assert.match(viewer, /acquirePrivateMedia\(sourceUrl, \{ onlyCached: true \}\)/, 'primero mira si ya está en el dispositivo');
  assert.match(viewer, /mediaStreamUrl\(sourceUrl, ticket\)/);
  assert.match(viewer, /onPlaying=\{playing\}/);
  assert.match(viewer, /savePrivateMedia\(sourceUrl\)/);
  assert.match(viewer, /setWholeFile\(sourceUrl\)/, 'si la reproducción por pedazos falla, se baja completo');
  assert.match(read('src/components/modules/ContentPlan/PieceMedia.jsx'), /streamable=\{!customUrls\}/, 'solo las piezas finales de parrillas tienen ruta por pedazos');
});
