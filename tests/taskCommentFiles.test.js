import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { S3Client } from '@aws-sdk/client-s3';

// Only the database and object-store boundaries are replaced. The real HTTP
// controllers select the file, set headers and pipe its distinct bytes.
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/attachment_test';
process.env.AWS_ACCESS_KEY_ID = 'local-test';
process.env.AWS_SECRET_ACCESS_KEY = 'local-test';
process.env.AWS_ENDPOINT_URL = 'https://storage.example.invalid';
process.env.AWS_S3_BUCKET_NAME = 'chat-evidence';
process.env.NODE_ENV = 'test';
const unstubbed = () => { throw new Error('Unexpected database access in attachment tests'); };
globalThis.prisma = {
  taskComment: { findUnique: unstubbed },
  taskAttachment: { findFirst: unstubbed, findMany: unstubbed }
};
const { default: prisma } = await import('../src/lib/prisma.js');
const { getCommentFileProxy, getCommentFileDownloadProxy } = await import('../src/controllers/taskController.js');

const files = ['foto-a.jpg', 'foto-b.png', 'brief.pdf'].map((name, i) => ({
  id: `attachment-${i}`, taskId: 'task-demo', commentId: 'comment-demo',
  name, url: `https://storage.example.invalid/chat-evidence/demo/${i}/${name}`,
  category: 'REFERENCIA', createdAt: new Date('2026-09-10T15:00:00Z')
}));
let rows, content, commentTaskId, reads, storageError;
before(() => {
  test.mock.method(prisma.taskComment, 'findUnique', async () => ({ content, taskId: commentTaskId }));
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  test.mock.method(prisma.taskAttachment, 'findFirst', async ({ where }) => rows.find(row => matches(row, where)) || null);
  test.mock.method(prisma.taskAttachment, 'findMany', async ({ where }) => rows.filter(row => matches(row, where)));
  test.mock.method(S3Client.prototype, 'send', async command => {
    assert.equal(command.constructor.name, 'GetObjectCommand', 'No upload or deletion is allowed in these tests');
    reads.push(command.input.Key);
    if (storageError) throw storageError;
    return { ContentType: command.input.Key.endsWith('.pdf') ? 'application/pdf' : 'image/png', Body: Readable.from([Buffer.from(`bytes:${command.input.Key}`)]) };
  });
});
after(() => test.mock.restoreAll());

function reset({ attachments = files, text = '' } = {}) {
  rows = structuredClone(attachments); content = text; commentTaskId = 'task-demo'; reads = []; storageError = null;
}
async function request(handler, query = {}, params = {}) {
  const chunks = [];
  const res = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
  res.statusCode = 200; res.headers = {};
  res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };
  res.status = code => { res.statusCode = code; return res; };
  res.json = value => { res.data = value; res.end(JSON.stringify(value)); return res; };
  await handler({ params: { taskId: 'task-demo', commentId: 'comment-demo', ...params }, query }, res);
  await finished(res);
  return { status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString(), data: res.data };
}

for (const [action, handler] of [['preview', getCommentFileProxy], ['download', getCommentFileDownloadProxy]]) {
  test(`${action}: each attachment ID returns its own bytes, not the first file`, async () => {
    reset();
    for (const file of files) {
      const result = await request(handler, { attachmentId: file.id });
      assert.equal(result.status, 200);
      assert.equal(result.body, `bytes:demo/${files.indexOf(file)}/${file.name}`);
    }
  });
  test(`${action}: duplicate display names remain distinct by ID`, async () => {
    reset({ attachments: files.map(file => ({ ...file, name: 'foto.jpg' })) });
    const first = await request(handler, { attachmentId: files[0].id });
    const second = await request(handler, { attachmentId: files[1].id });
    assert.notEqual(first.body, second.body);
  });
  test(`${action}: older clients can select an unambiguous exact filename`, async () => {
    reset();
    const result = await request(handler, { filename: 'foto-b.png' });
    assert.equal(result.body, 'bytes:demo/1/foto-b.png');
  });
  test(`${action}: missing or ambiguous selectors never silently choose a file`, async () => {
    reset();
    assert.equal((await request(handler)).status, 409);
    reset({ attachments: files.map(file => ({ ...file, name: 'foto.jpg' })) });
    assert.equal((await request(handler, { filename: 'foto.jpg' })).status, 409);
    assert.deepEqual(reads, []);
  });
  test(`${action}: invalid IDs and IDs from other comments/tasks never fall back`, async () => {
    for (const extra of [null, { ...files[1], id: 'foreign', commentId: 'another-comment' }, { ...files[1], id: 'foreign', taskId: 'another-task' }]) {
      reset({ attachments: extra ? [...files, extra] : files });
      assert.equal((await request(handler, { attachmentId: 'foreign', filename: files[0].name, url: files[0].url })).status, 404);
      assert.deepEqual(reads, []);
    }
  });
  test(`${action}: historical URLs select the exact original, including mixed structured/legacy comments`, async () => {
    for (const attachments of [[], [files[0]]]) {
      reset({ attachments, text: files.map(file => file.url).join('\n') });
      for (const file of files) {
        const result = await request(handler, { url: file.url });
        assert.equal(result.body, `bytes:demo/${files.indexOf(file)}/${file.name}`);
      }
    }
  });
  test(`${action}: historical HTML links and encoded filenames are preserved`, async () => {
    const url = 'https://storage.example.invalid/chat-evidence/demo/170_Imagen%20final.png';
    reset({ attachments: [], text: `<p>Referencia: <a href="${url}">Imagen final</a></p>` });
    assert.equal((await request(handler, { url })).body, 'bytes:demo/170_Imagen final.png');
  });
  test(`${action}: arbitrary URLs/keys and malformed selectors cannot access storage`, async () => {
    for (const query of [{ url: 'https://storage.example.invalid/chat-evidence/other/private.png' }, { url: 'https://evil.invalid/chat-evidence/demo/0/foto-a.jpg' }, { attachmentId: '' }, { attachmentId: [files[0].id, files[1].id] }]) {
      reset({ text: files[0].url });
      assert.ok([400, 404].includes((await request(handler, query)).status));
      assert.deepEqual(reads, []);
    }
  });
  test(`${action}: a single historical file remains accessible without a selector`, async () => {
    reset({ attachments: [], text: files[0].url });
    assert.equal((await request(handler)).body, 'bytes:demo/0/foto-a.jpg');
  });
  test(`${action}: task/comment mismatch does not read any file`, async () => {
    reset(); commentTaskId = 'another-task';
    assert.equal((await request(handler, { attachmentId: files[0].id })).status, 404);
    assert.deepEqual(reads, []);
  });
  test(`${action}: a deleted object returns 404 without substituting another attachment`, async () => {
    reset(); storageError = Object.assign(new Error('missing test object'), { name: 'NoSuchKey' });
    assert.equal((await request(handler, { attachmentId: files[1].id })).status, 404);
    assert.deepEqual(reads, ['demo/1/foto-b.png']);
  });
}

test('download: filename and content type belong to the selected file', async () => {
  reset();
  const result = await request(getCommentFileDownloadProxy, { attachmentId: files[2].id, filename: 'forged.jpg' });
  assert.equal(result.headers['content-type'], 'application/pdf');
  assert.match(result.headers['content-disposition'], /brief\.pdf/);
  assert.match(result.headers['access-control-expose-headers'], /Content-Disposition/);
});
