import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { S3Client } from '@aws-sdk/client-s3';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/attachment_test';
process.env.AWS_ACCESS_KEY_ID = 'local-test';
process.env.AWS_SECRET_ACCESS_KEY = 'local-test';
process.env.AWS_ENDPOINT_URL = 'https://storage.example.invalid';
process.env.AWS_S3_BUCKET_NAME = 'chat-evidence';
let persisted, uploaded, deleted, dbFailure, uploadFailure, transactions;
globalThis.prisma = {
  task: { findUnique: async () => ({ id: 'task-demo', clientId: 'client-demo', client: { name: 'Demo' }, assigneeId: null }) },
  user: { findMany: async () => [] },
  taskComment: { findMany: async () => [] },
  $transaction: async operation => {
    transactions++;
    let comment;
    const attachments = [];
    const tx = {
      taskComment: {
        create: async ({ data }) => { comment = { id: 'comment-new', ...data }; return comment; },
        findUnique: async () => ({ ...comment, attachments, author: { id: 'author-demo', name: 'Demo' } })
      },
      taskAttachment: {
        create: async ({ data }) => { attachments.push({ id: `file-${attachments.length}`, ...data }); return attachments.at(-1); },
        createMany: async ({ data }) => { attachments.push(...data.map((file, i) => ({ id: `file-${i}`, ...file }))); return { count: data.length }; }
      }
    };
    const result = await operation(tx);
    if (dbFailure) throw new Error('Simulated transaction failure');
    persisted.push(result);
    return result;
  }
};
const { addTaskComment } = await import('../src/controllers/taskController.js');
const { uploadToS3 } = await import('../src/services/s3Service.js');
before(() => {
  test.mock.method(S3Client.prototype, 'send', async command => {
    if (command.constructor.name === 'DeleteObjectCommand') { deleted.push(command.input.Key); return {}; }
    assert.equal(command.constructor.name, 'PutObjectCommand');
    if (uploadFailure && uploaded.length === 1) throw new Error('Simulated upload failure');
    uploaded.push(command.input);
    return {};
  });
});
after(() => test.mock.restoreAll());
const file = (name, content = name) => ({ fieldname: 'file', originalname: name, mimetype: 'image/png', buffer: Buffer.from(content), size: Buffer.byteLength(content) });
function reset() { persisted = []; uploaded = []; deleted = []; dbFailure = false; uploadFailure = false; transactions = 0; }
async function send({ content = '<p>Estas son las fotos finales</p>', files, single } = {}) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
  await addTaskComment({ params: { taskId: 'task-demo' }, user: { userId: 'author-demo' }, body: { content }, files, file: single }, res);
  return res;
}
test('one request atomically associates rich text and all selected files with one comment', async () => {
  reset();
  const inputs = [file('a.png'), file('b.png'), file('c.png')];
  const res = await send({ files: inputs });
  assert.equal(res.statusCode, 201);
  assert.equal(persisted.length, 1);
  assert.equal(transactions, 1);
  assert.equal(res.data.content, '<p>Estas son las fotos finales</p>');
  assert.deepEqual(res.data.attachments.map(a => a.name), inputs.map(f => f.originalname));
  assert.ok(res.data.attachments.every(a => a.commentId === res.data.id && a.taskId === 'task-demo'));
  assert.equal(uploaded.length, 3);
  assert.deepEqual(uploaded.map(object => object.Body.toString()), inputs.map(f => f.buffer.toString()));
});
test('files can be sent without text and text can be sent without files', async () => {
  reset();
  assert.equal((await send({ content: '', files: [file('a.png')] })).statusCode, 201);
  assert.equal(persisted[0].attachments.length, 1);
  assert.equal((await send({ files: [] })).statusCode, 201);
  assert.equal(persisted[1].attachments.length, 0);
});
test('legacy single-file callers still send text and file together', async () => {
  reset();
  const res = await send({ single: file('single.png') });
  assert.equal(res.statusCode, 201);
  assert.equal(res.data.attachments.length, 1);
});
test('a failed upload does not publish partial comments and removes only newly uploaded objects', async () => {
  reset(); uploadFailure = true;
  const res = await send({ files: [file('a.png'), file('b.png')] });
  assert.equal(res.statusCode, 500);
  assert.equal(persisted.length, 0);
  assert.equal(transactions, 0);
  assert.deepEqual(deleted, uploaded.map(object => object.Key));
});
test('failed persistence does not confirm success and cleans this request uploads', async () => {
  reset(); dbFailure = true;
  const res = await send({ files: [file('a.png'), file('b.png')] });
  assert.equal(res.statusCode, 500);
  assert.equal(persisted.length, 0);
  assert.equal(uploaded.length, 2);
  assert.deepEqual(deleted, uploaded.map(object => object.Key));
});
test('validate every file, batch count and total size before uploading anything', async () => {
  for (const inputs of [
    [file('safe.png'), { ...file('bad.html'), mimetype: 'text/html' }],
    Array.from({ length: 11 }, () => file('a.png')),
    [{ ...file('a.png'), size: 15 * 1024 * 1024 }, { ...file('b.png'), size: 15 * 1024 * 1024 }]
  ]) {
    reset();
    const res = await send({ files: inputs });
    assert.ok([400, 413, 415].includes(res.statusCode));
    assert.equal(uploaded.length, 0);
    assert.equal(persisted.length, 0);
  }
});
test('simultaneous uploads with equal or sanitization-colliding names never overwrite each other', async t => {
  reset(); t.mock.method(Date, 'now', () => 1789050000000);
  const results = await Promise.all([file('foto.png', 'first'), file('foto.png', 'second'), file('á.png', 'third'), file('é.png', 'fourth')].map(f => uploadToS3(f, 'test-folder')));
  assert.equal(new Set(results.map(result => result.key)).size, 4);
});
