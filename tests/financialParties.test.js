import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PARTY_ROLES, buildClientDirectoryRows, buildPartyRows, filterPartyRows, isPartyActive, partyContact, partyDocument, partyRoleLabel, summarizeParties } from '../src/lib/clientDirectoryRows.js';
import { THIRD_PARTY_KINDS } from '../src/lib/accountsPayable.js';
import { createThirdParty, listPartyTeam, updateThirdParty } from '../src/services/thirdPartyService.js';

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
    assert.deepEqual(summarizeParties(rows()), { total: 5, clients: 3, prospects: 0, suppliers: 2, contractors: 0, outsourcing: 0, team: 1, others: 1, active: 3, unlinked: 1 });
});

// Punto 1 de la solicitud de Elisa: un tercero puede ser «cliente, cliente potencial, proveedor, empleado, contratista,
// outsourcing u otros». Contratistas y outsourcing son a quienes se les paga un servicio: cuentan con los proveedores.
test('contratista y outsourcing son roles propios y cuentan con quienes prestan un servicio', () => {
    const extra = [
        { id: 'tp-foto', kind: 'CONTRATISTA', name: 'Fotógrafo freelance', isActive: true },
        { id: 'tp-conta', kind: 'OUTSOURCING', name: 'Contabilidad externa', isActive: true }
    ];
    const list = buildPartyRows(buildClientDirectoryRows(directory, reconciliation), [...thirdParties, ...extra]);
    assert.deepEqual(byName(list, 'Fotógrafo freelance').roles, ['CONTRATISTA']);
    const summary = summarizeParties(list);
    assert.equal(summary.suppliers, 4);
    assert.equal(summary.contractors, 1);
    assert.equal(summary.outsourcing, 1);
    assert.deepEqual(filterPartyRows(list, { role: 'OUTSOURCING' }).map((row) => row.name), ['Contabilidad externa']);
    assert.equal(partyRoleLabel('CONTRATISTA'), 'Contratista');
    assert.equal(partyRoleLabel('OUTSOURCING'), 'Outsourcing');
    // Una sola lista: los roles de Terceros salen de las clases de tercero, más cliente y cliente potencial.
    assert.deepEqual(PARTY_ROLES.map((role) => role.value), ['CLIENTE', 'CLIENTE_POTENCIAL', ...THIRD_PARTY_KINDS.map((kind) => kind.value)]);
});

