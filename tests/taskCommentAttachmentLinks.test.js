import test from 'node:test';
import assert from 'node:assert/strict';
import * as attachments from '../src/lib/taskCommentAttachments.js';

test('download filenames support RFC 5987 Unicode, literal percent signs and legacy headers', () => {
  assert.equal(typeof attachments.commentDownloadFilename, 'function');
  assert.equal(attachments.commentDownloadFilename("attachment; filename=\"fallback.png\"; filename*=UTF-8''Fotograf%C3%ADa%20100%25.png"), 'Fotografía 100%.png');
  assert.equal(attachments.commentDownloadFilename('attachment; filename="100% final.png"'), '100% final.png');
  assert.equal(attachments.commentDownloadFilename(null, 'foto.png'), 'foto.png');
  assert.equal(attachments.commentDownloadFilename("attachment; filename=\"safe.png\"; filename*=UTF-8''bad%xx"), 'safe.png');
});
test('file links encode identifiers and preserve the same selection for preview and download', () => {
  const urls = attachments.commentFileUrls('https://app.example', 'task', 'comment', { id: 'file&next', name: 'Mi foto.png' });
  assert.equal(new URL(urls.previewUrl).searchParams.get('attachmentId'), 'file&next');
  assert.equal(new URL(urls.downloadUrl).search, new URL(urls.previewUrl).search);
  const old = attachments.commentFileUrls('', 'task', 'comment', { url: 'https://t3.storageapi.dev/chat-evidence/photo%20a.png' });
  assert.equal(new URL(old.previewUrl, 'https://app.example').searchParams.get('url'), 'https://t3.storageapi.dev/chat-evidence/photo%20a.png');
});
