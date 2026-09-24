// Informe de SOLO LECTURA de qué cuelga de una ficha de cliente. No corrige, no
// fusiona, no borra y no marca nada: existe para decidir con datos antes de tocar
// dos fichas duplicadas, no para elegir por nadie.
// Lee .env, así que por defecto apunta a la base real. Solo la lee.
//
// Uso:
//   node scripts/report-client-footprint.js --client "Elvira"
//   node scripts/report-client-footprint.js --id 430b3738-... --id cf6a1671-...
import 'dotenv/config';
import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Cada tabla que apunta a un cliente, con el nombre que entiende una persona.
// Si el esquema gana una relación nueva hay que añadirla aquí: el informe dice
// cuántas conoce, para que se note cuando se queda corto.
export const CLIENT_RELATIONS = Object.freeze([
  { table: 'Task', label: 'pendientes', recent: 'createdAt' },
  { table: 'ContentPlan', label: 'parrillas', recent: 'createdAt' },
  { table: 'MetricReport', label: 'informes de métricas', recent: 'createdAt' },
  { table: 'FlowMessage', label: 'mensajes del chat del cliente', recent: 'createdAt' },
  { table: 'ClientAnnouncement', label: 'anuncios', recent: 'createdAt' },
  { table: 'ClientTask', label: 'pendientes heredados', recent: null },
  { table: 'ClientLink', label: 'enlaces clave', recent: 'createdAt' },
  { table: 'ClientFile', label: 'archivos', recent: 'createdAt' },
  { table: 'BrandAsset', label: 'piezas de marca', recent: null },
  { table: 'Board', label: 'tableros de inspiración', recent: 'updatedAt' },
  { table: 'ClientHealth', label: 'registros de salud del mes', recent: 'updatedAt' },
  { table: 'ClientEditorialCriterion', label: 'criterios editoriales', recent: null },
  { table: 'ClientCriterionDiscovery', label: 'búsquedas de criterios', recent: null },
  { table: 'AgencyContext', label: 'observaciones de la bitácora', recent: 'createdAt' },
  { table: 'BriaMemorySource', label: 'fuentes de memoria de Bria', recent: null },
  { table: 'BriaObserverSignal', label: 'señales del observador de Bria', recent: null },
  { table: 'Integration', label: 'integraciones', recent: null },
  { table: 'AgencyIntegration', label: 'integraciones v2', recent: null },
  { table: 'AiGovernanceRisk', label: 'riesgos de IA', recent: 'updatedAt' },
  { table: 'AiGovernanceAuthorization', label: 'autorizaciones de IA', recent: 'updatedAt' },
  { table: 'AiGovernanceIncident', label: 'incidentes de IA', recent: 'updatedAt' },
  { table: 'AiGovernanceClientPolicy', label: 'controles de IA', recent: 'updatedAt' },
  // En financiero la fecha contable puede estar en el futuro (proyecciones): lo que
  // dice si alguien tocó la ficha es cuándo se creó el registro, no a qué mes apunta.
  { table: 'FinancialRecord', label: 'movimientos financieros', recent: 'createdAt' },
  { table: 'AccountsReceivable', label: 'cuentas por cobrar', recent: 'createdAt' },
  { table: 'CrmLead', label: 'oportunidades del CRM', recent: 'createdAt' },
  { table: 'DeletedTaskLog', label: 'pendientes eliminados', recent: null }
]);

const day = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);
// Prisma devuelve Decimal: el fee llega como «2500000.000000000000000000000000000000».
const fee = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? `$ ${number.toLocaleString('es-CO', { maximumFractionDigits: 2 })}` : String(value);
};

/** Ordena los datos leídos en un perfil por ficha. Función pura: no consulta nada. */
export function buildClientFootprints(clients, counts) {
  return clients.map((client) => {
    const rows = CLIENT_RELATIONS
      .map((relation) => ({ ...relation, ...(counts[client.id]?.[relation.table] || { count: 0, last: null }) }))
      .filter((relation) => relation.count > 0)
      .sort((a, b) => b.count - a.count);
    return {
      id: client.id,
      name: client.name,
      slug: client.slug,
      status: client.status,
      archived: client.is_archived,
      createdAt: client.created_at,
      monthlyFee: client.monthly_fee,
      responsible: client.responsible_name,
      total: rows.reduce((sum, relation) => sum + relation.count, 0),
      // Ordenar por el valor de la fecha, nunca por su texto: `sort()` sobre objetos
      // Date compara «Thu May…» contra «Wed Apr…» y devuelve el día de la semana.
      lastActivity: rows
        .map((relation) => relation.last)
        .filter(Boolean)
        .map((value) => new Date(value))
        .filter((value) => !Number.isNaN(value.getTime()))
        .sort((a, b) => a - b)
        .at(-1) || null,
      rows
    };
  }).sort((a, b) => b.total - a.total);
}