test('se filtra por rol, por estado y por búsqueda, también en la ficha de pago', () => {
    const list = rows();
    assert.deepEqual(filterPartyRows(list, { role: 'PROVEEDOR' }).map((row) => row.name).sort(), ['La Sazón de Iris', 'Papelería El Punto']);
    // Rodny, 26 de octubre de 2026: «solo en el Excel» dice de dónde viene un nombre, no qué rol tiene. Se encuentra
    // por su estado, «Por vincular», y no tiene rol.
    assert.deepEqual(filterPartyRows(list, { status: 'POR_VINCULAR' }).map((row) => row.name), ['PAGO ELVIRA U.']);
    assert.deepEqual(filterPartyRows(list, { role: 'SIN_FICHA' }), [], 'ya no es un rol');
    assert.equal(PARTY_ROLES.some((item) => ['SIN_FICHA', 'OTRO'].includes(item.value)), false);
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

// El equipo en Terceros (Rodny, 26 de octubre de 2026: «tienes razón, implementa ese tema de los terceros también»):
// cada persona activa de Equipo es un tercero con el rol Colaborador sin registrarla a mano; su ficha de pago, si la
// tiene, es la misma fila.
const team = [
    { id: 'tm-melissa', name: 'Melissa', role: 'Community manager', email: 'melissa@brain.co', isActive: true },
    { id: 'tm-jarlan', name: 'Jarlan Pérez', role: 'Diseñador', email: 'jarlan@brain.co', isActive: true },
    { id: 'tm-kamila', name: 'Kamila', role: 'Editora', email: null, isActive: true }
];
const teamThirdParties = [
    ...thirdParties.filter((item) => item.id !== 'tp-melissa'),
    { id: 'tp-jarlan', kind: 'COLABORADOR', name: 'Jarlan Pérez Gómez', teamMemberId: 'tm-jarlan', bankName: 'Nequi', isActive: true },
    // Una ficha anterior sin vínculo, con el mismo nombre: se une por nombre.
    { id: 'tp-kamila', kind: 'COLABORADOR', name: 'kamila', isActive: true }
];
const teamRows = () => buildPartyRows(buildClientDirectoryRows(directory, reconciliation), teamThirdParties, {}, team);

test('cada persona del equipo es un tercero, una sola vez, con o sin ficha de pago', () => {
    const list = teamRows();
    const jarlan = list.filter((row) => row.teamMember?.id === 'tm-jarlan');
    assert.equal(jarlan.length, 1, 'la ficha de pago ligada y la persona son una fila');
    assert.equal(jarlan[0].thirdParty.id, 'tp-jarlan');
    assert.deepEqual(jarlan[0].roles, ['COLABORADOR']);
    assert.equal(list.find((row) => row.teamMember?.id === 'tm-kamila').thirdParty.id, 'tp-kamila', 'una ficha sin vínculo con el mismo nombre');
    const melissa = list.find((row) => row.teamMember?.id === 'tm-melissa');
    assert.equal(melissa.sourceId, 'equipo:tm-melissa');
    assert.equal(melissa.thirdParty, null, 'sin ficha de pago todavía');
    assert.deepEqual(melissa.roles, ['COLABORADOR']);
    assert.equal(isPartyActive(melissa), true);
    assert.equal(partyContact(melissa), 'melissa@brain.co');
    assert.equal(list.filter((row) => row.name === 'kamila' || row.name === 'Kamila').length, 1);
    assert.equal(summarizeParties(list).team, 3);
    assert.deepEqual(filterPartyRows(list, { search: 'diseñador' }).map((row) => row.teamMember?.id), ['tm-jarlan']);
});

const teamDb = ({ members = [{ id: 'tm-melissa', name: 'Melissa' }], linked = null } = {}) => {
    const tx = {
        teamMember: { findUnique: async ({ where }) => members.find((member) => member.id === where.id) || null },
        client: { findUnique: async () => null },
        thirdParty: {
            findFirst: async ({ where }) => (where.teamMemberId ? linked : null),
            findUnique: async () => ({ id: 'tp-1', kind: 'COLABORADOR', name: 'Melissa', teamMemberId: null, isActive: true }),
            create: async ({ data }) => ({ id: 'tp-new', ...data }),
            update: async ({ data }) => ({ id: 'tp-1', kind: 'COLABORADOR', name: 'Melissa', ...data })
        },
        financialAuditEvent: { create: async () => ({}) }
    };
    return { $transaction: async (fn) => fn(tx) };
};

test('la ficha de pago de alguien del equipo queda ligada a esa persona, una sola vez', async () => {
    assert.equal((await createThirdParty(teamDb(), { kind: 'COLABORADOR', name: 'Melissa', teamMemberId: 'tm-melissa' }, { id: 'u' })).teamMemberId, 'tm-melissa');
    await assert.rejects(createThirdParty(teamDb({ members: [] }), { kind: 'COLABORADOR', name: 'X', teamMemberId: 'tm-x' }, { id: 'u' }),
        (error) => error.code === 'THIRD_PARTY_TEAM_MEMBER_NOT_FOUND' && error.statusCode === 404);
    await assert.rejects(updateThirdParty(teamDb({ linked: { name: 'Melissa (Nequi)' } }), 'tp-1', { teamMemberId: 'tm-melissa' }, { id: 'u' }),
        (error) => error.code === 'THIRD_PARTY_TEAM_MEMBER_TAKEN' && /Melissa \(Nequi\)/.test(error.message));
});

test('Terceros lee el equipo activo de Equipo, con lo justo para la fila', async () => {
    const db = { teamMember: { findMany: async ({ where, select }) => {
        assert.deepEqual(where, { isActive: true });
        assert.equal(select.email, true);
        return [{ id: 'tm-1', name: 'Melissa', role: 'CM', email: 'm@b.co', avatarUrl: null, isActive: true }];
    } } };
    assert.deepEqual(await listPartyTeam(db), { team: [{ id: 'tm-1', name: 'Melissa', role: 'CM', email: 'm@b.co', avatarUrl: null, isActive: true }] });
});
