import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { ensureProjectOperation, listClientProjects, updateProjectOperation } from '../src/services/projectOperationsService.js';
import { refreshFormalization, setFormalizationRequirements } from '../src/services/projectFormalizationService.js';

// Explicit isolated localhost cluster only. No .env, no DATABASE_URL fallback, no production tables.
const testUrl = briaTestDatabaseUrl();
test('PostgreSQL: proyecto separado, preparación idempotente y revisiones concurrentes', { skip: !testUrl, timeout: 90000 }, async t => {
  const schema = `project_operations_${randomUUID().replaceAll('-', '')}`;
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

  // DDL real de las tablas de este recorrido. Las dos tablas de embeddings de la agencia usan pgvector;
  // no se sustituyen tipos ni se modifica el esquema del producto para esta prueba de proyectos.
  const ddl = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], {
    encoding: 'utf8', env: { ...process.env, DATABASE_URL: scopedUrl.href }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tables = new Set(['User', 'TeamMember', 'Client', 'ClientContract', 'Quotation', 'ProjectFormalization', 'ProjectFormalizationDocument', 'ProjectOperation', 'FinancialAuditEvent', 'AccountsReceivable', 'ReceivablePayment']);
  for (const [statement] of ddl.matchAll(/CREATE TYPE "[^"]+" AS ENUM \([\s\S]*?\);/g)) await connection.query(statement);
  // La tabla nueva la crea su script de arranque real, no el DDL de Prisma: así se comprueba también el despliegue.
  for (const [statement, name] of ddl.matchAll(/CREATE TABLE "([^"]+)" \([\s\S]*?\n\);/g)) if (tables.has(name) && name !== 'ProjectOperation') await connection.query(statement);
  for (const [statement, table] of ddl.matchAll(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([^"]+)"[^;]+;/g)) if (tables.has(table) && table !== 'ProjectOperation') await connection.query(statement);
  for (const [statement, table, target] of ddl.matchAll(/ALTER TABLE "([^"]+)" ADD CONSTRAINT [^;]+?REFERENCES "([^"]+)"[^;]+;/g)) {
    if (tables.has(table) && tables.has(target) && table !== 'ProjectOperation') await connection.query(statement);
  }

  const user = await db.user.create({ data: { id: randomUUID(), name: 'PM prueba', email: `${randomUUID()}@example.invalid`, password: 'only-local-fixture', role: 'PROJECT_MANAGER', isActive: true } });
  const member = await db.teamMember.create({ data: { name: 'PM prueba', role: 'Project Manager', userId: user.id } });
  const client = await db.client.create({ data: { name: 'Agencia de prueba', slug: randomUUID(), projectManagerId: member.id } });
  const contract = await db.clientContract.create({ data: { clientId: client.id, serviceType: 'PARRILLA', startDate: '2026-01-01', deliverables: [{ format: 'POST', quantity: 4 }] } });
  const quote = await db.quotation.create({ data: {
    uuid_slug: randomUUID(), emisor_type: 'BRAIN_STUDIO', status: 'APROBADA', client_name: 'Prueba', client_email: 'test@example.invalid',
    items: [{ name: 'Manual de identidad', quantity: 1, billingType: 'ONE_TIME', price: 500000 }],
    subtotal: 500000, tax_amount: 0, total_amount: 500000, terms_and_conditions: 'No exponer condiciones privadas', accepted_at: new Date(), expires_at: new Date('2198-01-01'),
  } });
  const form = await db.projectFormalization.create({ data: { quotationId: quote.id, clientId: client.id, requiresContract: false, requiresAdvance: false } });
  const actor = { userId: user.id, role: 'PROJECT_MANAGER' };
  const options = { notify: async () => ({ id: 'notification' }), log: () => {} };

  await t.test('el script aditivo puede repetirse y conserva fichas/contratos existentes', async () => {
    const url = new URL(testUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    for (let i = 0; i < 2; i++) execFileSync(process.execPath, ['scripts/ensure-project-operations-schema.js'], { env: { ...process.env, DATABASE_URL: url.href }, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal((await db.clientContract.findUnique({ where: { id: contract.id } })).serviceType, 'PARRILLA');
    const columns = await connection.query('SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2', [schema, 'ProjectOperation']);
    assert.equal(columns.rows.find(row => row.column_name === 'sourceSnapshot').data_type, 'jsonb');
  });

  await t.test('dos habilitaciones crean exactamente una ficha y una auditoría de creación', async () => {
    await Promise.all([refreshFormalization(db, form.id, options), refreshFormalization(db, form.id, options)]);
    assert.equal(await db.projectOperation.count({ where: { formalizationId: form.id } }), 1);
    const row = await db.projectOperation.findUnique({ where: { formalizationId: form.id } });
    assert.equal(await db.financialAuditEvent.count({ where: { entityType: 'ProjectOperation', entityId: row.id, action: 'CREATE' } }), 1);
    assert.equal((await db.projectFormalization.findUnique({ where: { id: form.id } })).status, 'HABILITADO');
    assert.equal((await db.clientContract.findUnique({ where: { id: contract.id } })).serviceType, 'PARRILLA');
  });

  const input = row => ({ expectedRevision: row.revision, title: 'Identidad de marca', modality: 'PUNTUAL', startDate: '2026-11-05', endDate: '2026-12-05', projectManagerId: member.id,
    deliverables: [{ id: 'manual', label: 'Manual aprobado', quantity: 1, unit: 'manual', description: '' }], notes: '', productionDays: 0, productionHours: null, reportRequired: false, review: true });

  await t.test('dos revisiones del mismo borrador no se pisan: una guarda y la otra recibe conflicto', async () => {
    const row = await db.projectOperation.findUnique({ where: { formalizationId: form.id } });
    const results = await Promise.allSettled([
      updateProjectOperation(db, client.id, row.id, input(row), actor),
      updateProjectOperation(db, client.id, row.id, { ...input(row), title: 'Cambio concurrente' }, actor),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'PROJECT_REVISION_CONFLICT');
    const stored = await db.projectOperation.findUnique({ where: { id: row.id } });
    assert.equal(stored.revision, 2);
    assert.deepEqual(stored.sourceSnapshot, row.sourceSnapshot);
    assert.equal(await db.financialAuditEvent.count({ where: { entityType: 'ProjectOperation', entityId: row.id, action: 'UPDATE' } }), 1);
  });

  await t.test('la revocación del rol en PostgreSQL impide editar con un actor antiguo', async () => {
    await db.user.update({ where: { id: user.id }, data: { role: 'EDITOR' } });
    const row = await db.projectOperation.findUnique({ where: { formalizationId: form.id } });
    await assert.rejects(updateProjectOperation(db, client.id, row.id, input(row), actor), { status: 403 });
    await db.user.update({ where: { id: user.id }, data: { role: 'PROJECT_MANAGER' } });
  });

  await t.test('un requisito confirmado concurrentemente se lee tras adquirir el bloqueo antes de habilitar', async () => {
    const nextQuote = await db.quotation.create({ data: { ...Object.fromEntries(Object.entries(quote).filter(([key]) => !['id', 'consecutive', 'created_at', 'updated_at'].includes(key))), uuid_slug: randomUUID() } });
    const pending = await db.projectFormalization.create({ data: { quotationId: nextQuote.id, clientId: client.id, requiresContract: false, requiresAdvance: false } });
    const holder = new pg.Client({ connectionString: testUrl });
    await holder.connect();
    await holder.query(`SET search_path TO "${schema}"`);
    await holder.query('BEGIN');
    await holder.query('UPDATE "ProjectFormalization" SET "requiresContract"=true WHERE id=$1', [pending.id]);
    let lockAttempted;
    const reachedLock = new Promise(resolve => { lockAttempted = resolve; });
    const proxied = {
      $transaction: callback => db.$transaction(tx => callback(new Proxy(tx, { get(target, key) {
        if (key === '$queryRaw') return (...args) => { lockAttempted(); return target.$queryRaw(...args); };
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      } }))),
    };
    const refresh = refreshFormalization(proxied, pending.id, options);
    await reachedLock;
    await holder.query('COMMIT');
    await holder.end();
    assert.equal((await refresh).status, 'PENDIENTE');
    assert.equal(await db.projectOperation.count({ where: { formalizationId: pending.id } }), 1);
    await setFormalizationRequirements(db, pending.id, { requiresContract: false, requiresAdvance: false }, actor, options);
    assert.equal((await db.projectFormalization.findUnique({ where: { id: pending.id } })).status, 'HABILITADO');
  });

  await t.test('la lista operativa no expone los documentos ni las condiciones financieras', async () => {
    const rows = await listClientProjects(db, client.id, actor);
    assert.equal(rows.length, 2);
    assert.doesNotMatch(JSON.stringify(rows), /500000|condiciones privadas|advanceReceivableId|requiresAdvance|terms_and_conditions/);
    const first = await db.projectOperation.findUnique({ where: { formalizationId: form.id } });
    await db.$transaction(tx => ensureProjectOperation(tx, form));
    assert.equal((await db.projectOperation.findUnique({ where: { id: first.id } })).title, first.title);
  });
});
