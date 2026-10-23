import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import {
    AUDIT_TABLES, AUDIT_PURGE_SQL, ensureAuditImmutability, purgeAuditRows, purgeAuditRowsWithPrisma
} from '../src/lib/auditImmutability.js';
import { USAGE_RETENTION_DAYS } from '../src/services/aiUsageLog.js';
import { TRACE_RETENTION_DAYS } from '../src/services/operationalTraceService.js';

// Inmutabilidad de los registros de auditoría (12 de octubre de 2026): la base rechaza editar o borrar
// cualquier fila de auditoría, salvo la purga automática por antigüedad dentro de una transacción marcada.

const byName = (name) => AUDIT_TABLES.find((spec) => spec.name === name);
const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const sqlFiles = (await Promise.all(['vault.sql', 'bria-agency-facts.sql', 'bria-knowledge.sql', 'bria-daily-reading.sql']
    .map((file) => readFile(new URL(`../scripts/sql/${file}`, import.meta.url), 'utf8')))).join('\n');

test('el catálogo cubre todos los registros de auditoría y de historial', () => {
    assert.deepEqual(AUDIT_TABLES.map((spec) => `${spec.schema}.${spec.name}`).sort(), [
        'bria_memory.agency_fact_events', 'bria_memory.decision_events', 'bria_memory.learning_events',
        'public.AiGovernanceEvent', 'public.AiUsageEvent', 'public.DeletedTaskLog',
        'public.FinancialAuditEvent', 'public.OperationalTraceEvent',
        'vault.credential_events', 'vault.reveal_events'
    ]);
});

test('solo los dos registros con retención admiten la purga, con la misma antigüedad que su servicio', () => {
    const withRetention = AUDIT_TABLES.filter((spec) => spec.retention).map((spec) => spec.name).sort();
    assert.deepEqual(withRetention, ['AiUsageEvent', 'OperationalTraceEvent']);
    assert.deepEqual(byName('AiUsageEvent').retention, { column: 'occurredAt', days: USAGE_RETENTION_DAYS });
    assert.deepEqual(byName('OperationalTraceEvent').retention, { column: 'occurredAt', days: TRACE_RETENTION_DAYS });
});

test('las columnas que una llave foránea pone en NULL coinciden con el esquema de Prisma', () => {
    // Borrar un usuario pone en NULL al autor de estas filas (onDelete: SetNull); es lo único que se deja tocar.
    assert.deepEqual(byName('OperationalTraceEvent').nullableRefs, ['actorId', 'subjectUserId']);
    assert.deepEqual(byName('FinancialAuditEvent').nullableRefs, ['actorId']);
    for (const spec of AUDIT_TABLES.filter((item) => item.schema === 'public')) {
        const model = schema.match(new RegExp(`model ${spec.name} \\{([\\s\\S]*?)\\n\\}`))?.[1];
        assert.ok(model, `${spec.name} existe en schema.prisma`);
        const setNull = [...model.matchAll(/fields: \[(\w+)\][^)]*onDelete: SetNull/g)].map((match) => match[1]);
        assert.deepEqual([...spec.nullableRefs].sort(), setNull.sort(), `${spec.name}: columnas SetNull`);
        if (spec.retention) assert.match(model, new RegExp(`\\b${spec.retention.column}\\b`));
    }
    for (const spec of AUDIT_TABLES.filter((item) => item.schema !== 'public')) {
        assert.match(sqlFiles, new RegExp(`CREATE TABLE IF NOT EXISTS ${spec.schema}\\.${spec.name} \\(`));
        assert.deepEqual(spec.nullableRefs, [], `${spec.name} no tiene llaves que pongan NULL`);
        assert.equal(spec.retention, null, `${spec.name} no se purga`);
    }
});

test('el arranque protege los registros después de crear todas las tablas', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const steps = pkg.scripts.start.split('&&').map((step) => step.trim());
    const index = steps.indexOf('node scripts/ensure-audit-immutability.js');
    assert.ok(index > 0, 'encadenado en start');
    const lastEnsure = steps.findLastIndex((step) => /ensure-.*\.js$/.test(step) && !step.includes('audit-immutability'));
    assert.ok(index > lastEnsure, 'después de todos los ensure');
    assert.ok(index < steps.indexOf('node server.js'));
});

const fakePgPool = () => {
    const queries = [];
    let released = 0;
    const client = { query: async (sql) => { queries.push(sql.trim()); return { rowCount: 2, rows: [] }; }, release: () => { released += 1; } };
    return { queries, released: () => released, connect: async () => client };
};