export function formatClientFootprintReport(footprints, { database, query } = {}) {
  const lines = ['QUÉ CUELGA DE CADA FICHA DE CLIENTE — solo lectura', ''];
  if (database) lines.push(`Base consultada: ${database}`);
  lines.push(`Alcance: ${query}`);
  lines.push(`Relaciones revisadas: ${CLIENT_RELATIONS.length}`, '');

  if (!footprints.length) {
    lines.push('Ninguna ficha coincide con ese alcance.', '', 'Este informe no modificó nada.');
    return lines.join('\n');
  }

  for (const footprint of footprints) {
    lines.push(`── «${footprint.name}»  (${footprint.id})`);
    lines.push(`   /${footprint.slug} · estado ${footprint.status}${footprint.archived ? ' · ARCHIVADA (no sale en Clientes)' : ' · visible en Clientes'}` +
      `${fee(footprint.monthlyFee) ? ` · fee ${fee(footprint.monthlyFee)}` : ' · sin fee'}` +
      `${footprint.responsible ? ` · responsable ${footprint.responsible}` : ' · sin responsable'}`);
    lines.push(`   creada ${day(footprint.createdAt) || 'sin fecha'}` +
      `${footprint.lastActivity ? ` · último registro añadido ${day(footprint.lastActivity)}` : ' · sin rastro de actividad'}`);
    if (!footprint.rows.length) {
      lines.push('   No cuelga nada de esta ficha.', '');
      continue;
    }
    lines.push(`   ${footprint.total} registros en total:`);
    for (const relation of footprint.rows) {
      lines.push(`     ${String(relation.count).padStart(5)}  ${relation.label}${relation.last ? `  (último añadido ${day(relation.last)})` : ''}`);
    }
    lines.push('');
  }

  if (footprints.length > 1) {
    const [first, ...rest] = footprints;
    lines.push('── Para decidir');
    lines.push(`   «${first.name}» es la que más cosas tiene colgando (${first.total}).`);
    for (const other of rest) {
      const only = other.rows.filter((relation) => !first.rows.some((row) => row.table === relation.table));
      lines.push(`   «${other.name}» tiene ${other.total}${only.length ? `, y es la única con: ${only.map((relation) => relation.label).join(', ')}` : ', y nada que la otra no tenga también'}`);
    }
    lines.push('   Unificar no es solo lo financiero: todo lo de arriba viaja con la ficha.');
    lines.push('   Este informe no propone cuál conservar.', '');
  }

  lines.push('Este informe no modificó nada: ninguna ficha se tocó ni se fusionó.');
  return lines.join('\n');
}

const readFlags = (argv, name) => argv.reduce((values, token, index) => (
  token === name && argv[index + 1] && !argv[index + 1].startsWith('--') ? [...values, argv[index + 1]] : values
), []);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const ids = readFlags(argv, '--id');
  const clientQuery = readFlags(argv, '--client')[0] || null;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!ids.length && !clientQuery) throw new Error('Indica --client "texto" o uno o más --id <uuid>');

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, max: 2 });
  try {
    const { rows: clients } = await pool.query(`
      SELECT c.id, c.name, c.slug, c.status, c."isArchived" AS is_archived, c."createdAt" AS created_at,
             c."monthlyFee" AS monthly_fee, t.name AS responsible_name
      FROM "Client" c
      LEFT JOIN "TeamMember" t ON t.id = c."responsibleId"
      WHERE ($1::text IS NULL OR c.name ILIKE $1 OR c.slug ILIKE $1)
         OR c.id = ANY($2::text[])
      ORDER BY c.name`,
    [clientQuery ? `%${clientQuery}%` : null, ids]);

    const counts = {};
    for (const client of clients) counts[client.id] = {};
    if (clients.length) {
      const clientIds = clients.map((client) => client.id);
      for (const relation of CLIENT_RELATIONS) {
        const recent = relation.recent ? `MAX(t."${relation.recent}")` : 'NULL::timestamp';
        // Una tabla que aún no exista en esta base no puede tumbar el informe entero.
        const { rows } = await pool.query(
          `SELECT t."clientId" AS client_id, COUNT(*)::int AS count, ${recent} AS last
           FROM "${relation.table}" t WHERE t."clientId" = ANY($1::text[]) GROUP BY t."clientId"`,
          [clientIds]
        ).catch((error) => {
          console.error(`  (no se pudo leer ${relation.table}: ${error.message})`);
          return { rows: [] };
        });
        for (const row of rows) counts[row.client_id][relation.table] = { count: row.count, last: row.last };
      }
    }

    const target = new URL(process.env.DATABASE_URL);
    console.log(formatClientFootprintReport(buildClientFootprints(clients, counts), {
      database: `${target.host}${target.pathname}`,
      query: clientQuery ? `fichas que contienen «${clientQuery}»` : `${ids.length} ficha(s) por id`
    }));
  } catch (error) {
    console.error('[Clientes] El informe falló:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
