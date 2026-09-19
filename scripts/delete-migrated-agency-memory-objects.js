// Removes from the OLD chat/task bucket the agency-memory objects (Bria minutes, Drive uploads) that
// were already copied to the agency-memory bucket. Every key is checked against the destination first:
// it must exist there with the same size, otherwise it is kept. Dry-run by default; `--confirm BORRAR`
// deletes. It never touches the destination bucket and never deletes anything outside the prefixes.
import { pathToFileURL } from 'node:url';
import { DeleteObjectsCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { listAllObjects, readCopyConfig } from './copy-agency-memory-objects.js';

// Pure: only keys whose destination copy matches in size may go; everything else is reported and kept.
export const planMigratedDeletion = (sourceObjects, destinationObjects) => {
    const present = new Map(destinationObjects.map(object => [object.key, object]));
    const plan = { deletable: [], missingInDestination: [], sizeMismatch: [] };
    for (const object of sourceObjects) {
        const copy = present.get(object.key);
        if (!copy) plan.missingInDestination.push(object);
        else if (Number(copy.size) !== Number(object.size)) plan.sizeMismatch.push(object);
        else plan.deletable.push(object);
    }
    return plan;
};

export const summarizeDeletion = (plan, { sourceBucket, destinationBucket }) => [
    `Bucket a limpiar: ${sourceBucket}. Copia verificada en: ${destinationBucket}.`,
    `Con copia idéntica en destino (se borrarían del origen): ${plan.deletable.length}`,
    `Sin copia en destino (se conservan): ${plan.missingInDestination.length}`,
    `Con tamaño distinto en destino (se conservan): ${plan.sizeMismatch.length}`,
    ...[...plan.missingInDestination, ...plan.sizeMismatch].slice(0, 10).map(object => `  conservar ${object.key}`)
].join('\n');

const makeClient = ({ endpoint, accessKeyId, secretAccessKey }) => new S3Client({
    endpoint, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId, secretAccessKey }
});

export const runDeletion = async ({ config, confirm, log = console.log }) => {
    const sourceClient = makeClient(config.source);
    const destinationClient = makeClient(config.destination);
    const sourceObjects = [];
    const destinationObjects = [];
    for (const prefix of config.prefixes) {
        sourceObjects.push(...await listAllObjects(sourceClient, config.source.bucket, prefix));
        destinationObjects.push(...await listAllObjects(destinationClient, config.destination.bucket, prefix));
    }
    const plan = planMigratedDeletion(sourceObjects, destinationObjects);
    log(summarizeDeletion(plan, { sourceBucket: config.source.bucket, destinationBucket: config.destination.bucket }));
    if (!confirm) {
        log('\nSimulación: no se borró nada. Ejecuta con --confirm BORRAR para limpiar el bucket de origen.');
        return { plan, deleted: 0, kept: plan.missingInDestination.length + plan.sizeMismatch.length };
    }
    // Second, per-object check right before deleting: the listing could be stale.
    const verified = [];
    for (const object of plan.deletable) {
        const head = await destinationClient.send(new HeadObjectCommand({ Bucket: config.destination.bucket, Key: object.key }));
        if (Number(head.ContentLength) === Number(object.size)) verified.push(object.key);
        else log(`  conservar ${object.key}: el destino cambió de tamaño`);
    }
    let deleted = 0;
    for (let index = 0; index < verified.length; index += 1000) {
        const batch = verified.slice(index, index + 1000);
        const response = await sourceClient.send(new DeleteObjectsCommand({
            Bucket: config.source.bucket, Delete: { Objects: batch.map(Key => ({ Key })), Quiet: true }
        }));
        if (response.Errors?.length) throw new Error(`No se pudieron borrar: ${response.Errors.map(item => item.Key).join(', ')}`);
        deleted += batch.length;
    }
    log(`\nBorrados del origen: ${deleted}. Conservados: ${sourceObjects.length - deleted}. El destino no se tocó.`);
    return { plan, deleted, kept: sourceObjects.length - deleted };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const confirmIndex = process.argv.indexOf('--confirm');
    const confirm = confirmIndex !== -1 && process.argv[confirmIndex + 1] === 'BORRAR';
    try {
        const config = readCopyConfig();
        await runDeletion({ config, confirm });
    } catch (error) {
        console.error('[Agency memory cleanup] Failed:', error.message);
        process.exitCode = 1;
    }
}
