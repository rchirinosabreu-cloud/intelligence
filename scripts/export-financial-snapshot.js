// Export de SOLO LECTURA de lo que la plataforma tiene en financiero, en CSV, para
// cruzarlo contra el Excel original y los extractos bancarios. No corrige, no marca
// y no escribe nada en la base: solo la lee y deja archivos en disco.
// Lee .env, así que por defecto apunta a la base real. Solo la lee.
//
// Uso:
//   node scripts/export-financial-snapshot.js --year 2026
//   node scripts/export-financial-snapshot.js --year 2026 --salida C:\ruta\cierre-septiembre
import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Una celda CSV segura: comillas dobladas, y siempre entrecomillada para que una
 *  descripción con comas o saltos de línea no parta la fila al abrirla en Excel. */
export const csvCell = (value) => {
    if (value === null || value === undefined) return '""';
    if (value instanceof Date) return `"${value.toISOString().slice(0, 10)}"`;
    if (typeof value === 'boolean') return value ? '"sí"' : '"no"';
    return `"${String(value).replace(/"/g, '""')}"`;
};

/** Prisma devuelve Decimal con 30 decimales («500000.0000…»). Para cruzar contra un
 *  Excel eso es ruido: se deja en céntimos, con punto decimal, sin separador de miles. */
export const csvMoney = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : String(value);
};
const money = (key) => (row) => csvMoney(typeof key === 'function' ? key(row) : row[key]);

export const toCsv = (columns, rows) => [
    columns.map(([header]) => csvCell(header)).join(','),
    ...rows.map((row) => columns.map(([, key]) => csvCell(typeof key === 'function' ? key(row) : row[key])).join(','))
].join('\r\n') + '\r\n';

