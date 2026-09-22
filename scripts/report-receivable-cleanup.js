// Informe de SOLO LECTURA de la cartera: qué quedó descuadrado y qué habría que
// revisar con Elisa antes de tocar nada. No abre ninguna transacción de escritura,
// no corrige, no borra y no marca nada: se puede apuntar a producción sin riesgo.
// Lee .env para que se ejecute sin exportar variables; eso apunta a la base real,
// que es justamente la intención: solo la lee.
//
// Uso:
//   node scripts/report-receivable-cleanup.js
//   node scripts/report-receivable-cleanup.js --year 2026 --client "Elvira"
//   node scripts/report-receivable-cleanup.js --abono-minimo 20000
import 'dotenv/config';
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { financialCents } from '../src/utils/financialMoney.js';

// Un abono por debajo de esto casi siempre es un dedo: 500 en vez de 500.000.
// No se afirma que lo sea; se señala para que una persona lo mire.
export const SMALL_PAYMENT_DEFAULT = 10000;

const centsOf = (value) => financialCents(value) ?? null;
const money = (value) => {
  const cents = centsOf(value);
  if (cents === null) return String(value ?? '—');
  const units = Math.floor(cents / 100);
  const rest = cents % 100;
  return `$ ${units.toLocaleString('es-CO')}${rest ? `,${String(rest).padStart(2, '0')}` : ''}`;
};
const day = (value) => (value ? new Date(value).toISOString().slice(0, 10) : 'sin fecha');
const period = (value) => (value ? new Date(value).toISOString().slice(0, 7) : 'sin periodo');
const nameOf = (row) => row.client_name || row.source_label || 'cliente sin nombre';

/**
 * Convierte las filas leídas en hallazgos. Función pura: no consulta nada.
 * Cada hallazgo dice qué se vio y qué decisión hace falta, nunca qué hacer por su cuenta.
 */
