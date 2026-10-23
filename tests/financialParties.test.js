import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildClientDirectoryRows, buildPartyRows, filterPartyRows, isPartyActive, partyContact, partyDocument, summarizeParties } from '../src/lib/clientDirectoryRows.js';
import { createThirdParty, updateThirdParty } from '../src/services/thirdPartyService.js';

// Terceros (Elisa, 23 de octubre de 2026: «el tema de terceros, nos gusta como lo hacen acá»): una sola
// lista con los clientes y a quienes se les paga, con sus roles; una ficha por tercero.

const directory = [
    { id: 'c-grit', name: 'Fundación Grit', legalName: 'FUNDACIÓN GRIT', documentType: 'NIT', documentNumber: '901.234.567', email: 'pagos@grit.org', phone: '300' },
    { id: 'c-iris', name: 'La Sazón de Iris' },
    { id: 'c-arch', name: 'Archivado', isArchived: true }
];
const reconciliation = [{ sourceId: 'source-label:PAGO ELVIRA U.', clientId: null, client: { name: 'PAGO ELVIRA U.' }, income: 500000, receivable: 0, recordCount: 1, receivableCount: 0 }];
const thirdParties = [
    { id: 'tp-iris', kind: 'PROVEEDOR', name: 'Iris proveedora', clientId: 'c-iris', isActive: true },
    { id: 'tp-grit', kind: 'ARRENDADOR', name: 'Grit arriendo', documentType: 'NIT', documentNumber: '901234567', isActive: true },
    { id: 'tp-papel', kind: 'PROVEEDOR', name: 'Papelería El Punto', documentType: 'NIT', documentNumber: '800111', phone: '310', email: 'ventas@punto.co', isActive: true },
    { id: 'tp-melissa', kind: 'COLABORADOR', name: 'Melissa', isActive: false }
];
const rows = () => buildPartyRows(buildClientDirectoryRows(directory, reconciliation), thirdParties);
const byName = (list, name) => list.find((row) => row.name === name);

test('un tercero ligado a un cliente, o con su mismo documento, es una sola fila con los dos roles', () => {
    const list = rows();
    assert.deepEqual(byName(list, 'La Sazón de Iris').roles, ['CLIENTE', 'PROVEEDOR'], 'ligado por su ficha');
    assert.deepEqual(byName(list, 'Fundación Grit').roles, ['CLIENTE', 'ARRENDADOR'], 'mismo NIT, aunque uno lleve puntos');
    assert.equal(byName(list, 'Iris proveedora'), undefined);
    assert.equal(byName(list, 'Grit arriendo'), undefined);
    assert.deepEqual(byName(list, 'Papelería El Punto').roles, ['PROVEEDOR']);
    assert.equal(byName(list, 'Papelería El Punto').sourceId, 'tercero:tp-papel');
});

test('un nombre que solo está en el Excel no es un tercero todavía: se vincula', () => {
    const excel = byName(rows(), 'PAGO ELVIRA U.');
    assert.equal(excel.unlinked, true);
    assert.deepEqual(excel.roles, []);
});

test('documento, contacto y estado salen de la ficha que los tenga', () => {
    const list = rows();
    assert.equal(partyDocument(byName(list, 'Fundación Grit')), 'NIT 901.234.567');
    assert.equal(partyDocument(byName(list, 'Papelería El Punto')), 'NIT 800111');
    assert.equal(partyContact(byName(list, 'Papelería El Punto')), '310 · ventas@punto.co');
    assert.equal(isPartyActive(byName(list, 'Archivado')), false, 'un cliente archivado está inactivo');
    assert.equal(isPartyActive(byName(list, 'Melissa')), false, 'una ficha de pago desactivada también');
});

test('las cifras de arriba cuentan terceros con ficha, por rol', () => {
    assert.deepEqual(summarizeParties(rows()), { total: 5, clients: 3, prospects: 0, suppliers: 2, team: 1, others: 1, active: 3, unlinked: 1 });
});

test('se filtra por rol, por estado y por búsqueda, también en la ficha de pago', () => {
    const list = rows();
    assert.deepEqual(filterPartyRows(list, { role: 'PROVEEDOR' }).map((row) => row.name).sort(), ['La Sazón de Iris', 'Papelería El Punto']);
    assert.deepEqual(filterPartyRows(list, { role: 'SIN_FICHA' }).map((row) => row.name), ['PAGO ELVIRA U.']);
    assert.deepEqual(filterPartyRows(list, { status: 'INACTIVO' }).map((row) => row.name).sort(), ['Archivado', 'Melissa']);
    assert.equal(filterPartyRows(list, { status: 'ACTIVO' }).some((row) => row.unlinked), false);
    assert.deepEqual(filterPartyRows(list, { search: 'ventas@punto' }).map((row) => row.name), ['Papelería El Punto']);
});

