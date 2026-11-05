import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { createClientOperationsService } from '../src/services/clientOperationsService.js';

const testUrl = briaTestDatabaseUrl();
test('PostgreSQL: alcance JSON opcional, despliegue repetible y renovación sin herencia implícita', { skip: !testUrl, timeout: 90000 }, async t => {
  const schema = `contract_scope_${randomUUID().replaceAll('-', '')}`;
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
  const ddl = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], {
    encoding: 'utf8', env: { ...process.env, DATABASE_URL: scopedUrl.href }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tables = new Set(['Client', 'TeamMember', 'ClientContract', 'ContentItem']);
  for (const [statement] of ddl.matchAll(/CREATE TYPE "[^"]+" AS ENUM \([\s\S]*?\);/g)) await connection.query(statement);
  for (const [statement, name] of ddl.matchAll(/CREATE TABLE "([^"]+)" \([\s\S]*?\n\);/g)) {
    if (tables.has(name)) await connection.query(statement.replace(/^\s*"scopeDetails" JSONB,\r?\n/m, ''));
  }
  const pm = await db.teamMember.create({ data: { name: 'PM ficticio', role: 'Project manager' } });
  const cm = await db.teamMember.create({ data: { name: 'CM ficticio', role: 'Community manager' } });
  const client = await db.client.create({ data: { name: 'Cliente ficticio', slug: randomUUID(), projectManagerId: pm.id, responsibleId: cm.id } });
  const contractId = randomUUID();
  await connection.query('INSERT INTO "ClientContract" (id,"clientId","startDate",deliverables,notes,"updatedAt") VALUES ($1,$2,$3,$4::jsonb,$5,NOW())', [contractId, client.id, '2026-11-01', JSON.stringify([{ format: 'Post', quantity: 4 }]), 'Nota previa.']);
  const original = (await connection.query('SELECT * FROM "ClientContract" WHERE id=$1', [contractId])).rows[0];
  const ensure = () => {
    const url = new URL(testUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    execFileSync(process.execPath, ['scripts/ensure-client-operations-schema.js'], { env: { ...process.env, DATABASE_URL: url.href }, stdio: ['ignore', 'pipe', 'pipe'] });
  };
  ensure(); ensure();
  const column = (await connection.query('SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3', [schema, 'ClientContract', 'scopeDetails'])).rows[0];
  assert.deepEqual(column, { data_type: 'jsonb', is_nullable: 'YES', column_default: null });
  assert.deepEqual((await connection.query('SELECT * FROM "ClientContract" WHERE id=$1', [contractId])).rows[0], { ...original, scopeDetails: null }, 'el despliegue no rellena ni cambia contratos existentes');

  // Solo los datos de ejecución ajenos al contrato se omiten de esta prueba; todas las escrituras
  // de saveProfile y las lecturas de Client/ClientContract atraviesan Prisma y PostgreSQL reales.
  const adapter = tx => ({
    client: {
      findFirst: async ({ where }) => {
        const row = await tx.client.findFirst({ where, include: { contracts: { orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }], take: 1 }, responsible: true, projectManager: true } });
        return row && { ...row, contentPlans: [], nativeTasks: [], monthlyReports: [], observations: [] };
      },
      update: args => tx.client.update(args),
    },
    clientContract: tx.clientContract,
    teamMember: tx.teamMember,
    $transaction: fn => db.$transaction(inner => fn(adapter(inner))),
  });
  const service = createClientOperationsService({ db: adapter(db), now: () => new Date('2026-11-05T15:00:00Z') });
  const form = { projectManagerId: pm.id, communityManagerId: cm.id, contract: {
    serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-11-01', deliverables: [{ format: 'Post', quantity: 4 }], notes: 'Nota previa.',
  } };
  const scope = { version: 1, contentLimits: [{ format: 'Video', quantity: 12, rule: 'MAXIMO' }], stories: { quantity: 3, period: 'DIAS_SEMANA', perOccasion: null },
    production: { included: true, quantity: 2, period: 'MES', hours: 3, rule: 'EXACTA', hoursRule: 'MAXIMO' }, additionalServices: [], reviewPending: null };
  const before = await service.getOperation(client.slug);
  await service.saveProfile({ clientId: client.id, input: { ...form, contract: { ...form.contract, scopeDetails: scope } } });
  const stored = await db.clientContract.findUnique({ where: { id: contractId } });
  assert.deepEqual(stored.scopeDetails, scope);
  ensure();
  assert.deepEqual((await db.clientContract.findUnique({ where: { id: contractId } })).scopeDetails, scope, 'repetir ensure preserva el JSON');
  await service.saveProfile({ clientId: client.id, input: form });
  const omitted = await db.clientContract.findUnique({ where: { id: contractId } });
  assert.deepEqual(omitted.scopeDetails, scope, 'el formulario anterior omite y conserva');
  assert.deepEqual(omitted.deliverables, before.contract.deliverables);
  const after = await service.getOperation(client.slug);
  assert.deepEqual(after.cycles, before.cycles);
  assert.deepEqual(after.evaluation, before.evaluation);
  assert.deepEqual(after.projectManager, before.projectManager);
  assert.deepEqual(after.communityManager, before.communityManager);
  await service.saveProfile({ clientId: client.id, input: { ...form, contract: { ...form.contract, scopeDetails: null } } });
  assert.equal((await connection.query('SELECT "scopeDetails" IS NULL AS cleared FROM "ClientContract" WHERE id=$1', [contractId])).rows[0].cleared, true, 'borrar usa SQL NULL, no el literal JSON null');
  await service.saveProfile({ clientId: client.id, input: { ...form, contract: { ...form.contract, scopeDetails: scope } } });
  await service.saveProfile({ clientId: client.id, input: { ...form, renew: true, contract: { ...form.contract, startDate: '2027-01-01' } } });
  const renewals = await db.clientContract.findMany({ where: { clientId: client.id }, orderBy: { startDate: 'desc' } });
  assert.equal(renewals.length, 2);
  assert.equal(renewals[0].scopeDetails, null);
  assert.deepEqual(renewals[1].scopeDetails, scope);
});
