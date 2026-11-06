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