export function analyzeReceivableCleanup(data, { smallPayment = SMALL_PAYMENT_DEFAULT, investigatingClient = false } = {}) {
  const smallCents = centsOf(smallPayment) ?? SMALL_PAYMENT_DEFAULT * 100;
  const findings = [];

  // 1. Abonos con importe sospechosamente pequeño.
  for (const payment of data.payments || []) {
    if (payment.reversed_at) continue;
    const cents = centsOf(payment.amount);
    if (cents === null || cents >= smallCents) continue;
    findings.push({
      kind: 'ABONO_MINIMO',
      client: nameOf(payment),
      amount: payment.amount,
      lines: [
        `abono ${money(payment.amount)} el ${day(payment.paid_at)}${payment.reference ? ` · ref ${payment.reference}` : ''}`,
        `si faltaron tres ceros serían ${money((centsOf(payment.amount) * 1000) / 100)}`,
        `obligación ${money(payment.receivable_amount)} de ${period(payment.period)} · estado ${payment.receivable_status}`,
        payment.record_id
          ? `ingreso vinculado ${payment.record_id} (${payment.record_origin}, ${payment.record_status})`
          : 'sin ingreso vinculado'
      ],
      ids: { abono: payment.id, cuentaPorCobrar: payment.receivable_id, ingreso: payment.record_id }
    });
  }

  // 2. Ingresos que parecen un abono pero nunca se aplicaron a la cartera.
  const openByClient = new Map();
  for (const receivable of data.receivables || []) {
    const total = centsOf(receivable.amount), paid = centsOf(receivable.paid) ?? 0;
    if (total === null || total - paid <= 0) continue;
    if (!receivable.client_id) continue;
    if (!openByClient.has(receivable.client_id)) openByClient.set(receivable.client_id, []);
    openByClient.get(receivable.client_id).push(receivable);
  }
  const clientsWithOpenDebt = new Map(
    (data.receivables || []).filter((receivable) => receivable.client_id).map((receivable) => [receivable.client_id, nameOf(receivable)])
  );
  for (const income of data.unappliedIncome || []) {
    const candidates = openByClient.get(income.client_id) || [];
    if (!candidates.length) {
      // Sin deuda abierta de ese cliente no hay nada que aplicar, y es lo normal:
      // la mayoría de ingresos no vienen de cartera. Solo se muestra cuando alguien
      // está investigando un cliente concreto, porque ahí sí es la pista que falta.
      if (!investigatingClient) continue;
      const otherClients = [...clientsWithOpenDebt.entries()].filter(([id]) => id !== income.client_id);
      findings.push({
        kind: 'INGRESO_SIN_DEUDA_ABIERTA',
        client: nameOf(income),
        amount: income.amount,
        lines: [
          `ingreso ${money(income.amount)} el ${day(income.date)} · ${income.category}`,
          income.description ? `descripción: ${income.description}` : 'sin descripción',
          `está a nombre de «${nameOf(income)}» (cliente ${income.client_id}), que no tiene ninguna obligación con saldo`,
          ...(otherClients.length
            ? [
              'pero sí hay deuda abierta a nombre de otro cliente en este alcance:',
              ...otherClients.map(([id, name]) => `   «${name}» (cliente ${id})`),
              'si son la misma empresa, están duplicados: eso explicaría por qué el pago no se pudo aplicar'
            ]
            : ['tampoco hay deuda abierta de ningún otro cliente en este alcance'])
        ],
        ids: { ingreso: income.id, clienteId: income.client_id }
      });
      continue;
    }
    const exact = candidates.filter((receivable) => {
      const pending = centsOf(receivable.amount) - (centsOf(receivable.paid) ?? 0);
      return pending === centsOf(income.amount);
    });
    findings.push({
      kind: 'INGRESO_SIN_APLICAR',
      client: nameOf(income),
      amount: income.amount,
      lines: [
        `ingreso ${money(income.amount)} el ${day(income.date)} · ${income.category}${income.reference ? ` · ref ${income.reference}` : ''}`,
        income.description ? `descripción: ${income.description}` : 'sin descripción',
        `el cliente tiene ${candidates.length} obligación(es) con saldo`,
        ...candidates.slice(0, 4).map((receivable) => {
          const pending = centsOf(receivable.amount) - (centsOf(receivable.paid) ?? 0);
          return `   ${period(receivable.period)} · saldo ${money(pending / 100)} · ${receivable.id}`;
        }),
        exact.length === 1
          ? `el saldo de ${period(exact[0].period)} coincide exacto con este ingreso`
          : 'ningún saldo coincide exacto: hay que decidir a cuál va'
      ],
      ids: { ingreso: income.id, clienteId: income.client_id }
    });
  }

  // 3. Obligaciones cuyo estado no coincide con sus abonos vigentes.
  for (const receivable of data.receivables || []) {
    const total = centsOf(receivable.amount), paid = centsOf(receivable.paid) ?? 0;
    if (total === null) {
      findings.push({
        kind: 'CARTERA_ILEGIBLE', client: nameOf(receivable), amount: receivable.amount,
        lines: [`el importe de la obligación de ${period(receivable.period)} no se puede leer como dinero`],
        ids: { cuentaPorCobrar: receivable.id }
      });
      continue;
    }
    const pending = total - paid;
    let problem = null;
    if (paid > total) problem = `los abonos suman ${money(paid / 100)} y la obligación es de ${money(total / 100)}: hay ${money((paid - total) / 100)} de más`;
    else if (receivable.status === 'PAGADO' && pending > 0) problem = `figura PAGADO pero le faltan ${money(pending / 100)} en abonos`;
    else if (receivable.status !== 'PAGADO' && pending === 0) problem = `está cubierta por completo pero figura ${receivable.status}`;
    if (!problem) continue;
    findings.push({
      kind: 'CARTERA_DESCUADRADA',
      client: nameOf(receivable),
      amount: receivable.amount,
      lines: [
        `${period(receivable.period)} · obligación ${money(receivable.amount)} · abonos vigentes ${money(paid / 100)}`,
        problem
      ],
      ids: { cuentaPorCobrar: receivable.id }
    });
  }

  // 4. Ingresos creados por un abono que ya no tiene abono detrás.
  for (const income of data.orphanSystemIncome || []) {
    findings.push({
      kind: 'INGRESO_SISTEMA_HUERFANO',
      client: nameOf(income),
      amount: income.amount,
      lines: [
        `ingreso ${money(income.amount)} del ${day(income.date)} lo creó un abono, pero ya no hay abono que lo respalde`,
        income.receivable_id ? `apuntaba a la obligación ${income.receivable_id}` : 'no dice a qué obligación apuntaba',
        'mientras siga POSTED está sumando como ingreso sin descontar cartera'
      ],
      ids: { ingreso: income.id, cuentaPorCobrar: income.receivable_id }
    });
  }

  // 5. Mismo cliente, mismo día, mismo importe: puede estar contado dos veces.
  for (const group of data.duplicateIncome || []) {
    findings.push({
      kind: 'INGRESO_POSIBLE_DUPLICADO',
      client: nameOf(group),
      amount: group.amount,
      lines: [
        `${group.n} ingresos de ${money(group.amount)} el mismo día (${day(group.date)})`,
        `ids: ${(group.ids || []).join(', ')}`,
        'puede ser correcto (dos servicios iguales) o la misma plata registrada dos veces'
      ],
      ids: { ingresos: group.ids }
    });
  }

  return findings;
}

