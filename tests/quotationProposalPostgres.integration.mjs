// Opt-in only; the target must be the dedicated local quotation test cluster.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { ensureQuotationProposalsSchema } from '../scripts/ensure-quotation-proposals-schema.js';
import { acceptQuotationBySlug } from '../src/services/quotationAcceptanceService.js';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('Explicit TEST_DATABASE_URL required; never use production .env.');
const target = new URL(testUrl);
if (target.hostname !== '127.0.0.1' || target.port !== '55447' || target.pathname !== '/quotation_proposal_test' || target.username !== 'quotation_test') {
  throw new Error('Refusing a database outside the dedicated local quotation test cluster.');
}
process.env.DATABASE_URL = testUrl;
const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
globalThis.prisma = db;
const { createQuotation, updateQuotation } = await import('../src/controllers/quotationController.js');
const sql = new pg.Client({ connectionString: testUrl });
await sql.connect();
// Real, current Prisma DDL, restricted to this module. The full agency schema
// also requires pgvector, which is unrelated to quotation persistence.
const ddl = await readFile(new URL('../output/quotation-test-schema.sql', import.meta.url), 'utf8');
for (const [statement, name] of ddl.matchAll(/CREATE TYPE "([^"]+)" AS ENUM \([\s\S]*?\);/g)) {
  if (!(await sql.query('SELECT 1 FROM pg_type WHERE typname = $1', [name])).rowCount) await sql.query(statement);
}
const tables = new Set(['Quotation', 'User', 'Notification', 'ServiceCatalog']);
for (const [statement, name] of ddl.matchAll(/CREATE TABLE "([^"]+)" \([\s\S]*?\n\);/g)) {
  if (tables.has(name) && !(await sql.query('SELECT to_regclass($1) AS relation', [`"${name}"`])).rows[0].relation) await sql.query(statement);
}
for (const [statement, name] of ddl.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)" ON "(?:Quotation|User|Notification|ServiceCatalog)"[^;]+;/g)) {
  if (!(await sql.query('SELECT to_regclass($1) AS relation', [`"${name}"`])).rows[0].relation) await sql.query(statement);
}
const ownedIds = [];
const details = { version: 1, title: 'Local integration', paymentTermsConfirmed: true, paymentPlans: [{ mode: 'PERCENTAGE', scenarioId: null, installments: [{ id: 'a', label: 'Anticipo', value: 100, dueType: 'MILESTONE', milestone: 'Inicio' }] }] };
const body = { emisor_type: 'BRAIN_STUDIO', client_name: 'Isolated test', client_email: 'test@example.invalid', client_phone: '123', client_type: 'EMPRESA', currency: 'COP', status: 'ACTIVA', items: [{ name: 'CRM', descriptionHtml: '<p><strong>Etapa</strong> a medida</p>', quantity: 1, price: 100, billingType: 'ONE_TIME' }], proposal_details: details };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } });
const create = async (overrides = {}) => {
  const res = response(); await createQuotation({ body: { ...body, ...overrides } }, res);
  assert.equal(res.code, 201, JSON.stringify(res.data));
  ownedIds.push(res.data.id); return res.data;
};
test.after(async () => {
  try { await db.quotation.deleteMany({ where: { id: { in: ownedIds } } }); }
  finally { await sql.end(); await db.$disconnect(); }
});

test('additive bootstrap preserves an old quotation, is repeatable, and stores real JSONB', async () => {
  const legacy = await create({ proposal_details: null });
  // Only this isolated DB: recreate the pre-release schema with a historical row.
  assert.equal(await db.quotation.count(), 1, 'Bootstrap simulation requires only its own historical fixture');
  await sql.query('ALTER TABLE "Quotation" DROP COLUMN "proposal_details"');
  await ensureQuotationProposalsSchema(sql);
  await ensureQuotationProposalsSchema(sql);
  const stored = await db.quotation.findUnique({ where: { id: legacy.id } });
  assert.equal(stored.client_name, legacy.client_name);
  assert.equal(stored.proposal_details, null);
  assert.equal(Number(stored.total_amount), Number(legacy.total_amount));
  const created = await create();
  const rows = await sql.query('SELECT jsonb_typeof("proposal_details") AS kind FROM "Quotation" WHERE id = $1', [created.id]);
  assert.equal(rows.rows[0].kind, 'object');
  assert.equal((await db.quotation.findUnique({ where: { id: created.id } })).proposal_details.title, details.title);
});