test('la purga con pg marca la transacción antes de borrar y la cierra', async () => {
    const pool = fakePgPool();
    const result = await purgeAuditRows(pool, 'DELETE FROM "AiUsageEvent" WHERE "occurredAt" < $1', [new Date()]);
    assert.equal(result.rowCount, 2);
    assert.deepEqual(pool.queries, ['BEGIN', AUDIT_PURGE_SQL, 'DELETE FROM "AiUsageEvent" WHERE "occurredAt" < $1', 'COMMIT']);
    assert.equal(pool.released(), 1);
});

test('si la purga falla, la transacción se deshace y la conexión se devuelve', async () => {
    const queries = [];
    const client = { query: async (sql) => { queries.push(sql); if (sql.startsWith('DELETE')) throw new Error('rechazado'); return {}; }, release: () => queries.push('release') };
    await assert.rejects(purgeAuditRows({ connect: async () => client }, 'DELETE FROM x', []), /rechazado/);
    assert.deepEqual(queries.slice(-2), ['ROLLBACK', 'release']);
});

test('la purga con Prisma marca la transacción interactiva antes de borrar', async () => {
    const calls = [];
    const tx = { $executeRawUnsafe: async (sql) => calls.push(sql), operationalTraceEvent: { deleteMany: async () => { calls.push('deleteMany'); return { count: 1 }; } } };
    const db = { $transaction: async (fn) => fn(tx) };
    const result = await purgeAuditRowsWithPrisma(db, (client) => client.operationalTraceEvent.deleteMany({}));
    assert.deepEqual(result, { count: 1 });
    assert.deepEqual(calls, [AUDIT_PURGE_SQL, 'deleteMany']);
});

// --- PostgreSQL real: tablas de muestra en un esquema propio que se borra al terminar ---
const connectionString = briaTestDatabaseUrl();

