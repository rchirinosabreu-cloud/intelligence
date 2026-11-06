import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createPlatformStorage, getPlatformStorage } from '../src/services/platformStorageService.js';
import * as legacyStorage from '../src/services/s3Service.js';
import { createImageDerivativeService } from '../src/services/socialImageDerivativeService.js';
import { finalAssetPublicationUrl } from '../src/services/socialPublishingService.js';

const config = { PLATFORM_STORAGE_ENDPOINT: 'http://127.0.0.1:9199', PLATFORM_STORAGE_BUCKET: 'platform', PLATFORM_STORAGE_ACCESS_KEY_ID: 'fictitious-platform-key', PLATFORM_STORAGE_SECRET_ACCESS_KEY: 'fictitious-platform-secret', AWS_ENDPOINT_URL: 'http://127.0.0.1:9199', AWS_S3_BUCKET_NAME: 'legacy', BRIA_STORAGE_ENDPOINT: 'http://127.0.0.1:9199', BRIA_STORAGE_BUCKET: 'agency-memory' };

test('new deliveries never fall back to legacy credentials or its bucket', async () => {
  const calls = [];
  for (const missing of Object.keys(config).filter(key => key.startsWith('PLATFORM_'))) {
    const env = { ...config }; delete env[missing];
    const storage = createPlatformStorage({ env, client: { send: async value => calls.push(value) } });
    await assert.rejects(storage.putS3Object({ key: 'final', body: Buffer.from('x'), contentType: 'image/png' }), error => error.status === 503 && error.code === 'PLATFORM_STORAGE_NOT_CONFIGURED');
  }
  assert.equal(calls.length, 0);
  for (const bucket of ['legacy', 'agency-memory']) assert.throws(() => createPlatformStorage({ env: { ...config, PLATFORM_STORAGE_BUCKET: bucket } }).assertConfigured(), error => error.code === 'PLATFORM_STORAGE_SHARED_BUCKET');
});

test('explicit legacy and undefined bindings preserve the existing storage adapter', () => {
  assert.equal(getPlatformStorage('LEGACY').getFromS3Stream, legacyStorage.getFromS3Stream);
  assert.equal(getPlatformStorage().deleteFromS3, legacyStorage.deleteFromS3);
  assert.throws(() => getPlatformStorage('wrong'), error => error.status === 400);
});

test('platform signed URLs use virtual-hosted addressing by default and allow explicit path style', async () => {
  for (const [setting, pathStyle] of [[undefined, false], ['false', false], ['true', true]]) {
    const env = { ...config, PLATFORM_STORAGE_ENDPOINT: 'https://storage.example.invalid', PLATFORM_STORAGE_FORCE_PATH_STYLE: setting };
    const storage = createPlatformStorage({ env });
    for (const method of ['createSignedUpload', 'createSignedDownload']) {
      const signed = await storage[method]({ key: 'folder/final.png', contentType: 'image/png' });
      const url = new URL(signed.url);
      assert.equal(url.hostname, pathStyle ? 'storage.example.invalid' : 'platform.storage.example.invalid');
      assert.equal(url.pathname, pathStyle ? '/platform/folder/final.png' : '/folder/final.png');
    }
  }
});

test('dedicated storage binds put/read/copy/delete to one bucket, keeps ETag conditions and bounded reads', async () => {
  const commands = [];
  const storage = createPlatformStorage({ env: config, client: { send: async command => {
    commands.push(command);
    if (command.constructor.name === 'HeadObjectCommand') return { ContentLength: 8, ContentType: 'image/png', ETag: 'version' };
    if (command.constructor.name === 'GetObjectCommand') return { Body: Readable.from([Buffer.from('abcdefgh')]) };
    return {};
  } } });
  await storage.putS3Object({ key: 'same', body: Buffer.from('x'), contentType: 'image/png' });
  assert.equal((await storage.headS3Object('same')).etag, 'version');
  assert.equal((await storage.readS3ObjectPrefix('same', 4, { etag: 'version' })).toString(), 'abcd');
  await storage.copyS3Object('staging space/a', 'same', { etag: 'version' });
  await storage.deleteFromS3('same');
  assert.ok(commands.every(command => command.input.Bucket === 'platform'));
  assert.equal(commands.find(command => command.constructor.name === 'CopyObjectCommand').input.CopySource, 'platform/staging%20space/a');
  assert.equal(commands.find(command => command.constructor.name === 'CopyObjectCommand').input.CopySourceIfMatch, 'version');
  const read = commands.find(command => command.constructor.name === 'GetObjectCommand');
  assert.equal(read.input.Range, 'bytes=0-3');
  assert.equal(read.input.IfMatch, 'version');
});

test('both buckets keep the same trusted CORS origins and the dedicated one permits direct PUT', async () => {
  const commands = [];
  const storage = createPlatformStorage({ env: { ...config, STORAGE_CORS_ORIGINS: 'http://127.0.0.1:3183' }, client: { send: async command => commands.push(command) } });
  await storage.configureCors();
  const rule = commands[0].input.CORSConfiguration.CORSRules[0];
  assert.deepEqual(rule.AllowedMethods, ['GET', 'HEAD', 'PUT']);
  assert.ok(rule.AllowedOrigins.includes('https://intelligence.brainstudioagencia.com'));
  assert.ok(rule.AllowedOrigins.includes('https://labs.brainstudioagencia.com'));
  assert.ok(rule.AllowedOrigins.includes('http://127.0.0.1:3183'));
  assert.ok(rule.ExposeHeaders.includes('ETag'));
});

test('publication and derived images follow the final asset binding while covers remain in their legacy bucket', async () => {
  const calls = [];
  const storageFor = area => ({
    headS3Object: async key => { calls.push(['head', area, key]); return null; },
    getS3ObjectBuffer: async key => { calls.push(['read', area, key]); return Buffer.from('image'); },
    putS3Object: async ({ key }) => { calls.push(['write', area, key]); },
    createSignedDownload: async ({ key }) => { calls.push(['sign', area, key]); return { url: `https://private.invalid/${area}/${key}` }; }
  });
  const derivatives = createImageDerivativeService({ storageFor,
    probe: async () => ({ width: 1080, height: 1080 }), transform: async () => Buffer.from('converted'), logger: { info() {} } });
  const asset = { id: 'asset', storageArea: 'PLATFORM', storageKey: 'same', mimeType: 'image/png', size: 5 * 1024 * 1024 };
  await finalAssetPublicationUrl(asset, { platform: 'FACEBOOK', storageFor, derivatives });
  assert.ok(calls.length >= 4);
  assert.ok(calls.every(call => call[1] === 'PLATFORM'));
  assert.equal(calls.at(-1)[0], 'sign');
  calls.length = 0;
  await derivatives.prepareCover({ id: 'piece', coverKey: 'cover', coverMimeType: 'image/png', coverSize: 1024 });
  assert.ok(calls.length > 0);
  assert.ok(calls.every(call => call[1] === 'LEGACY'));
});
