// Carga la base de conocimiento de la agencia (hechos.jsonl y dudas.jsonl de la lectura del negocio) en la
// memoria de Bria. Por defecto SIMULA: dice qué crearía, qué actualizaría y qué cuentas no logra ligar a una
// ficha, sin escribir nada. Escribe solo con `--confirmar IMPORTAR`.
//
//   node scripts/import-bria-agency-facts.js --base=<carpeta> [--vinculos=<json>] [--corte=2026-10-07] [--confirmar IMPORTAR]
//
// Es idempotente: lo igual no cambia, y lo que el equipo ya confirmó, corrigió o retiró nunca se pisa.
// `--vinculos` es un JSON { "entidad": "slug-o-id" } para decidir a mano las cuentas ambiguas.
import 'dotenv/config';
import pg from 'pg';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { resolveClientLinks, validateFact } from '../src/lib/briaAgencyFacts.js';
import { createBriaAgencyFactRepository } from '../src/services/briaAgencyFactRepository.js';

const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const confirmIndex = process.argv.indexOf('--confirmar');
const confirmed = confirmIndex > 0 && process.argv[confirmIndex + 1] === 'IMPORTAR';
const base = arg('base');
const asOf = arg('corte') || '2026-10-07';
if (!base) throw new Error('Indica la carpeta de la base con --base=<carpeta>.');
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL.');

const readJsonl = async (file) => (await readFile(path.join(base, file), 'utf8')).split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
  try { return JSON.parse(line); } catch { throw new Error(`${file}, línea ${index + 1}: no es JSON válido.`); }
});

const facts = await readJsonl('hechos.jsonl');
const questions = await readJsonl('dudas.jsonl');
for (const fact of facts) validateFact(fact); // Falla antes de tocar la base si algo no cumple.
const overrides = arg('vinculos') ? JSON.parse(await readFile(arg('vinculos'), 'utf8')) : {};

const target = new URL(process.env.DATABASE_URL);
console.log(`[Memoria de la agencia] Base: ${target.hostname}:${target.port}${target.pathname} · ${confirmed ? 'ESCRIBE' : 'simulación'} · ${facts.length} hechos, ${questions.length} dudas`);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10000 });
try {
  const clients = (await pool.query('SELECT id, name, slug, "isArchived" FROM "Client"')).rows;
  const entities = [...facts, ...questions.map((q) => ({ entidad: q.entidad, fichaNativa: null }))];
  const links = resolveClientLinks(facts.map((f) => ({ entidad: f.entidad, fichaNativa: f.fichaNativa })), clients.map((c) => ({ ...c, isArchived: c.isArchived })), overrides);
  for (const { entidad } of entities) if (!links.has(entidad)) links.set(entidad, { clientId: null, reason: 'Sin ficha en la plataforma' });

  const unlinked = [...links].filter(([, link]) => !link.clientId).sort(([a], [b]) => a.localeCompare(b, 'es'));
  const report = path.join(base, `vinculos-${new Date().toISOString().slice(0, 10)}.md`);
  await writeFile(report, `# Cuentas sin ficha ligada (${unlinked.length} de ${links.size})\n\nUna entidad sin ficha se puede consultar por su nombre; para ligarla, añádela a un JSON { "entidad": "slug" } y pásalo con --vinculos.\n\n| Entidad | Motivo |\n|---|---|\n${unlinked.map(([name, link]) => `| ${name} | ${link.reason} |`).join('\n')}\n`, 'utf8');

  const ready = (await pool.query("SELECT to_regclass('bria_memory.agency_facts') IS NOT NULL AS ready")).rows[0].ready;
  if (!ready) {
    if (!confirmed) {
      console.log(JSON.stringify({ dryRun: true, tablas: 'todavía no existen; se crean al confirmar', create: facts.length, questions: questions.length, cuentasSinFicha: unlinked.length, reporte: report }));
      process.exit(0);
    }
    await pool.query(await readFile(new URL('./sql/bria-agency-facts.sql', import.meta.url), 'utf8'));
  }
  const repository = createBriaAgencyFactRepository({ pool, workspace: 'application' });
  const summary = await repository.importReading({
    facts, questions, links, asOf, dryRun: !confirmed,
    actor: { ref: 'lectura-del-negocio', name: 'Lectura del negocio' }
  });
  console.log(JSON.stringify({ ...summary, cuentasSinFicha: unlinked.length, reporte: report }));
} finally {
  await pool.end();
}
