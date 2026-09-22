import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    CLIENT_RELATIONS,
    buildClientFootprints,
    formatClientFootprintReport
} from '../scripts/report-client-footprint.js';

const script = fs.readFileSync(new URL('../scripts/report-client-footprint.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

const client = (overrides = {}) => ({
    id: 'client-1', name: 'Elvira Utria', slug: 'elvira-utria', status: 'ACTIVO',
    is_archived: false, created_at: '2026-03-02T00:00:00.000Z', monthly_fee: null, responsible_name: null, ...overrides
});

test('el informe no contiene ninguna sentencia de escritura', () => {
    const body = script.replace(/^\s*\/\/.*$/gm, '');
    for (const verb of ['INSERT', 'UPDATE ', 'DELETE', 'ALTER', 'DROP', 'TRUNCATE', 'GRANT']) {
        assert.doesNotMatch(body, new RegExp(`\\b${verb}`), `el informe no debe poder ejecutar ${verb.trim()}`);
    }
});

// Si el esquema gana una tabla que apunta a un cliente y aquí no se añade,
// el informe diría que una ficha está vacía cuando no lo está.
test('conoce todas las tablas que apuntan a un cliente', () => {
    const expected = [];
    for (const match of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
        if (/^\s+clientId\s+String/m.test(match[2])) expected.push(match[1]);
    }
    assert.ok(expected.length > 5, 'no se pudo leer el esquema');
    const known = new Set(CLIENT_RELATIONS.map((relation) => relation.table));
    const missing = expected.filter((table) => !known.has(table));
    assert.deepEqual(missing, [], `tablas que apuntan a un cliente y el informe no revisa: ${missing.join(', ')}`);
});

test('ordena la última actividad por fecha, no por el texto de la fecha', () => {
    // `[new Date('2026-05-28'), new Date('2026-04-08')].sort()` compara «Thu May…»
    // contra «Wed Apr…» y devuelve abril: el informe diría que la ficha está muerta.
    const [footprint] = buildClientFootprints([client()], {
        'client-1': {
            Task: { count: 68, last: new Date('2026-05-28T00:00:00.000Z') },
            ClientFile: { count: 1, last: new Date('2026-04-08T00:00:00.000Z') }
        }
    });
    assert.equal(footprint.lastActivity.toISOString().slice(0, 10), '2026-05-28');
});

test('una fecha ilegible no tumba el cálculo ni se presenta como actividad', () => {
    const [footprint] = buildClientFootprints([client()], {
        'client-1': { Task: { count: 1, last: 'no-es-fecha' }, ClientFile: { count: 1, last: new Date('2026-04-08T00:00:00.000Z') } }
    });
    assert.equal(footprint.lastActivity.toISOString().slice(0, 10), '2026-04-08');
});

test('cuenta solo lo que existe y ordena las fichas por volumen', () => {
    const footprints = buildClientFootprints(
        [client(), client({ id: 'client-2', name: 'Elvira', slug: 'elvira' })],
        {
            'client-1': { Task: { count: 68, last: null }, ContentPlan: { count: 1, last: null } },
            'client-2': { FinancialRecord: { count: 73, last: null }, AccountsReceivable: { count: 2, last: null } }
        }
    );
    assert.deepEqual(footprints.map((footprint) => footprint.name), ['Elvira', 'Elvira Utria']);
    assert.equal(footprints[0].total, 75);
    assert.equal(footprints[1].total, 69);
    assert.equal(footprints[0].rows.length, 2, 'las relaciones vacías no se listan');
});

test('el fee se presenta como dinero, no como el decimal crudo de Prisma', () => {
    const report = formatClientFootprintReport(
        buildClientFootprints([client({ monthly_fee: '2500000.000000000000000000000000000000' })], {}),
        { database: 'host/db', query: 'prueba' }
    );
    assert.doesNotMatch(report, /2500000\.0000/);
    assert.match(report, /fee \$ 2\.500\.000/);
});

test('distingue archivada de visible y no propone cuál ficha conservar', () => {
    const report = formatClientFootprintReport(
        buildClientFootprints(
            [client({ is_archived: true }), client({ id: 'client-2', name: 'Elvira', slug: 'elvira' })],
            { 'client-1': { Task: { count: 68, last: null } }, 'client-2': { FinancialRecord: { count: 73, last: null } } }
        ),
        { database: 'host/db', query: 'prueba' }
    );
    assert.match(report, /ARCHIVADA \(no sale en Clientes\)/);
    assert.match(report, /visible en Clientes/);
    // La ficha más pequeña puede ser la única con algo: eso es justo lo que se perdería al unificar.
    assert.match(report, /«Elvira Utria» tiene 68, y es la única con: pendientes/);
    assert.match(report, /no propone cuál conservar/);
    assert.match(report, /no modificó nada/);
});

test('una ficha sin nada colgando lo dice en vez de mostrarse vacía', () => {
    const report = formatClientFootprintReport(buildClientFootprints([client()], {}), { database: 'host/db', query: 'prueba' });
    assert.match(report, /No cuelga nada de esta ficha/);
    assert.match(report, /sin rastro de actividad/);
});
