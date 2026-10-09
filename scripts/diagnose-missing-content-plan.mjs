// ¿Dónde está la parrilla que no aparece? (Rodny, 9 de octubre de 2026: la de Mima's Kitchen).
//
// SOLO LEE. Abre una transacción `REPEATABLE READ READ ONLY` con tiempo límite, hace las consultas
// y hace ROLLBACK. No escribe ni corrige nada: dice qué pasó y quién lo hizo, y la decisión es tuya.
//
//   node scripts/diagnose-missing-content-plan.mjs "mima"
//   node scripts/diagnose-missing-content-plan.mjs "mima" --brief
//
// El texto que se le pasa se busca en el nombre y en el slug del cliente, sin distinguir mayúsculas
// ni acentos. Usa DATABASE_URL del entorno (.env) e imprime el host primero, para que quien lo lea
// sepa qué base contestó.
import 'dotenv/config';
import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Prisma guarda DateTime como `timestamp(3)` sin zona (UTC). Para leer una columna naive en hora de
// Bogotá hay que declararla UTC primero; un `AT TIME ZONE 'America/Bogota'` a secas la corre al revés.
const BOGOTA = (column) => `((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota')`;

export const buildQueries = (needle) => ({
  // 1. ¿Existe la ficha del cliente, y hay más de una? Dos fichas del mismo cliente son la causa
  //    más común de «desapareció»: la parrilla cuelga de la otra.
  clientes: `
    SELECT id, name, slug, "isArchived", ${BOGOTA('"createdAt"')}::text AS creada
    FROM "Client"
    WHERE unaccent(lower(name)) LIKE unaccent(lower('%${needle}%'))
       OR unaccent(lower(slug)) LIKE unaccent(lower('%${needle}%'))
    ORDER BY "createdAt"`,

  // 2. Todas sus parrillas, borradas o no. `deleteContentPlan` es un borrado **suave**: si alguien
  //    la eliminó, la fila sigue ahí con `deletedAt` y se puede recuperar.
  parrillas: `
    SELECT p.id, c.name AS cliente, p.year, p.month, p.status,
           ${BOGOTA('p."createdAt"')}::text AS creada,
           ${BOGOTA('p."updatedAt"')}::text AS tocada,
           ${BOGOTA('p."deletedAt"')}::text AS borrada,
           (SELECT COUNT(*)::int FROM "ContentItem" i WHERE i."planId" = p.id) AS piezas,
           (SELECT COUNT(*)::int FROM "ContentItem" i WHERE i."planId" = p.id AND i."deletedAt" IS NULL) AS piezas_vivas
    FROM "ContentPlan" p
    JOIN "Client" c ON c.id = p."clientId"
    WHERE unaccent(lower(c.name)) LIKE unaccent(lower('%${needle}%'))
       OR unaccent(lower(c.slug)) LIKE unaccent(lower('%${needle}%'))
    ORDER BY p.year DESC, p.month DESC`,

  // 3. Quién borró una parrilla o una pieza, y cuándo. El middleware de auditoría registra todo
  //    DELETE como PLATFORM_MUTATION con su actor. **La ruta se guarda normalizada**
  //    (`/api/content/plans/:id`, el campo es `path`, no `pathname`), así que el registro dice
  //    quién y cuándo, pero no **cuál**: eso se empareja con el `borrada` de la consulta anterior,
  //    que caerá en el mismo segundo.
  borrados_de_parrillas: `
    SELECT ${BOGOTA('t."occurredAt"')}::text AS cuando,
           COALESCE(u.name, '(cuenta borrada)') AS quien,
           t.metadata->>'path' AS ruta,
           t.metadata->>'statusCode' AS respuesta
    FROM "OperationalTraceEvent" t
    LEFT JOIN "User" u ON u.id = t."actorId"
    WHERE t."eventType" = 'PLATFORM_MUTATION'
      AND t.metadata->>'method' = 'DELETE'
      AND t.metadata->>'path' IN ('/api/content/plans/:id', '/api/content/items/:id')
    ORDER BY t."occurredAt" DESC
    LIMIT 30`,

  // 4. Piezas colgadas del mes equivocado: se escriben en la parrilla de septiembre con fecha de
  //    octubre y entonces «octubre está vacío» aunque el trabajo exista. `publishDate` se guarda al
  //    mediodía UTC justamente para que el día no se corra, así que el mes se lee en UTC.
  piezas_en_el_mes_equivocado: `
    SELECT c.name AS cliente,
           p.year AS parrilla_year, p.month AS parrilla_mes,
           EXTRACT(YEAR FROM i."publishDate")::int AS pieza_year,
           EXTRACT(MONTH FROM i."publishDate")::int AS pieza_mes,
           COUNT(*)::int AS piezas
    FROM "ContentItem" i
    JOIN "ContentPlan" p ON p.id = i."planId"
    JOIN "Client" c ON c.id = p."clientId"
    WHERE i."deletedAt" IS NULL
      AND (unaccent(lower(c.name)) LIKE unaccent(lower('%${needle}%'))
        OR unaccent(lower(c.slug)) LIKE unaccent(lower('%${needle}%')))
      AND (EXTRACT(YEAR FROM i."publishDate")::int <> p.year
        OR EXTRACT(MONTH FROM i."publishDate")::int <> p.month)
    GROUP BY 1,2,3,4,5
    ORDER BY 2 DESC, 3 DESC`,

  // 5. Qué días cubre de verdad cada parrilla. Un cliente con día de corte distinto del 1 tiene
  //    ciclos a caballo entre dos meses, y entonces «el mes que viene está vacío» es lo normal.
  dias_que_cubre_cada_parrilla: `
    SELECT p.year, p.month,
           MIN(i."publishDate")::date::text AS desde,
           MAX(i."publishDate")::date::text AS hasta,
           COUNT(*)::int AS piezas
    FROM "ContentItem" i
    JOIN "ContentPlan" p ON p.id = i."planId"
    JOIN "Client" c ON c.id = p."clientId"
    WHERE i."deletedAt" IS NULL
      AND (unaccent(lower(c.name)) LIKE unaccent(lower('%${needle}%'))
        OR unaccent(lower(c.slug)) LIKE unaccent(lower('%${needle}%')))
    GROUP BY 1,2
    ORDER BY 1 DESC, 2 DESC`,

  // 6. El día de corte del contrato. Si el ciclo real va de mitad a mitad de mes pero el contrato
  //    dice 1, el semáforo de Operación mide contra la ventana equivocada.
  contrato: `
    SELECT c.name AS cliente, ct.status, ct."serviceType", ct."cutDay" AS dia_de_corte,
           ct."startDate" AS desde, ct."endDate" AS hasta
    FROM "ClientContract" ct
    JOIN "Client" c ON c.id = ct."clientId"
    WHERE unaccent(lower(c.name)) LIKE unaccent(lower('%${needle}%'))
       OR unaccent(lower(c.slug)) LIKE unaccent(lower('%${needle}%'))
    ORDER BY ct."startDate" DESC`,

  // 7. Red de seguridad: si el nombre del cliente cambió, el texto buscado ya no casa con nada.
  //    Las parrillas borradas de los últimos 60 días, de cualquier cliente.
  parrillas_borradas_recientes: `
    SELECT p.id, c.name AS cliente, p.year, p.month,
           ${BOGOTA('p."deletedAt"')}::text AS borrada,
           (SELECT COUNT(*)::int FROM "ContentItem" i WHERE i."planId" = p.id) AS piezas
    FROM "ContentPlan" p
    JOIN "Client" c ON c.id = p."clientId"
    WHERE p."deletedAt" IS NOT NULL
      AND p."deletedAt" >= now() - interval '60 days'
    ORDER BY p."deletedAt" DESC
    LIMIT 20`
});

