// ¿Queda alguna pieza con la pieza final en el formato viejo? (Rodny, 28 de octubre de 2026, al arreglar la
// portada que se guardaba y no aparecía: «qué es lo del adjunto único antiguo que mencionaste?»).
//
// Hasta el 26 de agosto de 2026 una pieza tenía **un solo archivo final** en cuatro columnas de la propia
// pieza (`finalAssetKey`, `finalAssetName`, `finalAssetMimeType`, `finalAssetSize`). Ese día llegaron los
// carruseles y cada archivo pasó a ser su propia fila de `ContentItemFinalAsset`, con su posición, que es el
// orden en que sale publicado. Las columnas viejas nunca se vaciaron.
//
// Al entregar **una pieza suelta**, el servidor finge que el archivo viejo es uno más de la lista y lo marca
// `isLegacy`. Al entregar **una parrilla**, no hace esa fusión —y es a propósito: el portal del cliente
// manda el archivo viejo por otro lado (`finalAsset` además de `finalAssets`) y el cliente lo vería dos
// veces—. La consecuencia: una pieza que solo tenga el archivo viejo se ve «Sin pieza final» en el editor,
// aunque el archivo esté y el cliente sí lo vea.
//
// Esto dice cuántas son. Si salen cero, se retira la ruta vieja y la fusión; si no, se arregla cuidando que
// el portal no la muestre doble.
//
//   node scripts/report-legacy-final-assets.js          # legible
//   node scripts/report-legacy-final-assets.js --json
//
// Usa DATABASE_URL del entorno y dice primero qué base respondió. **Solo lectura**: abre UNA transacción
// `READ ONLY`, cuenta y la descarta. Lo corre una persona, nunca la plataforma. No lee ningún texto de una
// pieza —ni guion, ni caption, ni notas—: solo si tiene archivo y cuál es su nombre.
import 'dotenv/config';
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { isReadOnlyQuery } from './security-review-railway-2026-10.mjs';

/** Las piezas que llevan el archivo viejo, con cuántos archivos nuevos tiene cada una. */
const CON_ARCHIVO_ANTIGUO = `
  SELECT i.id, i.format, i.status, i."publishDate", i."finalAssetName", i."createdAt",
         i."deletedAt" IS NOT NULL AS pieza_borrada,
         p."deletedAt" IS NOT NULL AS parrilla_borrada,
         p.year, p.month, p.status AS parrilla_estado, c.name AS cliente,
         (SELECT COUNT(*)::int FROM "ContentItemFinalAsset" a WHERE a."contentItemId" = i.id) AS archivos_nuevos
  FROM "ContentItem" i
  JOIN "ContentPlan" p ON p.id = i."planId"
  LEFT JOIN "Client" c ON c.id = p."clientId"
  WHERE i."finalAssetKey" IS NOT NULL
`;

