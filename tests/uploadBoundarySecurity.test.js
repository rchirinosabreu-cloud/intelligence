import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateUploadFile } from '../src/config/security.js';

test('central upload validation accepts normal work files', () => {
  assert.doesNotThrow(() => validateUploadFile({
    originalname: 'brief final.pdf',
    mimetype: 'application/pdf',
    size: 1024
  }, { maxBytes: 2048 }));
});

test('central upload validation rejects active content, executables and oversized files', () => {
  for (const file of [
    { originalname: 'payload.exe', mimetype: 'application/octet-stream', size: 10 },
    { originalname: 'preview.svg', mimetype: 'image/svg+xml', size: 10 },
    { originalname: 'landing.html', mimetype: 'text/html', size: 10 },
    { originalname: 'macro.xlsm', mimetype: 'application/vnd.ms-excel.sheet.macroEnabled.12', size: 10 }
  ]) {
    assert.throws(() => validateUploadFile(file), { code: 'UNSAFE_FILE_TYPE' });
  }

  assert.throws(() => validateUploadFile({
    originalname: 'large.pdf',
    mimetype: 'application/pdf',
    size: 3000
  }, { maxBytes: 2048 }), { code: 'FILE_TOO_LARGE' });
});

test('storage and HTTP errors enforce upload boundaries centrally', () => {
  const s3Source = readFileSync(join(process.cwd(), 'src/services/s3Service.js'), 'utf8');
  const gcsSource = readFileSync(join(process.cwd(), 'src/services/storageService.js'), 'utf8');
  const clientFilesSource = readFileSync(join(process.cwd(), 'src/routes/api/clientFiles.js'), 'utf8');
  const serverSource = readFileSync(join(process.cwd(), 'server.js'), 'utf8');

  assert.match(s3Source, /validateUploadFile\(file/);
  assert.match(gcsSource, /validateUploadFile\(file/);
  assert.match(clientFilesSource, /storedMetadata\.contentType/);
  assert.match(clientFilesSource, /validateUploadFile/);
  assert.match(serverSource, /LIMIT_FILE_SIZE/);
  assert.match(serverSource, /status\(413\)/);
});

test('AI proxies never forward raw upstream error bodies', () => {
  const source = readFileSync(join(process.cwd(), 'src/controllers/proxyController.js'), 'utf8');

  assert.doesNotMatch(source, /send\(await response\.text\(\)\)/);
  assert.doesNotMatch(source, /status\(response\.status\)\.send\(data\)/);
  assert.match(source, /UPSTREAM_SERVICE_ERROR/);
});

test('avatar uploads require a safe image MIME type', () => {
  const source = readFileSync(join(process.cwd(), 'src/routes/api/talentRadar.js'), 'utf8');

  assert.match(source, /file\.mimetype\.startsWith\('image\/'\)/);
  assert.match(source, /status\(415\)/);
});
