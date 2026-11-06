import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { boundedUploadMemoryStorage } from '../src/lib/boundedUploadStorage.js';

const receive = (storage, req, chunks) => new Promise(resolve => {
  const stream = new PassThrough();
  const file = { originalname: 'archivo.png', stream };
  storage._handleFile(req, file, (error, value) => resolve({ error, value }));
  for (const chunk of chunks) stream.write(Buffer.from(chunk));
  stream.end();
});

test('the delivery memory budget is shared across files and stops buffering the chunk that exceeds it', async () => {
  const storage = boundedUploadMemoryStorage({ maxTotalBytes: 8 });
  const req = {};
  const first = await receive(storage, req, ['abc', 'def']);
  assert.equal(first.error, null);
  assert.equal(first.value.size, 6);
  assert.equal(first.value.buffer.toString(), 'abcdef');
  const second = await receive(storage, req, ['ghi', 'this later chunk must never be retained']);
  assert.equal(second.error.status, 413);
  assert.equal(second.value, undefined);
  const otherRequest = await receive(storage, {}, ['12345678']);
  assert.equal(otherRequest.error, null, 'the next request has a fresh budget');
});

test('a stream failure has one outcome and releasing an uploaded file drops its memory buffer', async () => {
  const storage = boundedUploadMemoryStorage({ maxTotalBytes: 8 });
  const stream = new PassThrough();
  let calls = 0, received;
  storage._handleFile({}, { originalname: 'a.png', stream }, error => { calls++; received = error; });
  stream.write(Buffer.from('123456789'));
  stream.emit('error', new Error('disconnected'));
  stream.end();
  assert.equal(calls, 1);
  assert.equal(received.status, 413);
  const file = { buffer: Buffer.from('data') };
  storage._removeFile({}, file, error => assert.equal(error, null));
  assert.equal(file.buffer, undefined);
});