export const EXPORTS = Object.freeze({
    movimientos: {
        columns: [
            ['id', 'id'], ['fecha', 'fecha'], ['anio', 'anio'], ['mes', 'mes'], ['tipo', 'tipo'],
            ['categoria', 'categoria'], ['seccion', 'seccion'], ['cliente', 'cliente'], ['cuenta', 'cuenta'],
            ['descripcion', 'descripcion'], ['contraparte', 'contraparte'], ['referencia', 'referencia'],
            ['importe', money('importe')], ['escenario', 'escenario'], ['estado', 'estado'], ['origen', 'origen'],
            ['es_proyeccion', 'es_proyeccion'], ['anulado_el', 'anulado_el'], ['motivo_anulacion', 'motivo_anulacion'],
            ['viene_de_abono', 'viene_de_abono'], ['viene_de_nomina', 'viene_de_nomina'],
            ['hoja_origen', 'hoja_origen'], ['fila_origen', 'fila_origen'], ['etiqueta_origen', 'etiqueta_origen'],
            ['importado', 'importado'], ['registrado_el', 'registrado_el']
        ],
        sql: `
            SELECT f.id, f.date AS fecha, f.year AS anio, f.month AS mes, f.type AS tipo,
                   f.category AS categoria, f.section AS seccion, c.name AS cliente, a.name AS cuenta,
                   f.description AS descripcion, f.counterparty AS contraparte, f.reference AS referencia,
                   f.amount AS importe, f.scenario AS escenario, f.status AS estado, f.origin AS origen,
                   f."isProjection" AS es_proyeccion, f."voidedAt" AS anulado_el, f."voidReason" AS motivo_anulacion,
                   (p.id IS NOT NULL) AS viene_de_abono, (pt.id IS NOT NULL) AS viene_de_nomina,
                   f."sourceSheet" AS hoja_origen, f."sourceRow" AS fila_origen, f."sourceLabel" AS etiqueta_origen,
                   (f."importBatchId" IS NOT NULL) AS importado, f."createdAt" AS registrado_el
            FROM "FinancialRecord" f
            LEFT JOIN "Client" c ON c.id = f."clientId"
            LEFT JOIN "FinancialAccount" a ON a.id = f."accountId"
            LEFT JOIN "ReceivablePayment" p ON p."financialRecordId" = f.id
            LEFT JOIN "PayrollTransaction" pt ON pt."financialRecordId" = f.id
            WHERE ($1::int IS NULL OR f.year = $1)
            ORDER BY f.date, f."createdAt"`
    },
    cartera: {
        columns: [
            ['id', 'id'], ['cliente', 'cliente'], ['cliente_archivado', 'cliente_archivado'],
            ['etiqueta_origen', 'etiqueta_origen'], ['periodo', 'periodo'], ['anio', 'anio'], ['mes', 'mes'],
            ['vence', 'vence'], ['importe', money('importe')], ['abonado_vigente', money('abonado')],
            ['saldo', money((row) => Number(row.importe) - Number(row.abonado))],
            ['estado', 'estado'], ['origen', 'origen'], ['importado', 'importado'],
            ['notas', 'notas'], ['comentarios', 'comentarios'], ['creada_el', 'creada_el']
        ],
        sql: `
            SELECT r.id, c.name AS cliente, c."isArchived" AS cliente_archivado,
                   r."sourceLabel" AS etiqueta_origen, r.period AS periodo, r.year AS anio, r.month AS mes,
                   r."dueDate" AS vence, r.amount AS importe,
                   COALESCE(SUM(p.amount) FILTER (WHERE p."reversedAt" IS NULL), 0) AS abonado,
                   r.status AS estado, r.origin AS origen, (r."importBatchId" IS NOT NULL) AS importado,
                   r.notes AS notas, r.comments AS comentarios, r."createdAt" AS creada_el
            FROM "AccountsReceivable" r
            LEFT JOIN "Client" c ON c.id = r."clientId"
            LEFT JOIN "ReceivablePayment" p ON p."receivableId" = r.id
            WHERE ($1::int IS NULL OR r.year = $1)
            GROUP BY r.id, c.name, c."isArchived"
            ORDER BY c.name, r.period`
    },
    abonos: {
        columns: [
            ['id', 'id'], ['cliente', 'cliente'], ['obligacion', 'obligacion'], ['periodo', 'periodo'],
            ['fecha', 'fecha'], ['importe', money('importe')], ['cuenta', 'cuenta'], ['referencia', 'referencia'],
            ['revertido', 'revertido'], ['revertido_el', 'revertido_el'], ['motivo_reversion', 'motivo_reversion'],
            ['movimiento_vinculado', 'movimiento_vinculado'], ['registrado_el', 'registrado_el']
        ],
        sql: `
            SELECT p.id, c.name AS cliente, p."receivableId" AS obligacion, r.period AS periodo,
                   p."paidAt" AS fecha, p.amount AS importe, a.name AS cuenta, p.reference AS referencia,
                   (p."reversedAt" IS NOT NULL) AS revertido, p."reversedAt" AS revertido_el,
                   p."reversalReason" AS motivo_reversion, p."financialRecordId" AS movimiento_vinculado,
                   p."createdAt" AS registrado_el
            FROM "ReceivablePayment" p
            JOIN "AccountsReceivable" r ON r.id = p."receivableId"
            LEFT JOIN "Client" c ON c.id = r."clientId"
            LEFT JOIN "FinancialAccount" a ON a.id = p."accountId"
            WHERE ($1::int IS NULL OR r.year = $1)
            ORDER BY p."paidAt"`
    },
    cuentas: {
        columns: [
            ['id', 'id'], ['nombre', 'nombre'], ['tipo', 'tipo'], ['moneda', 'moneda'], ['activa', 'activa'],
            ['saldo_inicial', money('saldo_inicial')], ['fecha_saldo_inicial', 'fecha_saldo_inicial']
        ],
        sql: `
            SELECT a.id, a.name AS nombre, a.type AS tipo, a.currency AS moneda, a."isActive" AS activa,
                   a."openingBalance" AS saldo_inicial, a."openingBalanceDate" AS fecha_saldo_inicial
            FROM "FinancialAccount" a
            WHERE $1::int IS NULL OR TRUE
            ORDER BY a.name`
    }
});

const readFlag = (argv, name) => {
    const index = argv.indexOf(name);
    return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : null;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const argv = process.argv.slice(2);
    const yearFlag = readFlag(argv, '--year');
    const year = yearFlag ? Number.parseInt(yearFlag, 10) : null;
    const outDir = readFlag(argv, '--salida') || path.join('output', `financiero-${year || 'todo'}`);
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    if (yearFlag && !Number.isInteger(year)) throw new Error('--year debe ser un año, por ejemplo 2026');

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, max: 2 });
    try {
        fs.mkdirSync(outDir, { recursive: true });
        const target = new URL(process.env.DATABASE_URL);
        console.log(`EXPORT FINANCIERO — solo lectura\n`);
        console.log(`Base consultada: ${target.host}${target.pathname}`);
        console.log(`Alcance: ${year ? `año ${year}` : 'todos los años'}`);
        console.log(`Carpeta: ${path.resolve(outDir)}\n`);

        for (const [name, { columns, sql }] of Object.entries(EXPORTS)) {
            const { rows } = await pool.query(sql, [year]);
            const file = path.join(outDir, `${name}.csv`);
            // BOM para que Excel abra los acentos bien sin preguntar nada.
            fs.writeFileSync(file, '\uFEFF' + toCsv(columns, rows), 'utf8');
            console.log(`  ${String(rows.length).padStart(6)} filas  ${name}.csv`);
        }
        console.log('\nEste export no modificó nada: la base solo se leyó.');
    } catch (error) {
        console.error('[Export financiero] Falló:', error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}