// El servidor: el vínculo con el cliente se comprueba y se dice el motivo.
const fakeDb = ({ clients = [{ id: 'c-iris', name: 'La Sazón de Iris' }], linked = null } = {}) => {
    const calls = [];
    const tx = {
        client: { findUnique: async ({ where }) => clients.find((client) => client.id === where.id) || null },
        thirdParty: {
            findFirst: async ({ where }) => (where.clientId ? linked : null),
            findUnique: async () => ({ id: 'tp-1', kind: 'PROVEEDOR', name: 'Iris proveedora', clientId: null, isActive: true }),
            create: async ({ data }) => { calls.push(['create', data]); return { id: 'tp-new', ...data }; },
            update: async ({ data }) => { calls.push(['update', data]); return { id: 'tp-1', kind: 'PROVEEDOR', name: 'Iris proveedora', ...data }; }
        },
        financialAuditEvent: { create: async () => ({}) }
    };
    return { calls, prisma: { $transaction: async (fn) => fn(tx) } };
};

test('crear la ficha de pago de un cliente la deja ligada a él', async () => {
    const db = fakeDb();
    const created = await createThirdParty(db.prisma, { kind: 'PROVEEDOR', name: 'Iris proveedora', clientId: 'c-iris' }, { id: 'u' });
    assert.equal(created.clientId, 'c-iris');
});

test('un cliente que no existe, o que ya tiene ficha de pago, se rechaza diciendo por qué', async () => {
    await assert.rejects(createThirdParty(fakeDb({ clients: [] }).prisma, { kind: 'PROVEEDOR', name: 'X', clientId: 'c-x' }, { id: 'u' }),
        (error) => error.code === 'THIRD_PARTY_CLIENT_NOT_FOUND' && error.statusCode === 404);
    await assert.rejects(updateThirdParty(fakeDb({ linked: { name: 'Otra ficha' } }).prisma, 'tp-1', { clientId: 'c-iris' }, { id: 'u' }),
        (error) => error.code === 'THIRD_PARTY_CLIENT_TAKEN' && /Otra ficha/.test(error.message));
});

test('la base guarda el vínculo con una columna aditiva, única y que se suelta si se borra el cliente', () => {
    const schema = fs.readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
    assert.match(schema, /clientId\s+String\?\s+@unique\r?\n\s+client\s+Client\?\s+@relation\("ClientThirdParty", fields: \[clientId\], references: \[id\], onDelete: SetNull\)/);
    const ensure = fs.readFileSync(new URL('../scripts/ensure-accounts-payable-schema.js', import.meta.url), 'utf8');
    assert.match(ensure, /ADD COLUMN IF NOT EXISTS "clientId"/);
    assert.match(ensure, /CREATE UNIQUE INDEX IF NOT EXISTS "ThirdParty_clientId_key"/);
    assert.match(ensure, /ON DELETE SET NULL/);
});

test('la pantalla: Terceros en Financiero, por rol y estado, y Por pagar lleva allá', () => {
    const view = fs.readFileSync(new URL('../src/components/modules/financial/FinancialPartiesDirectory.jsx', import.meta.url), 'utf8');
    for (const text of ['Nuevo tercero', 'Todos los roles', 'Activos e inactivos', 'También se le paga', 'También es cliente', 'Ficha de pago', 'Ficha del cliente', 'Vincular']) assert.match(view, new RegExp(text));
    assert.match(view, /<DropdownMenu>/, 'nuevo tercero pregunta primero qué es, con el menú de acciones compartido');
    // Por pagar y Terceros comparten la caché de terceros: las dos guardan la respuesta entera. Con
    // formas distintas, ir de Cuentas por pagar a Terceros tumbaba la pantalla.
    assert.doesNotMatch(view, /\.data\?\.thirdParties \|\| \[\]/);
    assert.match(view, /thirdPartiesData\?\.thirdParties/);
    const payables = fs.readFileSync(new URL('../src/components/modules/financial/PayablesTab.jsx', import.meta.url), 'utf8');
    assert.match(payables, /onClick=\{\(\) => onOpenThirdParties\?\.\(\)\}/);
    assert.doesNotMatch(payables, /ThirdPartiesDialog/);
});
