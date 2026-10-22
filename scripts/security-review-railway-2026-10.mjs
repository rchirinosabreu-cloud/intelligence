// Revisión de solo lectura tras el aviso de seguridad de Railway (21 de octubre de 2026: un tercero pudo leer
// variables de entorno de clientes, algunas descifradas). Busca señales de que alguien usó lo que se llevó contra
// esta base o esta plataforma. No corrige nada: abre UNA transacción `READ ONLY`, lee y la descarta.
//
//   node scripts/security-review-railway-2026-10.mjs                 # resumen legible
//   node scripts/security-review-railway-2026-10.mjs --json          # todo en JSON
//   node scripts/security-review-railway-2026-10.mjs --desde 2026-10-19
//
// Usa DATABASE_URL del entorno (.env) y dice primero qué base respondió. Lo corre una persona, nunca la plataforma.
// Nunca lee un valor de la bóveda ni un secreto: solo quién, cuándo y cuántos.
import 'dotenv/config';
import pg from 'pg';
import { pathToFileURL } from 'node:url';

export const DEFAULT_SINCE = '2026-10-20';
/** Lo que dura una sesión (AUTH_TOKEN_EXPIRES_IN, 12 h). Una acción sin ingreso en ese plazo no tiene sesión válida. */
export const SESSION_HOURS = 12;

// $1 es el corte en UTC. Las columnas de Prisma son `timestamp` sin zona guardadas en UTC; las de la base lateral son
// `timestamptz`. La transacción fija la zona en UTC para que las dos lean igual.
export const REVIEW_QUERIES = {
  roles_de_la_base: {
    que: 'Usuarios de PostgreSQL que no son del sistema. Uno que no reconozcas es la señal más grave.',
    sql: `SELECT rolname, rolsuper, rolcanlogin, rolcreaterole, rolvaliduntil FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname`
  },
  extensiones: {
    que: 'Extensiones instaladas. Una nueva que no instalamos es sospechosa.',
    sql: `SELECT extname, extversion FROM pg_extension ORDER BY extname`
  },
  conexiones_abiertas: {
    que: 'Quién está conectado ahora, desde dónde y con qué programa (sin esta revisión).',
    sql: `SELECT usename, COALESCE(client_addr::text, 'interna') AS desde, application_name AS programa, backend_start AS conectado_desde, state AS estado FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() ORDER BY backend_start`
  },
  boveda_lecturas_por_dia: {
    que: 'Lecturas de contraseñas de la bóveda por día en las dos semanas anteriores, para comparar.',
    sql: `SELECT (recorded_at AT TIME ZONE 'America/Bogota')::date::text AS dia, COUNT(*)::int AS lecturas, COUNT(DISTINCT actor_ref)::int AS personas FROM vault.reveal_events WHERE recorded_at >= $1::timestamptz - interval '14 days' GROUP BY 1 ORDER BY 1`
  },
  boveda_lecturas_desde_el_corte: {
    que: 'Quién leyó contraseñas desde el corte, cuántas y por dónde.',
    sql: `SELECT actor_name AS persona, via, COUNT(*)::int AS lecturas, COUNT(DISTINCT credential_id)::int AS accesos_distintos, MIN(recorded_at) AS primera, MAX(recorded_at) AS ultima FROM vault.reveal_events WHERE recorded_at >= $1::timestamptz GROUP BY 1, 2 ORDER BY 3 DESC`
  },
  boveda_cambios_desde_el_corte: {
    que: 'Accesos de la bóveda creados, cambiados o retirados desde el corte.',
    sql: `SELECT actor_name AS persona, action AS accion, COUNT(*)::int AS cambios, MAX(recorded_at) AS ultimo FROM vault.credential_events WHERE recorded_at >= $1::timestamptz GROUP BY 1, 2 ORDER BY 3 DESC`
  },
  ingresos_desde_el_corte: {
    que: 'Ingresos a la plataforma por persona y forma de entrar.',
    sql: `SELECT u.name AS persona, t.metadata->>'method' AS forma, COUNT(*)::int AS ingresos, MIN(t."occurredAt") AS primero, MAX(t."occurredAt") AS ultimo FROM "OperationalTraceEvent" t LEFT JOIN "User" u ON u.id = t."actorId" WHERE t."eventType" = 'SESSION_STARTED' AND t."occurredAt" >= $1::timestamp GROUP BY 1, 2 ORDER BY 1, 2`
  },
  acciones_sin_ingreso_previo: {
    que: `Acciones hechas con sesión sin ningún ingreso de esa persona en las ${SESSION_HOURS} h anteriores. Una sesión falsificada con la firma robada deja justo esta huella. Puede haber falsos positivos si el corte cae en medio de una sesión.`,
    sql: `SELECT u.name AS persona, a.metadata->>'module' AS modulo, a.metadata->>'method' AS metodo, a.metadata->>'path' AS ruta, a."occurredAt" AS cuando FROM "OperationalTraceEvent" a LEFT JOIN "User" u ON u.id = a."actorId" WHERE a."eventType" = 'PLATFORM_MUTATION' AND a."actorId" IS NOT NULL AND a."occurredAt" >= $1::timestamp + interval '${SESSION_HOURS} hours' AND NOT EXISTS (SELECT 1 FROM "OperationalTraceEvent" s WHERE s."eventType" = 'SESSION_STARTED' AND s."actorId" = a."actorId" AND s."occurredAt" <= a."occurredAt" AND s."occurredAt" > a."occurredAt" - interval '${SESSION_HOURS} hours') ORDER BY a."occurredAt" DESC LIMIT 50`
  },
  acciones_por_hora_desde_el_corte: {
    que: 'Volumen de acciones por hora (Bogotá). Un pico de madrugada o de alguien que no trabajaba es para mirar.',
    sql: `SELECT to_char(((t."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota'), 'YYYY-MM-DD HH24":00"') AS hora_bogota, COUNT(*)::int AS acciones, COUNT(DISTINCT t."actorId")::int AS personas FROM "OperationalTraceEvent" t WHERE t."eventType" = 'PLATFORM_MUTATION' AND t."occurredAt" >= $1::timestamp GROUP BY 1 ORDER BY 1`
  },
  cuentas_cambiadas_desde_el_corte: {
    que: 'Cuentas del equipo creadas, con contraseña cambiada, con verificación en dos pasos activada o bloqueada desde el corte.',
    sql: `SELECT name AS persona, role AS rol, "isActive" AS activa, ("createdAt" >= $1::timestamp) AS creada_despues, ("passwordChangedAt" >= $1::timestamp) AS clave_cambiada, ("mfaEnabledAt" >= $1::timestamp) AS mfa_activada_despues, "mfaFailedAttempts" AS fallos_mfa, "mfaLockedUntil" AS mfa_bloqueada_hasta, "updatedAt" AS actualizada FROM "User" WHERE "createdAt" >= $1::timestamp OR "passwordChangedAt" >= $1::timestamp OR "mfaEnabledAt" >= $1::timestamp OR "mfaFailedAttempts" > 0 OR "mfaLockedUntil" >= $1::timestamp ORDER BY "updatedAt" DESC`
  },
  administradores: {
    que: 'Quién tiene rol de administrador hoy. Uno que no debería estar ahí es señal grave.',
    sql: `SELECT name AS persona, email, "isActive" AS activa, "createdAt" AS creada, "mfaEnabledAt" IS NOT NULL AS con_mfa FROM "User" WHERE role = 'ADMIN' ORDER BY name`
  },
  uso_de_ia_por_dia: {
    que: 'Llamadas a OpenAI que hizo la plataforma por día. Si la clave se usó desde fuera, eso NO aparece aquí: hay que mirarlo en el panel de OpenAI.',
    sql: `SELECT ((("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota'))::date::text AS dia, provider AS proveedor, COUNT(*)::int AS llamadas, COUNT(*) FILTER (WHERE outcome = 'ERROR')::int AS con_error FROM "AiUsageEvent" WHERE "occurredAt" >= $1::timestamp - interval '7 days' GROUP BY 1, 2 ORDER BY 1, 2`
  }
};

