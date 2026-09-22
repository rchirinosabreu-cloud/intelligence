import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    analyzeReceivableCleanup,
    formatReceivableCleanupReport,
    SMALL_PAYMENT_DEFAULT
} from '../scripts/report-receivable-cleanup.js';

const script = fs.readFileSync(new URL('../scripts/report-receivable-cleanup.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

// Este informe se apunta a producción. Que sea de solo lectura no puede depender
// de que alguien lo recuerde: se comprueba aquí.
test('el informe no contiene ninguna sentencia de escritura', () => {
    const sql = script.replace(/^\s*\/\/.*$/gm, '');
    for (const verb of ['INSERT', 'UPDATE ', 'DELETE', 'ALTER', 'DROP', 'TRUNCATE', 'CREATE', 'GRANT']) {
        assert.doesNotMatch(sql, new RegExp(`\\b${verb}`), `el informe no debe poder ejecutar ${verb.trim()}`);
    }
    assert.doesNotMatch(sql, /\$transaction|BEGIN\b|COMMIT\b/);
});

// Sin base de pruebas aislada no se puede ejecutar el SQL, pero sí comprobar que
// cada tabla y columna que nombra existe: es el fallo realista, una letra de más.
test('cada identificador que nombra el SQL existe en el esquema', () => {
    const known = new Set();
    for (const match of schema.matchAll(/^(?:model|enum)\s+(\w+)/gm)) known.add(match[1]);
    for (const match of schema.matchAll(/^\s{2}(\w+)\s+\S/gm)) known.add(match[1]);
    const queries = [...script.matchAll(/`([^`]*SELECT[^`]*)`/g)].map((match) => match[1]).join('\n');
    assert.ok(queries.includes('ReceivablePayment'), 'no se encontró ninguna consulta que revisar');
    const referenced = new Set([...queries.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"/g)].map((match) => match[1]));
    const unknown = [...referenced].filter((identifier) => !known.has(identifier));
    assert.deepEqual(unknown, [], `identificadores que no están en el esquema: ${unknown.join(', ')}`);
});

test('el SQL tolera que todavía no exista la columna de reversión', () => {
    // La columna la crea el arranque del servidor: el informe tiene que poder
    // correrse antes de ese despliegue en vez de reventar.
    assert.match(script, /information_schema\.columns/);
    assert.match(script, /hasReversal \? .* : 'NULL::timestamp AS reversed_at'/);
    assert.match(script, /hasReversal \? 'p\."reversedAt" IS NULL' : 'TRUE'/);
});

// El informe solo señala; nunca concluye por su cuenta ni propone una corrección automática.
// Contrato del caso que dejó la reunión del 21 de septiembre de 2026.

const receivable = (overrides = {}) => ({
    id: 'debt-1', client_id: 'client-1', client_name: 'Elvira Utria',
    amount: '1000000.00', paid: '0', status: 'DEBE', period: '2026-09-01T00:00:00.000Z', ...overrides
});
const payment = (overrides = {}) => ({
    id: 'payment-1', amount: '500.00', paid_at: '2026-09-21T00:00:00.000Z', reference: null, reversed_at: null,
    receivable_id: 'debt-1', receivable_amount: '1000000.00', receivable_status: 'DEBE',
    period: '2026-09-01T00:00:00.000Z', client_name: 'Elvira Utria',
    record_id: 'record-1', record_origin: 'SYSTEM', record_status: 'POSTED', ...overrides
});
const income = (overrides = {}) => ({
    id: 'record-9', amount: '500000.00', date: '2026-09-21T00:00:00.000Z', category: 'MEMBRESIA',
    description: 'Abono Elvira Utria', reference: null, client_id: 'client-1', client_name: 'Elvira Utria', ...overrides
});
const kinds = (findings) => findings.map((finding) => finding.kind);

test('señala un abono de 500 y ofrece la lectura de 500.000 sin afirmarla', () => {
    const findings = analyzeReceivableCleanup({ payments: [payment()], receivables: [receivable()] });
    const small = findings.find((finding) => finding.kind === 'ABONO_MINIMO');
    assert.ok(small, 'un abono de 500 sobre una deuda de un millón debe señalarse');
    assert.equal(small.client, 'Elvira Utria');
    assert.ok(small.lines.some((line) => /si faltaron tres ceros serían \$ 500\.000/.test(line)));
    assert.equal(small.ids.abono, 'payment-1');
    assert.equal(small.ids.ingreso, 'record-1');
});

test('un abono ya revertido no se vuelve a señalar', () => {
    const findings = analyzeReceivableCleanup({
        payments: [payment({ reversed_at: '2026-09-22T00:00:00.000Z' })],
        receivables: [receivable()]
    });
    assert.equal(kinds(findings).includes('ABONO_MINIMO'), false);
});

test('un abono normal no se señala', () => {
    const findings = analyzeReceivableCleanup({
        payments: [payment({ amount: '400000.00' })],
        receivables: [receivable({ paid: '400000.00' })]
    });
    assert.equal(kinds(findings).includes('ABONO_MINIMO'), false);
});

test('el umbral de abono pequeño se puede subir', () => {
    const data = { payments: [payment({ amount: '15000.00' })], receivables: [receivable()] };
    assert.equal(kinds(analyzeReceivableCleanup(data)).includes('ABONO_MINIMO'), false);
    assert.equal(kinds(analyzeReceivableCleanup(data, { smallPayment: 20000 })).includes('ABONO_MINIMO'), true);
});

test('señala el ingreso suelto y avisa cuando un saldo coincide exacto', () => {
    const findings = analyzeReceivableCleanup({
        receivables: [receivable({ amount: '500000.00' })],
        unappliedIncome: [income()]
    });
    const orphan = findings.find((finding) => finding.kind === 'INGRESO_SIN_APLICAR');
    assert.ok(orphan);
    assert.ok(orphan.lines.some((line) => /coincide exacto/.test(line)));
    assert.equal(orphan.ids.ingreso, 'record-9');
});

test('cuando ningún saldo coincide, lo dice en vez de elegir uno', () => {
    const findings = analyzeReceivableCleanup({
        receivables: [receivable({ amount: '900000.00' }), receivable({ id: 'debt-2', amount: '300000.00' })],
        unappliedIncome: [income()]
    });
    const orphan = findings.find((finding) => finding.kind === 'INGRESO_SIN_APLICAR');
    assert.ok(orphan.lines.some((line) => /ningún saldo coincide exacto/.test(line)));
});

test('un ingreso de un cliente sin deuda abierta no se señala en un barrido general', () => {
    // Sin filtro, la mayoría de ingresos no vienen de cartera: señalarlos sería ruido.
    const findings = analyzeReceivableCleanup({
        receivables: [receivable({ amount: '500000.00', paid: '500000.00', status: 'PAGADO' })],
        unappliedIncome: [income()]
    });
    assert.deepEqual(kinds(findings), []);
});

test('investigando un cliente sí se muestra el ingreso que no encontró deuda a la que aplicarse', () => {
    const findings = analyzeReceivableCleanup({
        receivables: [receivable({ amount: '500000.00', paid: '500000.00', status: 'PAGADO' })],
        unappliedIncome: [income()]
    }, { investigatingClient: true });
    const orphan = findings.find((finding) => finding.kind === 'INGRESO_SIN_DEUDA_ABIERTA');
    assert.ok(orphan, 'el ingreso que se revisó no puede desaparecer del informe sin decir nada');
    assert.equal(orphan.ids.ingreso, 'record-9');
});

test('si la deuda está a nombre de otro cliente, lo dice y apunta al duplicado', () => {
    const findings = analyzeReceivableCleanup({
        receivables: [receivable({ id: 'debt-2', client_id: 'client-2', client_name: 'Elvira', amount: '2850000.00', paid: '500.00' })],
        unappliedIncome: [income({ client_id: 'client-1', client_name: 'Elvira Utria' })]
    }, { investigatingClient: true });
    const orphan = findings.find((finding) => finding.kind === 'INGRESO_SIN_DEUDA_ABIERTA');
    assert.ok(orphan.lines.some((line) => /«Elvira» \(cliente client-2\)/.test(line)));
    assert.ok(orphan.lines.some((line) => /están duplicados/.test(line)));
});

test('señala una obligación PAGADO sin abonos que la respalden', () => {
    const findings = analyzeReceivableCleanup({
        receivables: [receivable({ status: 'PAGADO', paid: '400000.00' })]
    });
    const mismatch = findings.find((finding) => finding.kind === 'CARTERA_DESCUADRADA');
    assert.ok(mismatch.lines.some((line) => /figura PAGADO pero le faltan \$ 600\.000/.test(line)));
});

test('señala una obligación cubierta que sigue en DEBE y una con abonos de más', () => {
    const covered = analyzeReceivableCleanup({ receivables: [receivable({ paid: '1000000.00' })] });
    assert.ok(covered[0].lines.some((line) => /está cubierta por completo pero figura DEBE/.test(line)));
    const over = analyzeReceivableCleanup({ receivables: [receivable({ paid: '1200000.00' })] });
    assert.ok(over[0].lines.some((line) => /hay \$ 200\.000 de más/.test(line)));
});

test('una obligación sana no produce hallazgos', () => {
    const findings = analyzeReceivableCleanup({ receivables: [receivable({ paid: '400000.00' })] });
    assert.deepEqual(findings, []);
});

test('un importe ilegible se marca para revisión en vez de tratarse como cero', () => {
    const findings = analyzeReceivableCleanup({ receivables: [receivable({ amount: 'no-es-dinero' })] });
    assert.equal(findings[0].kind, 'CARTERA_ILEGIBLE');
});

test('señala el ingreso del sistema que se quedó sin abono detrás', () => {
    const findings = analyzeReceivableCleanup({
        orphanSystemIncome: [{ id: 'record-5', amount: '500.00', date: '2026-09-21T00:00:00.000Z', client_name: 'Elvira Utria', receivable_id: 'debt-1' }]
    });
    assert.equal(findings[0].kind, 'INGRESO_SISTEMA_HUERFANO');
    assert.ok(findings[0].lines.some((line) => /sumando como ingreso sin descontar cartera/.test(line)));
});

test('los posibles duplicados se presentan como duda, no como veredicto', () => {
    const findings = analyzeReceivableCleanup({
        duplicateIncome: [{ client_name: 'Elvira Utria', date: '2026-09-21T00:00:00.000Z', amount: '500000.00', n: 2, ids: ['a', 'b'] }]
    });
    assert.equal(findings[0].kind, 'INGRESO_POSIBLE_DUPLICADO');
    assert.ok(findings[0].lines.some((line) => /puede ser correcto/.test(line)));
});

test('el informe dice siempre que no modificó nada, también cuando no encuentra nada', () => {
    const empty = formatReceivableCleanupReport([], { database: 'host/db', smallPayment: SMALL_PAYMENT_DEFAULT });
    assert.match(empty, /solo lectura/);
    assert.match(empty, /No se encontró nada descuadrado/);
    assert.match(empty, /no modificó nada/);

    const full = formatReceivableCleanupReport(
        analyzeReceivableCleanup({ payments: [payment()], receivables: [receivable()] }),
        { database: 'host/db', year: 2026, clientQuery: 'Elvira', smallPayment: SMALL_PAYMENT_DEFAULT, scanned: { receivables: 1, payments: 1, income: 0 } }
    );
    assert.match(full, /Base consultada: host\/db/);
    assert.match(full, /año 2026 · clientes que contienen «Elvira»/);
    assert.match(full, /Abonos con importe sospechosamente pequeño \(1\)/);
    assert.match(full, /ninguna corrección se aplicó sola/);
});