export const LEGACY_QUERIES = {
  resumen: {
    que: 'Cuántas piezas llevan el archivo viejo y cuántas de ellas no tienen ninguno del formato nuevo (ésas son las que el editor ve vacías).',
    sql: `WITH piezas AS (${CON_ARCHIVO_ANTIGUO})
      SELECT COUNT(*)::int AS con_archivo_antiguo,
             COUNT(*) FILTER (WHERE archivos_nuevos = 0)::int AS solo_el_antiguo,
             COUNT(*) FILTER (WHERE archivos_nuevos = 0 AND NOT pieza_borrada AND NOT parrilla_borrada)::int AS solo_el_antiguo_y_vigentes,
             COUNT(*) FILTER (WHERE archivos_nuevos > 0)::int AS tambien_con_archivos_nuevos,
             MAX("createdAt")::date::text AS la_mas_reciente
      FROM piezas`
  },
  por_mes: {
    que: 'De las vigentes que solo tienen el archivo viejo, de qué parrillas son: así se ve si son historia o trabajo de ahora.',
    sql: `WITH piezas AS (${CON_ARCHIVO_ANTIGUO})
      SELECT year AS anio, month AS mes, COUNT(*)::int AS piezas
      FROM piezas
      WHERE archivos_nuevos = 0 AND NOT pieza_borrada AND NOT parrilla_borrada
      GROUP BY 1, 2 ORDER BY 1 DESC, 2 DESC`
  },
  por_estado: {
    que: 'Y en qué estado están: una ya publicada le importa menos a quien edita que una que todavía se trabaja.',
    sql: `WITH piezas AS (${CON_ARCHIVO_ANTIGUO})
      SELECT status AS estado, COUNT(*)::int AS piezas
      FROM piezas
      WHERE archivos_nuevos = 0 AND NOT pieza_borrada AND NOT parrilla_borrada
      GROUP BY 1 ORDER BY 2 DESC`
  },
  invisibles_en_el_editor: {
    que: 'La lista, para mirarlas una por una en la plataforma (hasta 100).',
    sql: `WITH piezas AS (${CON_ARCHIVO_ANTIGUO})
      SELECT cliente, year AS anio, month AS mes, parrilla_estado AS parrilla, id AS pieza, format AS formato,
             status AS estado, "publishDate"::date::text AS publica, "finalAssetName" AS archivo
      FROM piezas
      WHERE archivos_nuevos = 0 AND NOT pieza_borrada AND NOT parrilla_borrada
      ORDER BY year DESC, month DESC, "publishDate" LIMIT 100`
  }
};

export async function runLegacyFinalAssetReport({ connectionString, queries = LEGACY_QUERIES, statementTimeoutMs = 30000, Client = pg.Client } = {}) {
  if (!connectionString) throw new Error('Falta DATABASE_URL.');
  for (const [name, { sql }] of Object.entries(queries)) if (!isReadOnlyQuery(sql)) throw new Error(`La consulta ${name} no es de solo lectura.`);
  const client = new Client({ connectionString, statement_timeout: statementTimeoutMs, application_name: 'reporte-pieza-final-antigua' });
  const out = { base: new URL(connectionString).host, ejecutado: new Date().toISOString(), resultados: {}, errores: {} };
  await client.connect();
  const begin = async () => { await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await client.query("SET LOCAL TIME ZONE 'UTC'"); };
  try {
    await begin();
    for (const [name, { sql }] of Object.entries(queries)) {
      try { out.resultados[name] = (await client.query(sql)).rows; }
      catch (error) { out.errores[name] = error.message; await client.query('ROLLBACK'); await begin(); }
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
  return out;
}

const cell = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value === null || value === undefined ? '—' : typeof value === 'boolean' ? (value ? 'sí' : 'no') : String(value));

export const formatLegacyFinalAssetReport = (out, queries = LEGACY_QUERIES) => {
  const lines = [`Base: ${out.base} · ${out.ejecutado}`, 'Solo lectura: nada se cambió.', ''];
  for (const [name, { que }] of Object.entries(queries)) {
    lines.push(`## ${name}`, que);
    if (out.errores[name]) { lines.push(`  No se pudo leer: ${out.errores[name]}`, ''); continue; }
    const rows = out.resultados[name] || [];
    if (!rows.length) { lines.push('  (nada)', ''); continue; }
    for (const row of rows) lines.push(`  - ${Object.entries(row).map(([key, value]) => `${key}: ${cell(value)}`).join(' · ')}`);
    lines.push('');
  }
  const pendientes = out.resultados.resumen?.[0]?.solo_el_antiguo_y_vigentes;
  if (pendientes === 0) lines.push('No queda ninguna pieza vigente con solo el archivo viejo: se puede retirar la ruta antigua y su fusión.');
  else if (pendientes > 0) lines.push(`Hay ${pendientes} pieza(s) vigente(s) que en el editor se ven «Sin pieza final» aunque tengan su archivo.`);
  return lines.join('\n');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const out = await runLegacyFinalAssetReport({ connectionString: process.env.DATABASE_URL });
    console.log(process.argv.includes('--json') ? JSON.stringify(out, null, 2) : formatLegacyFinalAssetReport(out));
  } catch (error) {
    console.error(`No se pudo hacer el reporte: ${error.message}`);
    process.exitCode = 1;
  }
}
