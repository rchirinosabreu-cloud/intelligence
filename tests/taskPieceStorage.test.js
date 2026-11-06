import test from 'node:test';
import assert from 'node:assert/strict';
import { startTaskPieceStorage } from './support/taskPieceFixture.js';

test('el almacén aislado confirma copias independientes y permite verificar la retirada del objeto anterior', async () => {
  const storage = await startTaskPieceStorage();
  try {
    const source = `${storage.origin}/test/staging/original`;
    const target = `${storage.origin}/test/final/confirmed`;
    assert.equal((await fetch(source, { method: 'PUT', body: 'entrega completa', headers: { 'Content-Type': 'image/png' } })).status, 200);
    const copied = await fetch(target, { method: 'PUT', headers: { 'x-amz-copy-source': '/test/staging/original' } });
    assert.equal(copied.status, 200);
    assert.match(await copied.text(), /CopyObjectResult/);
    assert.equal(await (await fetch(target)).text(), 'entrega completa');
    assert.equal((await fetch(target, { method: 'HEAD' })).headers.get('content-type'), 'image/png');
    await fetch(source, { method: 'PUT', body: 'cambio tardío' });
    assert.equal(await (await fetch(target)).text(), 'entrega completa');
    assert.equal((await fetch(target, { method: 'PUT', headers: { 'x-amz-copy-source': '/test/staging/original', 'x-amz-copy-source-if-match': 'old-etag' } })).status, 412);
    assert.equal(await (await fetch(target)).text(), 'entrega completa');
    assert.equal((await fetch(source, { method: 'DELETE' })).status, 204);
    assert.equal((await fetch(source, { method: 'HEAD' })).status, 404);
    assert.equal(await (await fetch(target)).text(), 'entrega completa');
    assert.equal((await fetch(`${target}-missing`, { method: 'PUT', headers: { 'x-amz-copy-source': '/test/no-existe' } })).status, 404);
  } finally { await storage.close(); }
});
