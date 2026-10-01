import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileContentProblem, sniffMediaType } from '../src/lib/fileSignature.js';
import { humanizeMetaError } from '../src/lib/socialPublishing.js';
import { createImageDerivativeService } from '../src/services/socialImageDerivativeService.js';

// Rodny, 1 October 2026: the first real carousel did not go out. One of its files, «02.png», was an
// MP4 video with the extension changed. The platform trusted the name, tried three times to turn a
// video into a JPEG and reported «Meta respondió: Input buffer contains unsupported image format» —
// Meta had never been asked anything, and nobody could tell which file it was.

const bytes = (...parts) => Buffer.concat(parts.map((part) => (typeof part === 'string' ? Buffer.from(part, 'latin1') : Buffer.from(part))));
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'rest of the file');
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], 'rest of the file');
const MP4 = bytes([0x00, 0x00, 0x00, 0x18], 'ftypmp42', [0, 0, 0, 0]);
const MOV = bytes([0x00, 0x00, 0x00, 0x14], 'ftypqt  ');
const HEIC = bytes([0x00, 0x00, 0x00, 0x18], 'ftypheic');

test('what a file is comes from its first bytes, not from its name', () => {
  assert.equal(sniffMediaType(PNG), 'image/png');
  assert.equal(sniffMediaType(JPEG), 'image/jpeg');
  assert.equal(sniffMediaType(bytes('GIF89a', 'rest of the file')), 'image/gif');
  assert.equal(sniffMediaType(bytes('RIFF', [1, 2, 3, 4], 'WEBP')), 'image/webp');
  assert.equal(sniffMediaType(MP4), 'video/mp4');
  assert.equal(sniffMediaType(MOV), 'video/quicktime');
  assert.equal(sniffMediaType(HEIC), 'image/heic');
  assert.equal(sniffMediaType(Buffer.from('hola')), null, 'unknown content: no opinion');
  assert.equal(sniffMediaType(null), null);
});

test('a video named .png is said as such, with the name of the file', () => {
  const problem = fileContentProblem({ name: '02.png', mimeType: 'image/png', bytes: MP4 });
  assert.match(problem, /«02\.png»/);
  assert.match(problem, /video/);
  assert.match(problem, /imagen/);
  assert.match(fileContentProblem({ name: 'clip.mp4', mimeType: 'video/mp4', bytes: PNG }), /«clip\.mp4».*imagen/);
  // The same family is fine even if the exact type differs: Meta or the converter deal with it.
  assert.equal(fileContentProblem({ name: 'a.png', mimeType: 'image/png', bytes: JPEG }), null);
  assert.equal(fileContentProblem({ name: 'a.mp4', mimeType: 'video/mp4', bytes: MOV }), null);
  assert.equal(fileContentProblem({ name: 'a.png', mimeType: 'image/png', bytes: PNG }), null);
  assert.equal(fileContentProblem({ name: 'a.bin', mimeType: 'image/png', bytes: Buffer.from('????????????') }), null, 'unknown content never blocks');
});

test('an image that cannot be read fails once, permanently, naming the file — for both networks', async () => {
  const asset = { id: 'a2', name: '02.png', mimeType: 'image/png', size: 6_546_517, storageKey: 'k/final-assets/02.png' };
  const service = createImageDerivativeService({
    readObject: async () => MP4,
    writeObject: async () => { throw new Error('must not write a copy of something unreadable'); },
    headObject: async () => null,
    probe: async () => { throw new Error('Input buffer contains unsupported image format'); },
    transform: async () => { throw new Error('Input buffer contains unsupported image format'); },
    logger: { info() {}, error() {} }
  });
  for (const prepare of [() => service.prepareForInstagram(asset, { kind: 'CAROUSEL' }), () => service.prepareForFacebook(asset)]) {
    await assert.rejects(prepare(), (error) => {
      assert.equal(error.permanent, true, 'retrying an unreadable file never works');
      assert.equal(error.code, 'FINAL_ASSET_UNREADABLE');
      assert.match(error.message, /«02\.png»/);
      assert.match(error.message, /video/);
      assert.doesNotMatch(error.message, /Input buffer|Meta/);
      return true;
    });
  }
  // A damaged image (right family, unreadable anyway) still names the file and asks for it again.
  const damaged = createImageDerivativeService({
    readObject: async () => PNG, writeObject: async () => {}, headObject: async () => null,
    probe: async () => { throw new Error('pngload_buffer: end of stream'); }, transform: async () => Buffer.from('x'), logger: { info() {}, error() {} }
  });
  await assert.rejects(damaged.prepareForInstagram(asset, { kind: 'IMAGE' }), (error) => error.permanent === true && /«02\.png»/.test(error.message) && /vuelve a subir/i.test(error.message));
});

test('only what Meta said is reported as said by Meta', () => {
  const meta = Object.assign(new Error('Unsupported post request'), { name: 'MetaGraphError', status: 400, code: 100 });
  assert.equal(humanizeMetaError(meta), 'Meta respondió: Unsupported post request');
  const ours = new Error('Input buffer contains unsupported image format');
  assert.doesNotMatch(humanizeMetaError(ours), /Meta respondió/);
  assert.match(humanizeMetaError(ours), /No se pudo preparar la publicación/);
});

test('the upload refuses a file whose content contradicts its name, before storing anything', () => {
  const service = readFileSync('src/services/contentService.js', 'utf8');
  const upload = service.slice(service.indexOf('export const uploadContentItemFinalAssets'));
  assert.match(upload, /fileContentProblem\(/);
  assert.ok(upload.indexOf('fileContentProblem(') < upload.indexOf('uploadToS3('), 'checked before the upload is spent');
  // A 400 with its reason: production strips the message of a 5xx and the person would see a code.
  assert.match(upload, /status: 400/);
  const routes = readFileSync('src/routes/api/content.js', 'utf8');
  assert.match(routes, /error\.status === 400 \? 400 : 500/);
});
