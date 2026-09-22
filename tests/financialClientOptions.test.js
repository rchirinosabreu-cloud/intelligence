import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clientOptions, ARCHIVED_CLIENT_SUFFIX } from '../src/utils/financialClients.js';

// Elvira Utria, septiembre de 2026: las dos fichas del cliente estaban archivadas,
// el desplegable de Movimientos solo mostraba activos, y el ingreso acabó en una
// ficha nueva creada para poder guardarlo. El cliente archivado tiene que aparecer.

const ledger = fs.readFileSync(new URL('../src/components/modules/financial/FinancialLedger.jsx', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../src/services/clientService.js', import.meta.url), 'utf8');

test('un cliente archivado se puede elegir, marcado como tal', () => {
    const options = clientOptions([{ id: 'a', name: 'Elvira Utria', isArchived: true }]);
    assert.equal(options.length, 1);
    assert.equal(options[0].label, `Elvira Utria${ARCHIVED_CLIENT_SUFFIX}`);
    assert.equal(options[0].isArchived, true);
});

test('los activos van primero y cada grupo en orden alfabético', () => {
    const options = clientOptions([
        { id: '1', name: 'Zafiro' },
        { id: '2', name: 'Elvira', isArchived: true },
        { id: '3', name: 'Ambar' },
        { id: '4', name: 'Aurora', isArchived: true }
    ]);
    assert.deepEqual(options.map((option) => option.name), ['Ambar', 'Zafiro', 'Aurora', 'Elvira']);
    assert.deepEqual(options.map((option) => option.isArchived), [false, false, true, true]);
});

test('el orden alfabético no se rompe con tildes ni mayúsculas', () => {
    const options = clientOptions([{ id: '1', name: 'Ñandú' }, { id: '2', name: 'ámbar' }, { id: '3', name: 'Zeta' }]);
    assert.deepEqual(options.map((option) => option.name), ['ámbar', 'Ñandú', 'Zeta']);
});

test('una fila sin id o sin nombre no rompe el desplegable', () => {
    const options = clientOptions([{ name: 'Sin id' }, null, { id: 'ok' }, undefined]);
    assert.deepEqual(options.map((option) => option.label), ['Cliente sin nombre']);
});

test('una respuesta que no es una lista devuelve una lista vacía', () => {
    assert.deepEqual(clientOptions(undefined), []);
    assert.deepEqual(clientOptions({ error: 'algo' }), []);
});

test('financiero pide los archivados y los pinta marcados', () => {
    assert.match(ledger, /\/api\/clients\?isArchived=all/);
    assert.match(ledger, /clientChoices\.map\(\(client\) => <option key=\{client\.id\} value=\{client\.id\}>\{client\.label\}/);
    assert.doesNotMatch(ledger, /clients\.map\(\(client\) => <option/);
    assert.match(dashboard, /clientTargetChoices/);
    assert.doesNotMatch(dashboard, /clientReconciliation\.targets\s*\r?\n?\s*\?\.filter/);
});

test('el valor «all» solo lo usa quien lo pide: el resto sigue viendo activos', () => {
    assert.match(service, /isArchived === 'all'/);
    // Sin el parámetro, el comportamiento no cambia para los demás módulos.
    assert.match(service, /const \{ isArchived = false, responsibleId \} = filters/);
});