test('PostgreSQL real: la base rechaza editar y borrar auditoría, salvo la purga marcada y el NULL de una llave', { skip: !connectionString }, async () => {
    const pool = new pg.Pool({ connectionString, max: 2 });
    const scratch = `audit_guard_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const q = (sql, params) => pool.query(sql, params);
    const rejected = /no se puede modificar ni borrar/;
    try {
        await q(`CREATE SCHEMA ${scratch}`);
        await q(`CREATE TABLE ${scratch}.users (id TEXT PRIMARY KEY)`);
        await q(`CREATE TABLE ${scratch}.trace (id TEXT PRIMARY KEY, "occurredAt" TIMESTAMP(3) NOT NULL, "actorId" TEXT REFERENCES ${scratch}.users(id) ON DELETE SET NULL, note TEXT)`);
        await q(`CREATE TABLE ${scratch}.ledger (id TEXT PRIMARY KEY, "actorId" TEXT REFERENCES ${scratch}.users(id) ON DELETE SET NULL, payload JSONB)`);
        const tables = [
            { schema: scratch, name: 'trace', retention: { column: 'occurredAt', days: 365 }, nullableRefs: ['actorId'] },
            { schema: scratch, name: 'ledger', retention: null, nullableRefs: ['actorId'] },
            { schema: scratch, name: 'no_existe', retention: null, nullableRefs: [] }
        ];
        const first = await ensureAuditImmutability(pool, { tables, functionSchema: scratch });
        assert.deepEqual(first.protected, [`${scratch}.trace`, `${scratch}.ledger`]);
        assert.deepEqual(first.missing, [`${scratch}.no_existe`], 'una tabla que no existe no tumba el arranque');
        const second = await ensureAuditImmutability(pool, { tables, functionSchema: scratch });
        assert.deepEqual(second.changed, [], 'idempotente: la segunda vez no toca ningún trigger');

        await q(`INSERT INTO ${scratch}.users VALUES ('u1'), ('u2')`);
        await q(`INSERT INTO ${scratch}.trace VALUES ('old', now() - interval '400 days', 'u1', 'viejo'), ('new', now() - interval '10 days', 'u1', 'reciente')`);
        await q(`INSERT INTO ${scratch}.ledger VALUES ('l1', 'u1', '{"a":1}')`);

        await assert.rejects(q(`UPDATE ${scratch}.trace SET note = 'editado' WHERE id = 'new'`), rejected);
        await assert.rejects(q(`UPDATE ${scratch}.ledger SET "actorId" = 'u2'`), rejected, 'cambiar el autor no es poner NULL');
        await assert.rejects(q(`DELETE FROM ${scratch}.trace WHERE id = 'old'`), rejected, 'sin marca no se purga');
        await assert.rejects(q(`DELETE FROM ${scratch}.ledger`), rejected);
        await assert.rejects(q(`TRUNCATE ${scratch}.ledger`), rejected);
        const noop = await q(`UPDATE ${scratch}.trace SET note = note WHERE id = 'new'`);
        assert.equal(noop.rowCount, 1, 'una escritura que no cambia nada no altera la evidencia');

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(AUDIT_PURGE_SQL);
            await assert.rejects(client.query(`DELETE FROM ${scratch}.trace WHERE id = 'new'`), rejected, 'la marca no borra lo que no ha vencido');
            await client.query('ROLLBACK');
            await client.query('BEGIN');
            await client.query(AUDIT_PURGE_SQL);
            await assert.rejects(client.query(`DELETE FROM ${scratch}.ledger`), rejected, 'un registro sin retención no se purga nunca');
            await client.query('ROLLBACK');
            await client.query('BEGIN');
            await client.query(AUDIT_PURGE_SQL);
            await assert.rejects(client.query(`UPDATE ${scratch}.trace SET note = 'x' WHERE id = 'old'`), rejected, 'la marca solo permite borrar');
            await client.query('ROLLBACK');
            // SET LOCAL muere con la transacción: en la misma conexión, sin marca, vuelve a rechazar.
            await assert.rejects(client.query(`DELETE FROM ${scratch}.trace WHERE id = 'old'`), rejected);
        } finally {
            client.release();
        }

        const purged = await purgeAuditRows(pool, `DELETE FROM ${scratch}.trace WHERE "occurredAt" < $1`, [new Date(Date.now() - 365 * 24 * 3600 * 1000)]);
        assert.equal(purged.rowCount, 1, 'la purga automática borra lo vencido');
        assert.deepEqual((await q(`SELECT id FROM ${scratch}.trace`)).rows.map((row) => row.id), ['new']);

        // La traza operativa purga con Prisma: la marca tiene que viajar en la misma transacción interactiva.
        await q(`INSERT INTO ${scratch}.trace VALUES ('old2', now() - interval '500 days', 'u2', 'viejo')`);
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });
        try {
            await assert.rejects(prisma.$executeRawUnsafe(`DELETE FROM ${scratch}.trace WHERE id = 'old2'`), rejected);
            assert.equal(await purgeAuditRowsWithPrisma(prisma, (tx) => tx.$executeRawUnsafe(`DELETE FROM ${scratch}.trace WHERE id = 'old2'`)), 1);
        } finally {
            await prisma.$disconnect();
        }

        await q(`DELETE FROM ${scratch}.users WHERE id = 'u1'`);
        assert.equal((await q(`SELECT "actorId" FROM ${scratch}.trace`)).rows[0].actorId, null, 'borrar a la persona deja la fila sin autor');
        assert.equal((await q(`SELECT "actorId", payload FROM ${scratch}.ledger`)).rows[0].actorId, null);
        assert.deepEqual((await q(`SELECT payload FROM ${scratch}.ledger`)).rows[0].payload, { a: 1 }, 'el resto de la fila no cambia');

        // El catálogo real se instala sobre copias de las tablas que existan en esta base.
        const copies = [];
        for (const spec of AUDIT_TABLES) {
            const exists = (await q('SELECT to_regclass($1) AS oid', [`${spec.schema}."${spec.name}"`])).rows[0].oid;
            if (!exists) continue;
            await q(`CREATE TABLE ${scratch}."${spec.name}" (LIKE ${spec.schema}."${spec.name}" INCLUDING DEFAULTS)`);
            copies.push({ ...spec, schema: scratch });
        }
        const installed = await ensureAuditImmutability(pool, { tables: copies, functionSchema: scratch });
        assert.equal(installed.protected.length, copies.length);
        const usage = copies.find((spec) => spec.name === 'AiUsageEvent');
        if (usage) {
            await q(`INSERT INTO ${scratch}."AiUsageEvent" (id,"occurredAt",provider,model,endpoint,flow,outcome) VALUES ('a1', now() - interval '400 days','openai','m','/v1/responses','chat','ALLOWED')`);
            await assert.rejects(q(`UPDATE ${scratch}."AiUsageEvent" SET outcome = 'BLOCKED'`), rejected);
            assert.equal((await purgeAuditRows(pool, `DELETE FROM ${scratch}."AiUsageEvent" WHERE "occurredAt" < $1`, [new Date(Date.now() - 365 * 24 * 3600 * 1000)])).rowCount, 1);
        }
    } finally {
        await q(`DROP SCHEMA IF EXISTS ${scratch} CASCADE`).catch(() => {});
        await pool.end();
    }
});