const GROUPS = [
  ['ABONO_MINIMO', 'Abonos con importe sospechosamente pequeño',
    'Revisar con quien lo registró si faltaron ceros. Se corrigen con «Revertir» en la cartera y registrando el abono bueno.'],
  ['INGRESO_SIN_APLICAR', 'Ingresos registrados a mano que nunca se aplicaron a la cartera',
    'La plata está contada en Movimientos pero la deuda sigue entera. Con Elisa: decidir a qué obligación va cada uno y aplicarlo desde «Registrar pago» eligiendo «ingreso ya registrado», para no crear un ingreso nuevo.'],
  ['INGRESO_SIN_DEUDA_ABIERTA', 'Ingresos sin aplicar cuyo cliente no tiene deuda abierta',
    'Puede ser normal (cobró y nunca hubo obligación) o puede ser que el cliente esté duplicado y la deuda viva en la otra ficha. Revisar antes de crear una obligación nueva.'],
  ['CARTERA_DESCUADRADA', 'Obligaciones cuyo estado no coincide con sus abonos',
    'No tocar el importe para cuadrarlo. Primero entender de dónde sale la diferencia.'],
  ['CARTERA_ILEGIBLE', 'Obligaciones con un importe que no se puede leer como dinero',
    'Requieren revisión manual antes de cualquier operación sobre ellas.'],
  ['INGRESO_SISTEMA_HUERFANO', 'Ingresos creados por un abono que ya no existe',
    'Confirmar si esa plata entró de verdad. Si no, anular el movimiento con motivo.'],
  ['INGRESO_POSIBLE_DUPLICADO', 'Ingresos que podrían ser la misma plata dos veces',
    'Comparar contra el extracto antes de anular ninguno.']
];

