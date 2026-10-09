import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Orden de la base lateral (9 de octubre de 2026). Las tablas que no administra Prisma tienen que estar
// documentadas en un solo sitio y anunciadas en schema.prisma; nadie debe activar el modo de varios esquemas
// (haría que `db push` quisiera borrarlas); y Bria y la bóveda comparten una sola reserva de conexiones.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sqlTables = readdirSync(new URL('../scripts/sql/', import.meta.url)).filter((name) => name.endsWith('.sql'))
  .flatMap((name) => [...read(`scripts/sql/${name}`).matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\.(\w+)/g)].map((m) => ({ schema: m[1], table: m[2], file: name })));

test('every side table is documented and announced in schema.prisma', () => {
  assert.ok(sqlTables.length >= 17);
  const doc = read('docs/BASE_DE_DATOS_LATERAL.md');
  const prisma = read('prisma/schema.prisma');
  for (const { schema, table, file } of sqlTables) {
    assert.match(doc, new RegExp(`\`${table}\``), `${schema}.${table} (${file}) falta en docs/BASE_DE_DATOS_LATERAL.md`);
    assert.match(prisma, new RegExp(`${schema}:[\\s\\S]*\\b${table}\\b`), `${schema}.${table} falta en el encabezado de schema.prisma`);
  }
});

test('Prisma keeps managing only the public schema', () => {
  const prisma = read('prisma/schema.prisma');
  assert.doesNotMatch(prisma, /multiSchema/);
  assert.doesNotMatch(prisma, /^\s*schemas\s*=/m);
  assert.doesNotMatch(prisma, /@@schema\(/);
  assert.match(prisma, /provider = "postgresql"/);
});

test('Bria and the vault share one connection pool', () => {
  for (const path of ['src/services/briaAgencyFactService.js', 'src/services/briaConversationApplication.js', 'src/services/briaKnowledgeApplication.js', 'src/services/vaultService.js']) {
    const source = read(path);
    assert.match(source, /getSidecarPool\(\)/, `${path} usa la reserva compartida`);
    assert.doesNotMatch(source, /new pg\.Pool/, `${path} no abre su propia reserva`);
  }
  assert.match(read('src/lib/sidecarPool.js'), /on\('error'/, 'the shared pool handles idle connection errors');
});

test('client links: facts, questions and accesses point to Client with ON DELETE SET NULL, cleaning old orphans first', () => {
  const facts = read('scripts/sql/bria-agency-facts.sql'), vault = read('scripts/sql/vault.sql');
  for (const [source, name] of [[facts, 'agency_facts_client_fk'], [facts, 'agency_questions_client_fk'], [vault, 'vault_credentials_client_fk']]) {
    const block = source.slice(source.indexOf(`conname = '${name}'`));
    assert.match(block, /SET client_id = NULL WHERE client_id IS NOT NULL AND NOT EXISTS/);
    assert.match(block, /REFERENCES public\."Client"\(id\) ON DELETE SET NULL/);
  }
});
