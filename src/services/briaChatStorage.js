import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { knowledgeError } from '../lib/briaKnowledge.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const prefixPattern = /^bria-chat\/[a-f0-9]{24}\/[a-f0-9]{24}\/[a-f0-9-]{36}\/$/;
export const briaChatPrefix = (workspace, actor, id) => {
  if (!uuid.test(id)) throw knowledgeError('Conversación no válida.');
  return `bria-chat/${digest(workspace).slice(0, 24)}/${digest(actor.ref).slice(0, 24)}/${id}/`;
};

// No browser URL, public ACL, client-selected key or credentials leave this service.
export const createBriaChatStorage = ({ bucket, send }) => {
  const request = command => send(command, { abortSignal: AbortSignal.timeout(30000) });
  const read = async (workspace, actor, id, key, checksum) => {
    const prefix = briaChatPrefix(workspace, actor, id);
    if (!key?.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(checksum || '')) throw knowledgeError('Adjunto no disponible.', 404);
    const object = await request(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = Buffer.from(await object.Body.transformToByteArray());
    if (bytes.length > 20971520 || digest(bytes) !== checksum) throw knowledgeError('No se pudo verificar el adjunto.', 503);
    return bytes;
  };
  return {
    read,
    async put(workspace, actor, id, file) {
      if (!uuid.test(file.id) || !file.buffer?.length || file.buffer.length > 20971520) throw knowledgeError('Adjunto no válido.');
      const prefix = `${briaChatPrefix(workspace, actor, id)}${file.id}/`;
      const stored = { storage_key: `${prefix}original`, original_sha256: digest(file.buffer), size_bytes: file.buffer.length, analysis_key: null, analysis_sha256: null };
      for (const [key, bytes] of [[stored.storage_key, file.buffer], ...(file.analysisData ? [[`${prefix}analysis`, file.analysisData]] : [])]) {
        if (!bytes.length || bytes.length > 20971520) throw knowledgeError('Adjunto no válido.');
        await request(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: 'application/octet-stream', Metadata: { sha256: digest(bytes) } }));
        await read(workspace, actor, id, key, digest(bytes));
        if (key.endsWith('/analysis')) { stored.analysis_key = key; stored.analysis_sha256 = digest(bytes); }
      }
      return stored;
    },
    async purgePrefix(prefix) {
      if (!prefixPattern.test(prefix || '') || !uuid.test(prefix.split('/')[3])) throw knowledgeError('Ámbito de borrado no válido.');
      let continuation;
      do {
        const page = await request(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuation, MaxKeys: 1000 }));
        const objects = (page.Contents || []).map(({ Key }) => ({ Key }));
        if (objects.some(({ Key }) => !Key.startsWith(prefix))) throw new Error('BRIA_STORAGE_SCOPE');
        if (objects.length) {
          const result = await request(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
          if (result.Errors?.length) throw new Error('BRIA_STORAGE_PURGE_INCOMPLETE');
        }
        continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
        if (page.IsTruncated && !continuation) throw new Error('BRIA_STORAGE_PAGE_INCOMPLETE');
      } while (continuation);
      const remaining = await request(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1 }));
      if (remaining.Contents?.length) throw new Error('BRIA_STORAGE_PURGE_INCOMPLETE');
    }
  };
};

export const getBriaChatStorage = (env = process.env) => {
  const values = ['ENDPOINT', 'BUCKET', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY'].map(name => env[`BRIA_CHAT_STORAGE_${name}`]);
  if (!values.every(Boolean)) return null;
  const client = new S3Client({ endpoint: values[0], region: env.BRIA_CHAT_STORAGE_REGION || 'auto', forcePathStyle: true, maxAttempts: 2, credentials: { accessKeyId: values[2], secretAccessKey: values[3] } });
  return createBriaChatStorage({ bucket: values[1], send: client.send.bind(client) });
};
