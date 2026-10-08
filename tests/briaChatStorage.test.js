import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createBriaChatStorage, briaChatPrefix } from '../src/services/briaChatStorage.js';

test('private attachment storage verifies bytes and rejects keys outside the owned conversation', async () => {
  const objects = new Map(), id = randomUUID(), actor = { ref: 'owner' };
  const storage = createBriaChatStorage({ bucket: 'private', send: async command => {
    const { Key, Body } = command.input;
    if (command.constructor.name === 'PutObjectCommand') { objects.set(Key, Buffer.from(Body)); return {}; }
    if (command.constructor.name === 'GetObjectCommand') return { Body: { transformToByteArray: async () => objects.get(Key) } };
    throw new Error('unexpected');
  } });
  const file = { id: randomUUID(), buffer: Buffer.from('Original'), analysisData: Buffer.from('Analysis') };
  const stored = await storage.put('test', actor, id, file);
  assert.equal((await storage.read('test', actor, id, stored.storage_key, stored.original_sha256)).toString(), 'Original');
  await assert.rejects(() => storage.read('test', { ref: 'other' }, id, stored.storage_key, stored.original_sha256));
  objects.set(stored.storage_key, Buffer.from('corrupt'));
  await assert.rejects(() => storage.read('test', actor, id, stored.storage_key, stored.original_sha256));
  assert.match(briaChatPrefix('test', actor, id), /^bria-chat\/[a-f0-9]{24}\/[a-f0-9]{24}\/[a-f0-9-]+\/$/);
});

test('purging is bounded to one conversation and detects per-object S3 failures', async () => {
  const prefix = briaChatPrefix('test', { ref: 'owner' }, randomUUID());
  let lists = 0, deletes = 0;
  const storage = createBriaChatStorage({ bucket: 'private', send: async command => {
    if (command.constructor.name === 'ListObjectsV2Command') { lists++; assert.equal(command.input.Prefix, prefix); return { Contents: [{ Key: prefix + 'file/original' }] }; }
    deletes++; return { Errors: [{ Code: 'AccessDenied' }] };
  } });
  await assert.rejects(() => storage.purgePrefix('bria-chat/'));
  assert.equal(lists, 0);
  await assert.rejects(() => storage.purgePrefix(prefix));
  assert.equal(deletes, 1);
});

test('purging removes original and derived bytes then verifies the prefix is empty', async () => {
  const prefix = briaChatPrefix('test', { ref: 'owner' }, randomUUID());
  const objects = new Set([prefix + 'file/original', prefix + 'file/analysis']);
  let checked = false;
  const storage = createBriaChatStorage({ bucket: 'private', send: async command => {
    if (command.constructor.name === 'ListObjectsV2Command') { if (command.input.MaxKeys === 1) checked = true; return { Contents: [...objects].map(Key => ({ Key })) }; }
    for (const { Key } of command.input.Delete.Objects) objects.delete(Key);
    return {};
  } });
  await storage.purgePrefix(prefix);
  assert.equal(objects.size, 0); assert.equal(checked, true);
});