export const runDiagnosis = async ({ connectionString, needle, statementTimeoutMs = 15000 } = {}) => {
  if (!connectionString) throw new Error('Falta DATABASE_URL.');
  if (!/^[a-z0-9 .'_-]{2,40}$/i.test(String(needle || ''))) {
    // Las consultas interpolan el texto, así que solo se acepta un nombre de cliente de verdad.
    throw new Error('El texto a buscar solo puede llevar letras, números, espacios, punto, apóstrofo, guion o guion bajo (2 a 40).');
  }

  const client = new pg.Client({ connectionString, statement_timeout: statementTimeoutMs, application_name: 'diagnose-missing-content-plan' });
  const out = { host: new URL(connectionString).host, buscado: needle, ranAt: new Date().toISOString(), results: {}, errors: {} };
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    for (const [name, sql] of Object.entries(buildQueries(needle))) {
      try {
        const { rows } = await client.query(sql);
        out.results[name] = rows;
      } catch (error) {
        // Una consulta fallida deja la transacción abortada: **primero** se reinicia y después se
        // reintenta, o el reintento muere con «current transaction is aborted» y el error real
        // (que suele ser que `unaccent` no está instalada) nunca se ve.
        await client.query('ROLLBACK').catch(() => {});
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        try {
          const { rows } = await client.query(sql.replaceAll('unaccent(', '('));
          out.results[name] = rows;
          out.errors[`${name}__nota`] = `Sin unaccent (${error.message}): la búsqueda distingue acentos.`;
        } catch (retryError) {
          out.errors[name] = retryError.message || error.message;
          await client.query('ROLLBACK').catch(() => {});
          await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        }
      }
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
  return out;
};

const formatBrief = (out) => {
  const lines = [`Base: ${out.host} · buscado «${out.buscado}» · ${out.ranAt}`, ''];
  for (const [name, rows] of Object.entries(out.results)) {
    lines.push(`== ${name} (${rows.length}) ==`);
    for (const row of rows) lines.push('  ' + JSON.stringify(row));
    lines.push('');
  }
  for (const [name, message] of Object.entries(out.errors)) lines.push(`${name}: ${message}`);
  return lines.join('\n');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const needle = process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'mima';
  // Desde fuera de Railway el `DATABASE_URL` del servicio apunta al host interno, que no resuelve.
  // `railway run --service Postgres` trae el acceso público sin que la credencial pase por pantalla.
  const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  const out = await runDiagnosis({ connectionString, needle });
  console.log(process.argv.includes('--brief') ? formatBrief(out) : JSON.stringify(out, null, 2));
}
