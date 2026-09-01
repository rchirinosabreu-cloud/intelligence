import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const getStorageConfig = () => ({
  endpoint: process.env.BRIA_STORAGE_ENDPOINT || process.env.AWS_ENDPOINT_URL,
  accessKeyId: process.env.BRIA_STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.BRIA_STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
  bucketName: process.env.BRIA_STORAGE_BUCKET || process.env.AWS_S3_BUCKET_NAME
});

export const createDocumentStorage = ({ client, bucketName } = {}) => {
  const config = getStorageConfig();
  const resolvedBucket = bucketName || config.bucketName;
  const resolvedClient = client || (
    config.endpoint && config.accessKeyId && config.secretAccessKey
      ? new S3Client({
        endpoint: config.endpoint,
        region: 'us-east-1',
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey
        },
        forcePathStyle: true
      })
      : null
  );

  return {
    isConfigured: Boolean(resolvedClient && resolvedBucket),
    async uploadJson({ key, value }) {
      if (!resolvedClient || !resolvedBucket) throw new Error('BRIA_STORAGE_NOT_CONFIGURED');
      const body = Buffer.from(JSON.stringify(value, null, 2), 'utf8');
      await resolvedClient.send(new PutObjectCommand({
        Bucket: resolvedBucket,
        Key: key,
        Body: body,
        ContentType: 'application/json; charset=utf-8'
      }));
      return { key, size: body.length, mimeType: 'application/json' };
    },
    async uploadBuffer({ key, body, mimeType = 'application/octet-stream' }) {
      if (!resolvedClient || !resolvedBucket) throw new Error('BRIA_STORAGE_NOT_CONFIGURED');
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
      await resolvedClient.send(new PutObjectCommand({
        Bucket: resolvedBucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType
      }));
      return { key, size: buffer.length, mimeType };
    },
    async downloadJson({ key }) {
      if (!resolvedClient || !resolvedBucket) throw new Error('BRIA_STORAGE_NOT_CONFIGURED');
      if (!key) throw new Error('BRIA_STORAGE_KEY_REQUIRED');
      const response = await resolvedClient.send(new GetObjectCommand({
        Bucket: resolvedBucket,
        Key: key
      }));
      if (!response.Body) throw new Error('BRIA_STORAGE_FILE_EMPTY');
      const body = await response.Body.transformToString('utf8');
      return JSON.parse(body);
    },
    async downloadBuffer({ key }) {
      if (!resolvedClient || !resolvedBucket) throw new Error('BRIA_STORAGE_NOT_CONFIGURED');
      if (!key) throw new Error('BRIA_STORAGE_KEY_REQUIRED');
      const response = await resolvedClient.send(new GetObjectCommand({ Bucket: resolvedBucket, Key: key }));
      if (!response.Body) throw new Error('BRIA_STORAGE_FILE_EMPTY');
      const bytes = await response.Body.transformToByteArray();
      return {
        body: Buffer.from(bytes),
        mimeType: response.ContentType || 'application/octet-stream',
        size: Number(response.ContentLength || bytes.length)
      };
    },
    async deleteMany({ keys = [] }) {
      if (!resolvedClient || !resolvedBucket) throw new Error('BRIA_STORAGE_NOT_CONFIGURED');
      const normalizedKeys = [...new Set(keys
        .map(key => String(key || '').trim())
        .filter(Boolean))];
      let deleted = 0;
      for (let index = 0; index < normalizedKeys.length; index += 1000) {
        const batch = normalizedKeys.slice(index, index + 1000);
        const response = await resolvedClient.send(new DeleteObjectsCommand({
          Bucket: resolvedBucket,
          Delete: { Objects: batch.map(Key => ({ Key })), Quiet: true }
        }));
        if (response.Errors?.length) {
          throw new Error(`BRIA_STORAGE_DELETE_FAILED:${response.Errors.map(item => item.Key).filter(Boolean).join(',')}`);
        }
        deleted += batch.length;
      }
      return { deleted };
    }
  };
};

export const documentStorage = createDocumentStorage();
