import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { recordCollectionActivity } from '../src/services/collectionActivityService.js';
import { followUpNotice } from '../src/services/importantNoticeService.js';

const testUrl = briaTestDatabaseUrl();
test('PostgreSQL: gestiones de cobro idempotentes y alcance transaccional', { skip: !testUrl, timeout: 90000 }, async (t) => {
    const schema = `collection_scope_${randomUUID().replaceAll('-', '')}`;
    const connection = new pg.Client({ connectionString: testUrl });
    await connection.connect();
    await connection.query(`CREATE SCHEMA "${schema}"`);
    await connection.query(`SET search_path TO "${schema}"`);
    const scopedUrl = new URL(testUrl);
    scopedUrl.searchParams.set('schema', schema);
    const db = new PrismaClient({ datasources: { db: { url: scopedUrl.href } } });
    t.after(async () => {
        await db.$disconnect();
        await connection.query(`DROP SCHEMA "${schema}" CASCADE`);
        await connection.end();
    });
    // DDL actual limitado a este recorrido en un esquema propio; no usa public, .env ni db push.
    const ddl = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], {
        encoding: 'utf8', env: { ...process.env, DATABASE_URL: scopedUrl.href }, stdio: ['ignore', 'pipe', 'pipe']
    });
    const tables = new Set(['User', 'TeamMember', 'Client', 'ClientContract', 'AccountsReceivable', 'ReceivablePayment', 'ImportantNotice', 'CollectionActivity', 'CollectionSetting', 'OperationalTraceEvent']);
    for (const [statement] of ddl.matchAll(/CREATE TYPE "[^"]+" AS ENUM \([\s\S]*?\);/g)) await connection.query(statement);
    for (const [statement, name] of ddl.matchAll(/CREATE TABLE "([^"]+)" \([\s\S]*?\n\);/g)) if (tables.has(name)) await connection.query(statement);
    for (const [statement, table] of ddl.matchAll(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([^"]+)"[^;]+;/g)) if (tables.has(table)) await connection.query(statement);
    for (const [statement, table, target] of ddl.matchAll(/ALTER TABLE "([^"]+)" ADD CONSTRAINT [^;]+?REFERENCES "([^"]+)"[^;]+;/g)) if (tables.has(table) && tables.has(target)) await connection.query(statement);

    const now = new Date('2026-11-04T15:00:00Z');
    const user = await db.user.create({ data: { name: 'Administración prueba', email: `${randomUUID()}@example.invalid`, password: 'local-only-fixture', role: 'ADMIN' } });
    await db.teamMember.create({ data: { name: user.name, role: 'Coordinadora Administrativa y Contable', areas: ['ADMINISTRATIVA'], userId: user.id, isActive: true } });
    const actor = { userId: user.id, name: user.name, role: 'ADMIN' };
    const client = await db.client.create({ data: { name: 'Cliente de prueba', slug: randomUUID() } });
    const other = await db.client.create({ data: { name: 'Otro cliente', slug: randomUUID() } });
    const debt = async (period, owner = client.id) => db.accountsReceivable.create({ data: { clientId: owner, amount: 1000, period: new Date(`${period}T12:00:00Z`), metadata: { collectionMode: 'MENSUAL' } } });
    const first = await debt('2026-08-01');
    const second = await debt('2026-09-01');
    const later = await debt('2026-10-01');
    await db.accountsReceivable.update({where:{id:later.id},data:{dueDate:new Date('2026-12-01T12:00:00Z')}});
    const foreign = await debt('2026-09-01', other.id);

    await t.test('dos reintentos simultáneos dejan una fila y conservan la identidad original', async () => {
        const input = { clientId: client.id, receivableId: first.id, channel: 'WHATSAPP', noticeId: 'concurrent-notice', source: 'AVISO' };
        const rows = await Promise.all([recordCollectionActivity(db, input, actor, { now }), recordCollectionActivity(db, input, actor, { now })]);
        assert.equal(rows[0].id, rows[1].id);
        assert.equal(await db.collectionActivity.count({ where: { noticeId: input.noticeId } }), 1);
        const retry = await recordCollectionActivity(db, input, { ...actor, name: 'Nombre nuevo' }, { now: new Date(now.getTime() + 1000) });
        assert.equal(retry.authorName, user.name);
        assert.equal(retry.occurredAt.toISOString(), now.toISOString());
    });

    await t.test('si la segunda obligación no pertenece al cliente se revierte también la primera gestión', async () => {
        await assert.rejects(db.$transaction(async (tx) => {
            await recordCollectionActivity(tx, { clientId: client.id, receivableId: first.id, channel: 'CORREO', noticeId: 'rollback-first' }, actor, { now });
            await recordCollectionActivity(tx, { clientId: client.id, receivableId: foreign.id, channel: 'CORREO', noticeId: 'rollback-second' }, actor, { now });
        }, { isolationLevel: 'Serializable' }), { statusCode: 409 });
        assert.equal(await db.collectionActivity.count({ where: { noticeId: { in: ['rollback-first', 'rollback-second'] } } }), 0);
    });

    await t.test('el aviso registra exactamente las dos obligaciones mostradas, dejando fuera una posterior', async () => {
        const notice = await db.importantNotice.create({ data: { userId: user.id, kind: 'CARTERA_MENSUAL', level: 'IMPORTANTE', subjectId: client.id, label: 'Cartera vencida', message: 'Dos obligaciones mostradas', createdAt: now } });
        await assert.rejects(followUpNotice(db,notice.id,{channel:'LLAMADA',receivableIds:[first.id]},actor,{now}),{statusCode:409});
        assert.equal(await db.collectionActivity.count({where:{noticeId:{startsWith:notice.id}}}),0);
        await followUpNotice(db, notice.id, { channel: 'LLAMADA', receivableIds: [first.id, second.id] }, actor, { now, log: () => {} });
        const rows = await db.collectionActivity.findMany({ where: { noticeId: { startsWith: `${notice.id}:` } } });
        assert.deepEqual(rows.map((row) => row.receivableId).sort(), [first.id, second.id].sort());
        assert.ok(rows.every((row) => row.receivableId !== later.id));
        assert.equal((await db.importantNotice.findUnique({ where: { id: notice.id } })).resolution, 'SEGUIMIENTO');
    });
});
