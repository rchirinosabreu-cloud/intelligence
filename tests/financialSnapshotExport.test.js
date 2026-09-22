import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { csvCell, csvMoney, toCsv, EXPORTS } from '../scripts/export-financial-snapshot.js';

const script = fs.readFileSync(new URL('../scripts/export-financial-snapshot.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

test('el export no contiene ninguna sentencia de escritura', () => {
    const body = script.replace(/^\s*\/\/.*$/gm, '');
    for (const verb of ['INSERT', 'UPDATE ', 'DELETE', 'ALTER', 'DROP', 'TRUNCATE', 'GRANT']) {
        assert.doesNotMatch(body, new RegExp(`\\b${verb}`), `el export no debe poder ejecutar ${verb.trim()}`);
    }
});

test('cada identificador del SQL existe en el esquema', () => {
    const known = new Set();
    for (const match of schema.matchAll(/^(?:model|enum)\s+(\w+)/gm)) known.add(match[1]);
    for (const match of schema.matchAll(/^\s{2}(\w+)\s+\S/gm)) known.add(match[1]);
    const queries = Object.values(EXPORTS).map(({ sql }) => sql).join('\n');
    const unknown = [...new Set([...queries.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"/g)].map((m) => m[1]))]
        .filter((identifier) => !known.has(identifier));
    assert.deepEqual(unknown, [], `identificadores que no están en el esquema: ${unknown.join(', ')}`);
});

// Una descripción con una coma o un salto de línea no puede partir la fila al
// abrir el CSV en Excel, o el cruce contra el Excel original sale movido.
test('una celda con comas, comillas o saltos de línea sobrevive', () => {
    assert.equal(csvCell('Pago de cartera, septiembre'), '"Pago de cartera, septiembre"');
    assert.equal(csvCell('Concepto "especial"'), '"Concepto ""especial"""');
    assert.equal(csvCell('Primera línea\nSegunda'), '"Primera línea\nSegunda"');
    assert.equal(csvCell(null), '""');
    assert.equal(csvCell(undefined), '""');
});

test('los booleanos y las fechas se leen en español y sin hora', () => {
    assert.equal(csvCell(true), '"sí"');
    assert.equal(csvCell(false), '"no"');
    assert.equal(csvCell(new Date('2026-09-16T05:00:00.000Z')), '"2026-09-16"');
});

test('el cero no se confunde con un vacío', () => {
    assert.equal(csvCell(0), '"0"');
    assert.equal(csvCell('0'), '"0"');
});

test('toCsv escribe el encabezado y una fila por registro, con saltos de Windows', () => {
    const csv = toCsv([['cliente', 'cliente'], ['importe', 'importe']], [
        { cliente: 'Elvira Utria', importe: '500000.00' },
        { cliente: 'Salsipuedes, S.A.', importe: '0' }
    ]);
    assert.deepEqual(csv.split('\r\n').filter(Boolean), [
        '"cliente","importe"',
        '"Elvira Utria","500000.00"',
        '"Salsipuedes, S.A.","0"'
    ]);
});

test('una columna calculada recibe la fila entera', () => {
    const csv = toCsv([['saldo', (row) => Number(row.importe) - Number(row.abonado)]], [{ importe: '2850000', abonado: '500' }]);
    assert.match(csv, /"2849500"/);
});

// Prisma devuelve «500000.000000000000000000000000000000»: ilegible para cruzar a mano.
test('el dinero sale con dos decimales, no con los treinta de Prisma', () => {
    assert.equal(csvMoney('500000.000000000000000000000000000000'), '500000.00');
    assert.equal(csvMoney('905350.970000000000000000000000000000'), '905350.97');
    assert.equal(csvMoney(0), '0.00');
});

test('un importe ilegible se conserva tal cual en vez de convertirse en cero', () => {
    // Redondear a 0 un dato roto lo escondería justo en el cruce que busca errores.
    assert.equal(csvMoney('no-es-dinero'), 'no-es-dinero');
    assert.equal(csvMoney(null), null);
    assert.equal(csvMoney(''), null);
});

test('las columnas de dinero pasan por el formateador', () => {
    const cartera = Object.fromEntries(EXPORTS.cartera.columns);
    for (const columna of ['importe', 'abonado_vigente', 'saldo']) {
        assert.equal(typeof cartera[columna], 'function', `${columna} tiene que formatearse como dinero`);
    }
    assert.equal(cartera.saldo({ importe: '2850000.000000000000000000000000000000', abonado: '0' }), '2850000.00');
    assert.equal(typeof Object.fromEntries(EXPORTS.movimientos.columns).importe, 'function');
    assert.equal(typeof Object.fromEntries(EXPORTS.abonos.columns).importe, 'function');
});

test('el saldo de cartera descuenta solo los abonos vigentes', () => {
    // Un abono revertido no puede reaparecer como plata aplicada en el cruce.
    assert.match(EXPORTS.cartera.sql, /FILTER \(WHERE p\."reversedAt" IS NULL\)/);
    assert.match(EXPORTS.abonos.sql, /p\."reversedAt" IS NOT NULL\) AS revertido/);
});

test('el export distingue lo que no se registró a mano', () => {
    // Sin esto no se puede saber qué vino del Excel y qué lo generó la plataforma.
    assert.match(EXPORTS.movimientos.sql, /f\."importBatchId" IS NOT NULL\) AS importado/);
    assert.match(EXPORTS.movimientos.sql, /p\.id IS NOT NULL\) AS viene_de_abono/);
    assert.match(EXPORTS.movimientos.sql, /f\."sourceSheet" AS hoja_origen/);
    const columnas = EXPORTS.movimientos.columns.map(([header]) => header);
    for (const esperada of ['estado', 'anulado_el', 'escenario', 'es_proyeccion']) {
        assert.ok(columnas.includes(esperada), `falta la columna ${esperada}: sin ella se sumarían anulados o proyecciones`);
    }
});
