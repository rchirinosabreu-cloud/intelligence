import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

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
    }
  };
};

export const documentStorage = createDocumentStorage();