test('real edits preserve omitted details, clear explicit null, and reject invalid plans without writes', async () => {
  const created = await create();
  const input = { ...body, client_name: 'Changed' }; delete input.proposal_details;
  const res = response(); await updateQuotation({ params: { id: created.id }, body: input }, res);
  assert.equal(res.code, 200);
  const updated = await db.quotation.findUnique({ where: { id: created.id } });
  assert.equal(updated.proposal_details.title, details.title);
  assert.equal(updated.client_name, 'Changed');
  const bad = response();
  await updateQuotation({ params: { id: created.id }, body: { ...body, proposal_details: { ...details, paymentTermsConfirmed: false } } }, bad);
  assert.equal(bad.code, 400);
  assert.equal((await db.quotation.findUnique({ where: { id: created.id } })).updated_at.getTime(), updated.updated_at.getTime());
  const cleared = response();
  await updateQuotation({ params: { id: created.id }, body: { ...body, proposal_details: null } }, cleared);
  assert.equal(cleared.code, 200);
  const result = await sql.query('SELECT "proposal_details" IS NULL AS cleared FROM "Quotation" WHERE id = $1', [created.id]);
  assert.equal(result.rows[0].cleared, true);
});

test('acceptance checks the stored version and approved proposals reject editing', async () => {
  const created = await create();
  await assert.rejects(acceptQuotationBySlug({ db, slug: created.uuid_slug, expectedUpdatedAt: '2000-01-01T00:00:00Z' }), error => error.statusCode === 409);
  await acceptQuotationBySlug({ db, slug: created.uuid_slug, expectedUpdatedAt: created.updated_at.toISOString() });
  const persisted = await db.quotation.findUnique({ where: { id: created.id } });
  assert.equal(persisted.status, 'APROBADA');
  assert.deepEqual(persisted.proposal_details, created.proposal_details);
  const res = response(); await updateQuotation({ params: { id: created.id }, body }, res);
  assert.equal(res.code, 409);
});

test('an edit committed after acceptance reads invalidates acceptance on a separate SQL connection', async () => {
  const created = await create();
  const racingDb = { $transaction: callback => db.$transaction(tx => callback({
    ...tx,
    quotation: { ...tx.quotation, findUnique: async args => {
      const result = await tx.quotation.findUnique(args);
      if (result.status === 'ACTIVA') await sql.query('UPDATE "Quotation" SET client_name = $1, updated_at = updated_at + interval \'1 second\' WHERE id = $2', ['Concurrent edit', created.id]);
      return result;
    } }
  })) };
  await assert.rejects(acceptQuotationBySlug({ db: racingDb, slug: created.uuid_slug, expectedUpdatedAt: created.updated_at.toISOString() }), error => error.statusCode === 409);
  assert.equal((await db.quotation.findUnique({ where: { id: created.id } })).status, 'ACTIVA');
});

test('two simultaneous acceptances produce one transition', async () => {
  const created = await create({ client_name: randomUUID() });
  const results = await Promise.all([1, 2].map(() => acceptQuotationBySlug({ db, slug: created.uuid_slug, expectedUpdatedAt: created.updated_at.toISOString() })));
  assert.equal(results.filter(result => !result.alreadyAccepted).length, 1);
  assert.equal((await db.quotation.findUnique({ where: { id: created.id } })).status, 'APROBADA');
});
