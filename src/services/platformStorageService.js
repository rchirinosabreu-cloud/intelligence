import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, CopyObjectCommand, DeleteObjectCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { validateUploadFile } from '../config/security.js';
import * as legacyStorage from './s3Service.js';

const unavailable = (message, code = 'PLATFORM_STORAGE_NOT_CONFIGURED') => Object.assign(new Error(message), { status: 503, code });
const normalizeEndpoint = value => String(value || '').trim().replace(/\/+$/, '');

/** Final deliveries and manual Drive files share a dedicated bucket, separate from chat and agency memory. */
export function createPlatformStorage({ env = process.env, client, sign = getSignedUrl } = {}) {
  const assertConfigured = () => {
    const config = { endpoint: env.PLATFORM_STORAGE_ENDPOINT, accessKeyId: env.PLATFORM_STORAGE_ACCESS_KEY_ID, secretAccessKey: env.PLATFORM_STORAGE_SECRET_ACCESS_KEY, bucket: env.PLATFORM_STORAGE_BUCKET };
    if (Object.values(config).some(value => !String(value || '').trim())) throw unavailable('El almacenamiento de archivos de la plataforma no está configurado. Los archivos anteriores se conservan.');
    const reserved = [
      { bucket: env.AWS_S3_BUCKET_NAME || 'chat-evidence', endpoint: env.AWS_ENDPOINT_URL || 'https://t3.storageapi.dev' },
      { bucket: env.BRIA_STORAGE_BUCKET, endpoint: env.BRIA_STORAGE_ENDPOINT || env.AWS_ENDPOINT_URL || 'https://t3.storageapi.dev' }
    ];
    if (reserved.some(source => source.bucket && config.bucket === source.bucket && normalizeEndpoint(config.endpoint) === normalizeEndpoint(source.endpoint))) {
      throw unavailable('El almacenamiento de archivos de la plataforma debe estar separado del chat y de la memoria de la agencia.', 'PLATFORM_STORAGE_SHARED_BUCKET');
    }
    return config;
  };
  const context = () => {
    const config = assertConfigured();
    return { bucket: config.bucket, client: client || new S3Client({ endpoint: config.endpoint, region: 'us-east-1', credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, forcePathStyle: String(env.PLATFORM_STORAGE_FORCE_PATH_STYLE || '').trim().toLowerCase() === 'true' }) };
  };
  const signed = async (Command, { key, contentType, expiresIn = 900 }) => {
    if (!key) throw new Error('A storage key is required.');
    const ctx = context();
    const url = await sign(ctx.client, new Command({ Bucket: ctx.bucket, Key: key, ...(contentType ? { ContentType: contentType } : {}) }), { expiresIn });
    return { url, key, ...(contentType ? { contentType } : {}), expiresIn };
  };
  const getFromS3Stream = async (key, { range, etag } = {}) => {
    const ctx = context();
    return ctx.client.send(new GetObjectCommand({ Bucket: ctx.bucket, Key: key, ...(range ? { Range: range } : {}), ...(etag ? { IfMatch: etag } : {}) }));
  };
  const putS3Object = async ({ key, body, contentType }) => {
    const ctx = context();
    await ctx.client.send(new PutObjectCommand({ Bucket: ctx.bucket, Key: key, Body: body, ContentType: contentType }));
    return { key, size: body.length, mimeType: contentType };
  };
  return {
    assertConfigured,
    createSignedUpload: options => signed(PutObjectCommand, options),
    createSignedDownload: options => signed(GetObjectCommand, options),
    putS3Object,
    getFromS3Stream,
    async getS3ObjectBuffer(key) {
      const response = await getFromS3Stream(key);
      const chunks = [];
      for await (const chunk of response.Body) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    },
    async readS3ObjectPrefix(key, maxBytes = 512, { etag } = {}) {
      const length = Math.min(4096, Math.max(1, Number(maxBytes) || 512));
      const response = await getFromS3Stream(key, { range: `bytes=0-${length - 1}`, etag });
      const chunks = []; let received = 0;
      try {
        for await (const chunk of response.Body) {
          const bytes = Buffer.from(chunk).subarray(0, length - received);
          chunks.push(bytes); received += bytes.length;
          if (received >= length) break;
        }
      } finally { response.Body?.destroy?.(); }
      return Buffer.concat(chunks);
    },
    async headS3Object(key) {
      const ctx = context();
      try {
        const object = await ctx.client.send(new HeadObjectCommand({ Bucket: ctx.bucket, Key: key }));
        return { key, size: Number(object.ContentLength || 0), mimeType: String(object.ContentType || '').split(';', 1)[0].trim(), etag: object.ETag || null };
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return null;
        throw error;
      }
    },
    async copyS3Object(sourceKey, targetKey, { etag } = {}) {
      if (!sourceKey || !targetKey || sourceKey === targetKey) throw new Error('A copy needs distinct source and destination keys');
      const ctx = context();
      return ctx.client.send(new CopyObjectCommand({ Bucket: ctx.bucket, Key: targetKey,
        CopySource: `${encodeURIComponent(ctx.bucket)}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`,
        ...(etag ? { CopySourceIfMatch: etag } : {}) }));
    },
    async deleteFromS3(key) {
      if (!key) return;
      const ctx = context();
      await ctx.client.send(new DeleteObjectCommand({ Bucket: ctx.bucket, Key: key }));
    },
    async uploadToS3(file, folder = 'deliverables', { maxBytes = 25 * 1024 * 1024 } = {}) {
      validateUploadFile(file, { maxBytes });
      const name = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
      const key = `${folder}/${Date.now()}_${randomUUID()}_${name}`;
      await putS3Object({ key, body: file.buffer, contentType: file.mimetype });
      return { key, name: file.originalname, size: file.size, mimeType: file.mimetype };
    },
    async configureCors() {
      const ctx = context();
      await ctx.client.send(new PutBucketCorsCommand({ Bucket: ctx.bucket, CORSConfiguration: { CORSRules: [{
        AllowedHeaders: ['*'], AllowedMethods: ['GET', 'HEAD', 'PUT'],
        AllowedOrigins: legacyStorage.storageCorsOrigins(env), ExposeHeaders: ['Content-Length', 'Content-Type', 'ETag'], MaxAgeSeconds: 3600
      }] } }));
    }
  };
}

const dedicated = createPlatformStorage();
// LEGACY here is the task/content bucket. The Drive domain resolves its own LEGACY via documentStorage.
export function getPlatformStorage(storageArea = 'LEGACY') {
  if (storageArea == null || storageArea === 'LEGACY') return legacyStorage;
  if (storageArea === 'PLATFORM') return dedicated;
  throw Object.assign(new Error('Área de almacenamiento no válida.'), { status: 400, code: 'PLATFORM_STORAGE_AREA_INVALID' });
}
export const assertPlatformStorageConfigured = () => dedicated.assertConfigured();
export async function configurePlatformStorageCors() {
  try { await dedicated.configureCors(); }
  catch (error) { console.warn('[Platform storage] CORS pendiente:', error.code || error.name); }
}
