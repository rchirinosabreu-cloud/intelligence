// Copies the agency memory (Bria minutes and Drive uploads) from the shared chat/task bucket to the
// dedicated agency-memory bucket. Copy only: it never deletes, overwrites only when sizes differ, and
// reports what it did. Dry-run by default; pass `--confirm COPIAR` to write.
//
// Source (defaults to the chat bucket):     SOURCE_S3_ENDPOINT | AWS_ENDPOINT_URL, SOURCE_S3_BUCKET | AWS_S3_BUCKET_NAME,
//                                           SOURCE_S3_ACCESS_KEY_ID | AWS_ACCESS_KEY_ID, SOURCE_S3_SECRET_ACCESS_KEY | AWS_SECRET_ACCESS_KEY
// Destination (the agency-memory bucket):  BRIA_STORAGE_ENDPOINT, BRIA_STORAGE_BUCKET, BRIA_STORAGE_ACCESS_KEY_ID, BRIA_STORAGE_SECRET_ACCESS_KEY
import { pathToFileURL } from 'node:url';
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const AGENCY_MEMORY_PREFIXES = ['bria/minutes/', 'drive/uploads/'];

export const readCopyConfig = (env = process.env) => {
    const source = {
        endpoint: env.SOURCE_S3_ENDPOINT || env.AWS_ENDPOINT_URL || 'https://t3.storageapi.dev',
        bucket: env.SOURCE_S3_BUCKET || env.AWS_S3_BUCKET_NAME || '',
        accessKeyId: env.SOURCE_S3_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: env.SOURCE_S3_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY || ''
    };
    const destination = {
        endpoint: env.BRIA_STORAGE_ENDPOINT || source.endpoint,
        bucket: env.BRIA_STORAGE_BUCKET || '',
        accessKeyId: env.BRIA_STORAGE_ACCESS_KEY_ID || '',
        secretAccessKey: env.BRIA_STORAGE_SECRET_ACCESS_KEY || ''
    };
    for (const [label, config] of [['origen', source], ['destino', destination]]) {
        if (!config.bucket || !config.accessKeyId || !config.secretAccessKey) {
            throw new Error(`Faltan credenciales o bucket de ${label}.`);
        }
    }
    if (source.bucket === destination.bucket && source.endpoint === destination.endpoint) {
        throw new Error('El bucket de destino debe ser distinto del de origen.');
    }
    const prefixes = (env.AGENCY_MEMORY_PREFIXES || '').split(',').map(item => item.trim()).filter(Boolean);
    return { source, destination, prefixes: prefixes.length ? prefixes : AGENCY_MEMORY_PREFIXES };
};

// Pure: decide what to copy from two listings ({ key, size }).
export const planObjectCopy = (sourceObjects, destinationObjects) => {
    const present = new Map(destinationObjects.map(object => [object.key, object]));
    const plan = { toCopy: [], alreadyPresent: [], mismatched: [] };
    for (const object of sourceObjects) {
        const existing = present.get(object.key);
        if (!existing) plan.toCopy.push(object);
        else if (Number(existing.size) !== Number(object.size)) plan.mismatched.push(object);
        else plan.alreadyPresent.push(object);
    }
    return plan;
};

export const summarizePlan = (plan, prefixes) => {
    const bytes = [...plan.toCopy, ...plan.mismatched].reduce((sum, object) => sum + Number(object.size || 0), 0);
    const lines = [
        `Prefijos: ${prefixes.join(', ')}`,
        `Ya presentes con el mismo tamaño: ${plan.alreadyPresent.length}`,
        `Por copiar (nuevos): ${plan.toCopy.length}`,
        `Por volver a copiar (tamaño distinto): ${plan.mismatched.length}`,
        `Bytes a transferir: ${bytes}`
    ];
    for (const object of [...plan.toCopy, ...plan.mismatched].slice(0, 10)) lines.push(`  ${object.key} (${object.size} B)`);
    return lines.join('\n');
};

const makeClient = ({ endpoint, accessKeyId, secretAccessKey }) => new S3Client({
    endpoint, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId, secretAccessKey }
});

export const listAllObjects = async (client, bucket, prefix) => {
    const objects = [];
    let token;
    do {
        const response = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        for (const item of response.Contents || []) objects.push({ key: item.Key, size: Number(item.Size || 0) });
        token = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (token);
    return objects;
};

export const copyObject = async ({ sourceClient, sourceBucket, destinationClient, destinationBucket, key }) => {
    const object = await sourceClient.send(new GetObjectCommand({ Bucket: sourceBucket, Key: key }));
    const body = Buffer.from(await object.Body.transformToByteArray());
    await destinationClient.send(new PutObjectCommand({
        Bucket: destinationBucket, Key: key, Body: body, ContentLength: body.length,
        ContentType: object.ContentType || 'application/octet-stream',
        ...(object.ContentDisposition ? { ContentDisposition: object.ContentDisposition } : {})
    }));
    const head = await destinationClient.send(new HeadObjectCommand({ Bucket: destinationBucket, Key: key }));
    if (Number(head.ContentLength) !== body.length) throw new Error(`Tamaño distinto tras copiar ${key}`);
    return body.length;
};

export const runCopy = async ({ config, confirm, log = console.log }) => {
    const sourceClient = makeClient(config.source);
    const destinationClient = makeClient(config.destination);
    const sourceObjects = [];
    const destinationObjects = [];
    for (const prefix of config.prefixes) {
        sourceObjects.push(...await listAllObjects(sourceClient, config.source.bucket, prefix));
        destinationObjects.push(...await listAllObjects(destinationClient, config.destination.bucket, prefix));
    }
    const plan = planObjectCopy(sourceObjects, destinationObjects);
    log(`Origen: ${config.source.bucket} (${sourceObjects.length} objetos) → Destino: ${config.destination.bucket} (${destinationObjects.length} objetos)`);
    log(summarizePlan(plan, config.prefixes));
    if (!confirm) {
        log('\nSimulación: no se copió nada. Ejecuta con --confirm COPIAR para transferir.');
        return { plan, copied: 0, failed: [] };
    }
    let copied = 0;
    const failed = [];
    for (const object of [...plan.toCopy, ...plan.mismatched]) {
        try {
            await copyObject({ sourceClient, sourceBucket: config.source.bucket, destinationClient, destinationBucket: config.destination.bucket, key: object.key });
            copied += 1;
            if (copied % 25 === 0) log(`  copiados ${copied}…`);
        } catch (error) {
            failed.push({ key: object.key, message: error.message });
            log(`  FALLO ${object.key}: ${error.message}`);
        }
    }
    log(`\nCopiados: ${copied}. Fallidos: ${failed.length}. Nada se borró en ningún bucket.`);
    return { plan, copied, failed };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const confirmIndex = process.argv.indexOf('--confirm');
    const confirm = confirmIndex !== -1 && process.argv[confirmIndex + 1] === 'COPIAR';
    try {
        const config = readCopyConfig();
        const result = await runCopy({ config, confirm });
        if (result.failed.length) process.exitCode = 1;
    } catch (error) {
        console.error('[Agency memory copy] Failed:', error.message);
        process.exitCode = 1;
    }
}