export function formatReceivableCleanupReport(findings, { database, year, clientQuery, smallPayment, scanned } = {}) {
  const lines = ['INFORME DE LIMPIEZA DE CARTERA — solo lectura', ''];
  if (database) lines.push(`Base consultada: ${database}`);
  lines.push(`Alcance: ${year ? `año ${year}` : 'todos los años'}${clientQuery ? ` · clientes que contienen «${clientQuery}»` : ''}`);
  lines.push(`Umbral de abono pequeño: ${money(smallPayment ?? SMALL_PAYMENT_DEFAULT)}`);
  if (scanned) lines.push(`Revisado: ${scanned.receivables} obligaciones, ${scanned.payments} abonos, ${scanned.income} ingresos sin aplicar.`);
  if (clientQuery) lines.push('Con filtro por cliente se muestran también los ingresos sin deuda abierta a la que aplicarse.');
  lines.push('');

  if (!findings.length) {
    lines.push('No se encontró nada descuadrado con este alcance.', '', 'Este informe no modificó nada.');
    return lines.join('\n');
  }

  lines.push(`Hallazgos: ${findings.length}`, '');
  for (const [kind, title, advice] of GROUPS) {
    const group = findings.filter((finding) => finding.kind === kind);
    if (!group.length) continue;
    lines.push(`── ${title} (${group.length})`, `   ${advice}`, '');
    for (const finding of group) {
      lines.push(`   ${finding.client}`);
      for (const line of finding.lines) lines.push(`     ${line}`);
      const ids = Object.entries(finding.ids || {}).filter(([, value]) => value && (!Array.isArray(value) || value.length));
      if (ids.length) lines.push(`     ${ids.map(([key, value]) => `${key}=${Array.isArray(value) ? value.join('/') : value}`).join('  ')}`);
      lines.push('');
    }
  }
  lines.push('Este informe no modificó nada: ninguna corrección se aplicó sola.');
  return lines.join('\n');
}

