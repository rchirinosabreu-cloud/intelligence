import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AGENCY_MEMORY_PREFIXES, planObjectCopy, readCopyConfig, summarizePlan } from '../scripts/copy-agency-memory-objects.js';
import { planMigratedDeletion, summarizeDeletion } from '../scripts/delete-migrated-agency-memory-objects.js';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('the agency memory lives under the minutes and drive prefixes and the copy needs two different buckets', () => {
    assert.deepEqual(AGENCY_MEMORY_PREFIXES, ['bria/minutes/', 'drive/uploads/']);
    const env = {
        AWS_S3_BUCKET_NAME: 'chat-evidence-cjupwwro9k', AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b',
        BRIA_STORAGE_BUCKET: 'agency-memory-x', BRIA_STORAGE_ACCESS_KEY_ID: 'c', BRIA_STORAGE_SECRET_ACCESS_KEY: 'd'
    };
    const config = readCopyConfig(env);
    assert.equal(config.source.bucket, 'chat-evidence-cjupwwro9k');
    assert.equal(config.destination.bucket, 'agency-memory-x');
    assert.equal(config.destination.endpoint, 'https://t3.storageapi.dev');
    assert.deepEqual(config.prefixes, AGENCY_MEMORY_PREFIXES);
    assert.throws(() => readCopyConfig({ ...env, BRIA_STORAGE_BUCKET: env.AWS_S3_BUCKET_NAME }), /distinto/);
    assert.throws(() => readCopyConfig({ ...env, BRIA_STORAGE_SECRET_ACCESS_KEY: '' }), /destino/);
    assert.throws(() => readCopyConfig({ ...env, AWS_ACCESS_KEY_ID: '' }), /origen/);
});

test('the plan copies what is missing, re-copies what differs in size and leaves the rest alone', () => {
    const source = [
        { key: 'bria/minutes/2026/abc/minute.json', size: 100 },
        { key: 'bria/minutes/2026/abc/transcript.json', size: 900 },
        { key: 'drive/uploads/2026/x-factura.pdf', size: 5000 }
    ];
    const destination = [
        { key: 'bria/minutes/2026/abc/minute.json', size: 100 },
        { key: 'bria/minutes/2026/abc/transcript.json', size: 10 }
    ];
    const plan = planObjectCopy(source, destination);
    assert.deepEqual(plan.alreadyPresent.map(o => o.key), ['bria/minutes/2026/abc/minute.json']);
    assert.deepEqual(plan.mismatched.map(o => o.key), ['bria/minutes/2026/abc/transcript.json']);
    assert.deepEqual(plan.toCopy.map(o => o.key), ['drive/uploads/2026/x-factura.pdf']);
    const summary = summarizePlan(plan, AGENCY_MEMORY_PREFIXES);
    assert.match(summary, /Por copiar \(nuevos\): 1/);
    assert.match(summary, /Bytes a transferir: 5900/);
    assert.deepEqual(planObjectCopy([], []), { toCopy: [], alreadyPresent: [], mismatched: [] });
});

test('cleaning the old bucket only removes objects whose copy exists in the new one with the same size', () => {
    const source = [
        { key: 'bria/minutes/2026/a/minute.json', size: 100 },
        { key: 'bria/minutes/2026/a/transcript.json', size: 900 },
        { key: 'drive/uploads/2026/x.pdf', size: 5000 }
    ];
    const destination = [
        { key: 'bria/minutes/2026/a/minute.json', size: 100 },
        { key: 'bria/minutes/2026/a/transcript.json', size: 899 }
    ];
    const plan = planMigratedDeletion(source, destination);
    assert.deepEqual(plan.deletable.map(o => o.key), ['bria/minutes/2026/a/minute.json']);
    assert.deepEqual(plan.sizeMismatch.map(o => o.key), ['bria/minutes/2026/a/transcript.json']);
    assert.deepEqual(plan.missingInDestination.map(o => o.key), ['drive/uploads/2026/x.pdf']);
    const summary = summarizeDeletion(plan, { sourceBucket: 'chat', destinationBucket: 'memory' });
    assert.match(summary, /se borrarían del origen\): 1/);
    assert.match(summary, /Sin copia en destino \(se conservan\): 1/);
    const script = read('../scripts/delete-migrated-agency-memory-objects.js');
    assert.match(script, /--confirm BORRAR/);
    assert.match(script, /HeadObjectCommand/, 'each key is re-verified in the destination right before deleting');
    assert.ok(!/Bucket: config\.destination\.bucket, Delete/.test(script), 'the destination bucket is never a delete target');
});

test('the copy script and the document storage never delete from the source and prefer the dedicated bucket', () => {
    const script = read('../scripts/copy-agency-memory-objects.js');
    assert.doesNotMatch(script, /DeleteObject|DeleteObjects|deleteMany/, 'a copy is a copy');
    assert.match(script, /--confirm COPIAR/, 'writes need an explicit confirmation');
    const storage = read('../src/services/documentStorageService.js');
    assert.match(storage, /process\.env\.BRIA_STORAGE_BUCKET \|\| process\.env\.AWS_S3_BUCKET_NAME/, 'BRIA_STORAGE_BUCKET wins over the chat bucket');
    assert.match(storage, /AGENCY_MEMORY_SHARED_BUCKET/, 'falling back to the chat bucket is logged loudly');
    const docs = read('../docs/AGENCY_MEMORY_STORAGE.md');
    for (const name of ['BRIA_STORAGE_BUCKET', 'BRIA_STORAGE_ACCESS_KEY_ID', 'BRIA_STORAGE_SECRET_ACCESS_KEY', 'BRIA_STORAGE_ENDPOINT']) assert.ok(docs.includes(name), name);
});