const READ_ONLY = /^\s*(SELECT|WITH)\b/i;
const WRITES = /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|COPY|CALL|DO|VACUUM|REINDEX|CLUSTER|LOCK|SET\s+ROLE)\b/i;
/** Cada consulta es un SELECT y no escribe: la prueba lo vigila y la ejecución lo vuelve a comprobar. */
export const isReadOnlyQuery = (sql) => READ_ONLY.test(sql) && !WRITES.test(sql.replace(/'[^']*'/g, "''"));

export const parseSince = (value) => {
  const text = String(value || DEFAULT_SINCE).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) throw new Error(`Fecha de corte no válida: ${text}. Usa AAAA-MM-DD.`);
  return `${text} 00:00:00`;
};

export async function runSecurityReview({ connectionString, since = parseSince(), queries = REVIEW_QUERIES, statementTimeoutMs = 20000, Client = pg.Client } = {}) {
  if (!connectionString) throw new Error('Falta DATABASE_URL.');
  for (const [name, { sql }] of Object.entries(queries)) if (!isReadOnlyQuery(sql)) throw new Error(`La consulta ${name} no es de solo lectura.`);
  const client = new Client({ connectionString, statement_timeout: statementTimeoutMs, application_name: 'revision-seguridad-railway' });
  const out = { base: new URL(connectionString).host, corte: `${since} UTC`, ejecutada: new Date().toISOString(), resultados: {}, errores: {} };
  await client.connect();
  const begin = async () => { await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await client.query("SET LOCAL TIME ZONE 'UTC'"); };
  try {
    await begin();
    for (const [name, { sql }] of Object.entries(queries)) {
      try { out.resultados[name] = (await client.query(sql, sql.includes('$1') ? [since] : [])).rows; }
      catch (error) { out.errores[name] = error.message; await client.query('ROLLBACK'); await begin(); }
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
  return out;
}

const cell = (value) => (value instanceof Date ? value.toISOString().replace('.000Z', 'Z') : value === null || value === undefined ? '—' : String(value));
export const formatReview = (out, queries = REVIEW_QUERIES) => {
  const lines = [`Base: ${out.base} · corte: ${out.corte} · ${out.ejecutada}`, 'Solo lectura: nada se cambió.', ''];
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
  const sinceIndex = args.indexOf('--desde');
  try {
    const out = await runSecurityReview({ connectionString: process.env.DATABASE_URL, since: parseSince(sinceIndex >= 0 ? args[sinceIndex + 1] : undefined) });
    console.log(args.includes('--json') ? JSON.stringify(out, null, 2) : formatReview(out));
  } catch (error) {
    console.error(`No se pudo hacer la revisión: ${error.message}`);
    process.exitCode = 1;
  }
}
