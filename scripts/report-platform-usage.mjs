// Qué hace de verdad el equipo en la plataforma (Rodny, 22 de octubre de 2026: «qué necesitamos para que todo lo que
// hace la plataforma lo pueda hacer una persona desde el chat de Bria y desde WhatsApp?»). Cuenta los cambios que
// hacen las personas, por operación, y dice si el mapa de Bria la conoce y si describe sus campos: así el mapa exacto
// empieza por lo que más se usa. Solo lectura: abre UNA transacción `READ ONLY`, cuenta y la descarta.
//
//   node scripts/report-platform-usage.mjs               # últimos 60 días, legible
//   node scripts/report-platform-usage.mjs --dias 90
//   node scripts/report-platform-usage.mjs --json
//
// Usa DATABASE_URL del entorno y dice primero qué base respondió. Lo corre una persona, nunca la plataforma. Nunca
// lee contenido: solo qué operación, cuántas veces y cuántas personas.
import 'dotenv/config';
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { isReadOnlyQuery } from './security-review-railway-2026-10.mjs';
import { matchOperation } from '../src/lib/platformCatalog.js';

export const DEFAULT_DAYS = 60;

// $1 son los días hacia atrás. `occurredAt` es `timestamp` sin zona guardado en UTC: la transacción fija UTC.
export const USAGE_QUERIES = {
  operaciones: {
    que: 'Cambios hechos por personas, por operación: cuántas veces, cuántas personas y la última vez.',
    sql: `SELECT t.metadata->>'method' AS metodo, t.metadata->>'path' AS ruta, t.metadata->>'module' AS modulo, COUNT(*)::int AS veces, COUNT(DISTINCT t."actorId")::int AS personas, MAX(t."occurredAt") AS ultima, COUNT(*) FILTER (WHERE t.metadata->>'via' = 'whatsapp')::int AS por_whatsapp FROM "OperationalTraceEvent" t WHERE t."eventType" = 'PLATFORM_MUTATION' AND t."actorId" IS NOT NULL AND t."occurredAt" >= now() - make_interval(days => $1::int) GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 200`
  },
  tareas: {
    que: 'Lo de Gestión, que tiene su propio registro: crear, mover y cerrar tareas.',
    sql: `SELECT t."eventType" AS evento, COUNT(*)::int AS veces, COUNT(DISTINCT t."actorId")::int AS personas FROM "OperationalTraceEvent" t WHERE t."eventType" LIKE 'TASK%' AND t."actorId" IS NOT NULL AND t."occurredAt" >= now() - make_interval(days => $1::int) GROUP BY 1 ORDER BY 2 DESC`
  },
  uso_de_bria: {
    que: 'Llamadas de IA por flujo (incluye Bria en la plataforma y por WhatsApp), para ver cuánto se usa el chat.',
    sql: `SELECT flow AS flujo, COUNT(*)::int AS llamadas, COUNT(DISTINCT "actorId")::int AS personas FROM "AiUsageEvent" WHERE "occurredAt" >= now() - make_interval(days => $1::int) GROUP BY 1 ORDER BY 2 DESC LIMIT 40`
  }
};

export const parseDays = (value) => {
  const days = value === undefined ? DEFAULT_DAYS : Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error(`Días no válidos: ${value}. Usa un número de 1 a 365.`);
  return days;
};

/** Si el mapa de Bria conoce la operación y si dice qué campos lleva. */
export const mapCoverage = ({ metodo, ruta }) => {
  const path = String(ruta || '').replace(/^\/api(?=\/)/, '');
  const operation = matchOperation(metodo, path);
  if (!operation) return { enElMapa: false, conCampos: false, operacion: null };
  const needsBody = ['POST', 'PUT', 'PATCH'].includes(String(metodo).toUpperCase());
  return { enElMapa: true, conCampos: !needsBody || Boolean(operation.campos), operacion: operation.key };
};

export async function runUsageReport({ connectionString, days = DEFAULT_DAYS, queries = USAGE_QUERIES, statementTimeoutMs = 30000, Client = pg.Client } = {}) {
  if (!connectionString) throw new Error('Falta DATABASE_URL.');
  for (const [name, { sql }] of Object.entries(queries)) if (!isReadOnlyQuery(sql)) throw new Error(`La consulta ${name} no es de solo lectura.`);
  const client = new Client({ connectionString, statement_timeout: statementTimeoutMs, application_name: 'reporte-uso-plataforma' });
  const out = { base: new URL(connectionString).host, dias: days, ejecutado: new Date().toISOString(), resultados: {}, errores: {} };
  await client.connect();
  const begin = async () => { await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await client.query("SET LOCAL TIME ZONE 'UTC'"); };
  try {
    await begin();
    for (const [name, { sql }] of Object.entries(queries)) {
      try { out.resultados[name] = (await client.query(sql, [days])).rows; }
      catch (error) { out.errores[name] = error.message; await client.query('ROLLBACK'); await begin(); }
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
  if (out.resultados.operaciones) out.resultados.operaciones = out.resultados.operaciones.map((row) => ({ ...row, ...mapCoverage(row) }));
  return out;
}

const cell = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value === null || value === undefined ? '—' : typeof value === 'boolean' ? (value ? 'sí' : 'no') : String(value));
export const formatUsage = (out, queries = USAGE_QUERIES) => {
  const lines = [`Base: ${out.base} · últimos ${out.dias} días · ${out.ejecutado}`, 'Solo lectura: nada se cambió.', ''];
  for (const [name, { que }] of Object.entries(queries)) {
    lines.push(`## ${name}`, que);
    if (out.errores[name]) { lines.push(`  No se pudo leer: ${out.errores[name]}`, ''); continue; }
    const rows = out.resultados[name] || [];
    if (!rows.length) { lines.push('  (nada)', ''); continue; }
    for (const row of rows) lines.push(`  - ${Object.entries(row).map(([key, value]) => `${key}: ${cell(value)}`).join(' · ')}`);
    lines.push('');
  }
  return lines.join('\n');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const daysIndex = args.indexOf('--dias');
  try {
    const out = await runUsageReport({ connectionString: process.env.DATABASE_URL, days: parseDays(daysIndex >= 0 ? args[daysIndex + 1] : undefined) });
    console.log(args.includes('--json') ? JSON.stringify(out, null, 2) : formatUsage(out));
  } catch (error) {
    console.error(`No se pudo hacer el reporte: ${error.message}`);
    process.exitCode = 1;
  }
}
