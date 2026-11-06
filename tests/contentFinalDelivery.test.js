import test from 'node:test';
import assert from 'node:assert/strict';

import * as delivery from '../src/lib/contentFinalDelivery.js';

test('la entrega compartida envía archivos pequeños a la ruta nativa sin cerrar ni publicar', async () => {
  assert.equal(typeof delivery.uploadFinalPiece, 'function');
  const calls = [];
  const client = { post: async (...args) => { calls.push(args); return { data: [{ id: 'asset' }] }; } };
  const result = await delivery.uploadFinalPiece('piece', [new File(['file'], 'foto.png', { type: 'image/png' })], { client, token: 'local', apiBase: '' });
  assert.deepEqual(result, [{ id: 'asset' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/content/items/piece/final-assets');
  assert.equal(calls[0][1].getAll('files')[0].name, 'foto.png');
  assert.equal(calls[0][2].headers.Authorization, 'Bearer local');
});

test('la entrega pesada solo termina al confirmar y un error no confirma objetos parciales', async () => {
  assert.equal(typeof delivery.uploadFinalPiece, 'function');
  const calls = [], progress = [];
  const client = {
    post: async (url, body) => { calls.push([url, body]); return { data: url.endsWith('direct-upload') ? [{ key: 'server-key', name: 'video.mp4', mimeType: 'video/mp4', url: 'https://storage.example/upload' }] : [{ id: 'confirmed' }] }; },
    put: async (url, file, options) => { calls.push([url, file]); options.onUploadProgress({ loaded: file.size }); }
  };
  const file = { name: 'video.mp4', type: 'video/mp4', size: 105 * 1024 * 1024 };
  assert.deepEqual(await delivery.uploadFinalPiece('piece', [file], { client, token: 'local', apiBase: '', onProgress: value => progress.push(value) }), [{ id: 'confirmed' }]);
  assert.deepEqual(calls.map(([url]) => url), ['/api/content/items/piece/final-assets/direct-upload', 'https://storage.example/upload', '/api/content/items/piece/final-assets/confirm']);
  assert.deepEqual(progress, [0, 99]);
  calls.length = 0;
  client.put = async () => { throw new Error('Interrumpida'); };
  await assert.rejects(delivery.uploadFinalPiece('piece', [file], { client, token: 'local', apiBase: '' }), /Interrumpida/);
  assert.equal(calls.length, 1, 'no confirma si falló la subida');
});

test('la entrega rechaza selección inválida antes de solicitar una subida', async () => {
  assert.equal(typeof delivery.uploadFinalPiece, 'function');
  await assert.rejects(delivery.uploadFinalPiece('piece', [], { client: { post() { assert.fail('No debe llamar'); } } }), /Selecciona/);
});

test('actualizar permite un carrusel completo de 20 y envía la revisión sin comparar nombres', async () => {
  const calls = [];
  const client = { post: async (...args) => { calls.push(args); return { data: { revision: 8, files: [{ id: 'new' }] } }; } };
  const files = Array.from({ length: 20 }, () => new File(['new'], 'igual.png', { type: 'image/png' }));
  const result = await delivery.uploadFinalPiece('piece', files, { client, apiBase: '', token: 'local', replace: true, expectedRevision: 7, requestId: '89c1fa66-4122-4aa5-81b5-593b7ae84bd7' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/content/items/piece/delivery/replace');
  assert.equal(calls[0][1].getAll('files').length, 20);
  assert.equal(calls[0][1].get('expectedRevision'), '7');
  assert.equal(calls[0][1].get('requestId'), '89c1fa66-4122-4aa5-81b5-593b7ae84bd7');
  assert.deepEqual(result, { revision: 8, files: [{ id: 'new' }] });
});

test('actualización directa confirma el manifiesto completo y no publica una carga parcial', async () => {
  const calls = [];
  const files = [{ name: 'mismo.mp4', type: 'video/mp4', size: 105 * 1024 * 1024 }, { name: 'mismo.mp4', type: 'video/mp4', size: 120 * 1024 * 1024 }];
  const client = {
    post: async (url, body) => {
      calls.push([url, body]);
      return { data: url.endsWith('direct-upload') ? { uploadId: 'delivery-session', revision: 2, tickets: files.map((f, i) => ({ key: `key-${i}`, name: f.name, mimeType: f.type, url: `https://storage.example/new-${i}` })) } : { revision: 3, files: [{ id: 'new-a' }, { id: 'new-b' }] } };
    },
    put: async url => { calls.push([url]); },
  };
  const options = { client, apiBase: '', token: 'local', replace: true, expectedRevision: 2, requestId: '4c0b860a-715e-44fb-a71a-636c1430c535' };
  assert.equal((await delivery.uploadFinalPiece('piece', files, options)).revision, 3);
  assert.deepEqual(calls.map(([url]) => url), ['/api/content/items/piece/delivery/direct-upload', 'https://storage.example/new-0', 'https://storage.example/new-1', '/api/content/items/piece/delivery/confirm']);
  assert.deepEqual(calls.at(-1)[1], { uploadId: 'delivery-session', expectedRevision: 2, requestId: options.requestId });
  calls.length = 0;
  client.put = async () => { throw new Error('Carga interrumpida'); };
  await assert.rejects(delivery.uploadFinalPiece('piece', files, options), /Carga interrumpida/);
  assert.equal(calls.some(([url]) => url.endsWith('/confirm')), false);
});

test('actualizar sin revisión conocida se rechaza antes de subir o borrar archivos', async () => {
  const file = new File(['new'], 'foto.png', { type: 'image/png' });
  for (const expectedRevision of [undefined, null, -1, 0.5]) {
    await assert.rejects(delivery.uploadFinalPiece('piece', [file], { replace: true, expectedRevision, token: 'local', client: { post: () => assert.fail('No llama sin revisión') } }), /revisión/i);
  }
});