const readFlag = (argv, name) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : null;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const yearFlag = readFlag(argv, '--year');
  const year = yearFlag ? Number.parseInt(yearFlag, 10) : null;
  const clientQuery = readFlag(argv, '--client');
  const smallFlag = readFlag(argv, '--abono-minimo');
  const smallPayment = smallFlag ? Number(smallFlag) : SMALL_PAYMENT_DEFAULT;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (yearFlag && !Number.isInteger(year)) throw new Error('--year debe ser un año, por ejemplo 2026');
  if (!Number.isFinite(smallPayment) || smallPayment < 0) throw new Error('--abono-minimo debe ser un número positivo');

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, max: 2 });
  try {
    // La columna de reversión es aditiva y la crea el arranque: este informe tiene
    // que poder correrse antes de ese despliegue, así que se comprueba primero.
    const { rows: columns } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'ReceivablePayment' AND column_name = 'reversedAt'`
    );
    const hasReversal = columns.length > 0;
    const reversedSelect = hasReversal ? 'p."reversedAt" AS reversed_at' : 'NULL::timestamp AS reversed_at';
    const activePayment = hasReversal ? 'p."reversedAt" IS NULL' : 'TRUE';
    const params = [year, clientQuery ? `%${clientQuery}%` : null];
    const clientFilter = '($2::text IS NULL OR c.name ILIKE $2 OR r."sourceLabel" ILIKE $2)';

    const payments = await pool.query(`
      SELECT p.id, p.amount, p."paidAt" AS paid_at, p.reference, ${reversedSelect},
             r.id AS receivable_id, r.amount AS receivable_amount, r.status AS receivable_status,
             r.period, r."sourceLabel" AS source_label, c.name AS client_name,
             f.id AS record_id, f.origin AS record_origin, f.status AS record_status
      FROM "ReceivablePayment" p
      JOIN "AccountsReceivable" r ON r.id = p."receivableId"
      LEFT JOIN "Client" c ON c.id = r."clientId"
      LEFT JOIN "FinancialRecord" f ON f.id = p."financialRecordId"
      WHERE ($1::int IS NULL OR r.year = $1) AND ${clientFilter}
      ORDER BY p."paidAt" DESC`, params);

    const receivables = await pool.query(`
      SELECT r.id, r.amount, r.status, r.period, r."clientId" AS client_id,
             r."sourceLabel" AS source_label, c.name AS client_name,
             COALESCE(SUM(CASE WHEN ${activePayment} THEN p.amount ELSE 0 END), 0) AS paid
      FROM "AccountsReceivable" r
      LEFT JOIN "Client" c ON c.id = r."clientId"
      LEFT JOIN "ReceivablePayment" p ON p."receivableId" = r.id
      WHERE ($1::int IS NULL OR r.year = $1) AND ${clientFilter}
      GROUP BY r.id, c.name
      ORDER BY r.period DESC`, params);

    const unappliedIncome = await pool.query(`
      SELECT f.id, f.amount, f.date, f.category, f.description, f.reference,
             f."clientId" AS client_id, c.name AS client_name
      FROM "FinancialRecord" f
      LEFT JOIN "Client" c ON c.id = f."clientId"
      LEFT JOIN "ReceivablePayment" p ON p."financialRecordId" = f.id
      LEFT JOIN "PayrollTransaction" pt ON pt."financialRecordId" = f.id
      WHERE f.type = 'INCOME' AND f.status = 'POSTED' AND f.scenario = 'ACTUAL'
        AND f."isProjection" = false AND f.origin <> 'SYSTEM'
        AND f.category IN ('MEMBRESIA', 'SERVICIO', 'PAUTA')
        AND p.id IS NULL AND pt.id IS NULL AND f."clientId" IS NOT NULL
        AND ($1::int IS NULL OR f.year = $1)
        AND ($2::text IS NULL OR c.name ILIKE $2)
      ORDER BY f.date DESC`, params);

    const orphanSystemIncome = await pool.query(`
      SELECT f.id, f.amount, f.date, f.description, c.name AS client_name,
             f.metadata->>'receivableId' AS receivable_id
      FROM "FinancialRecord" f
      LEFT JOIN "Client" c ON c.id = f."clientId"
      LEFT JOIN "ReceivablePayment" p ON p."financialRecordId" = f.id
      WHERE f.origin = 'SYSTEM' AND f.status = 'POSTED' AND p.id IS NULL
        AND ($1::int IS NULL OR f.year = $1)
        AND ($2::text IS NULL OR c.name ILIKE $2)
      ORDER BY f.date DESC`, params);

    const duplicateIncome = await pool.query(`
      SELECT c.name AS client_name, f.date, f.amount, COUNT(*)::int AS n, array_agg(f.id) AS ids
      FROM "FinancialRecord" f
      LEFT JOIN "Client" c ON c.id = f."clientId"
      WHERE f.type = 'INCOME' AND f.status = 'POSTED' AND f.scenario = 'ACTUAL'
        AND f."isProjection" = false AND f."clientId" IS NOT NULL
        AND ($1::int IS NULL OR f.year = $1)
        AND ($2::text IS NULL OR c.name ILIKE $2)
      GROUP BY c.name, f.date, f.amount
      HAVING COUNT(*) > 1
      ORDER BY f.date DESC`, params);

    const findings = analyzeReceivableCleanup({
      payments: payments.rows,
      receivables: receivables.rows,
      unappliedIncome: unappliedIncome.rows,
      orphanSystemIncome: orphanSystemIncome.rows,
      duplicateIncome: duplicateIncome.rows
    }, { smallPayment, investigatingClient: Boolean(clientQuery) });

    const target = new URL(process.env.DATABASE_URL);
    console.log(formatReceivableCleanupReport(findings, {
      database: `${target.host}${target.pathname}`,
      year, clientQuery, smallPayment,
      scanned: { receivables: receivables.rowCount, payments: payments.rowCount, income: unappliedIncome.rowCount }
    }));
    if (!hasReversal) {
      console.log('\nAviso: esta base todavía no tiene las columnas de reversión (se crean al desplegar).');
      console.log('Ningún abono figura como revertido, así que todos cuentan como vigentes.');
    }
  } catch (error) {
    console.error('[Cartera] El informe falló:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
