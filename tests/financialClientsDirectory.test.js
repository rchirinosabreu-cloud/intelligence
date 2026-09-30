import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildClientDirectoryRows, filterClientDirectoryRows, isClientDirectoryRowOpen } from '../src/lib/clientDirectoryRows.js';

// La pestaña Clientes de Financiero como directorio (Rodny, 30 de septiembre de 2026:
// «aquí debería esto rediagramarse … para que aparezca también la ficha de cada cliente
// cuando lo despliego. Y desde aquí también poder añadir clientes nuevos»).

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const directory = [
    { id: 'c-grit', name: 'Fundación Grit', legalName: 'FUNDACIÓN GRIT', documentType: 'NIT', documentNumber: '901234567', email: 'pagos@grit.org' },
    { id: 'c-nuevo', name: 'Cliente sin movimientos' },
    { id: 'c-arch', name: 'Archivado', isArchived: true }
];
const reconciliation = [
    { sourceId: 'c-grit', clientId: 'c-grit', client: { name: 'Fundación Grit' }, income: 11447734, receivable: 7325000, recordCount: 7, receivableCount: 0 },
    { sourceId: 'source-label:PAGO ELVIRA U.', clientId: null, client: { name: 'PAGO ELVIRA U.' }, income: 500000, receivable: 0, recordCount: 1, receivableCount: 0 }
];

test('el directorio muestra todas las fichas, con o sin movimientos, y las etiquetas del Excel', () => {
    const rows = buildClientDirectoryRows(directory, reconciliation);
    assert.deepEqual(rows.map((row) => row.name), ['Fundación Grit', 'PAGO ELVIRA U.', 'Archivado', 'Cliente sin movimientos']);
    const grit = rows[0];
    assert.equal(grit.profile.documentNumber, '901234567', 'cada fila con ficha trae su ficha');
    assert.equal(grit.income, 11447734);
    assert.equal(grit.recordCount, 7);
    const excel = rows[1];
    assert.equal(excel.profile, null);
    assert.equal(excel.clientId, null);
    assert.equal(excel.sourceId, 'source-label:PAGO ELVIRA U.');
    assert.equal(rows.find((row) => row.clientId === 'c-nuevo').income, 0);
});

// Rodny, 30 de septiembre de 2026: «no puedo cerrar "ecozonorte", siempre aparece
// desplegado». Una etiqueta del Excel no tiene ficha, y su ficha vacía coincidía con
// «ninguna fila abierta».
test('una fila sin ficha no queda abierta cuando no hay ninguna elegida', () => {
    const rows = buildClientDirectoryRows(directory, reconciliation);
    const excel = rows.find((row) => row.clientId === null);
    const grit = rows.find((row) => row.clientId === 'c-grit');
    assert.equal(isClientDirectoryRowOpen(excel, null), false);
    assert.equal(isClientDirectoryRowOpen(excel, undefined), false);
    assert.equal(isClientDirectoryRowOpen(grit, null), false);
    assert.equal(isClientDirectoryRowOpen(excel, excel.sourceId), true);
    assert.equal(isClientDirectoryRowOpen(grit, grit.sourceId), true);
    assert.equal(isClientDirectoryRowOpen(grit, 'c-grit'), true, 'tras guardar su ficha se abre por su id');
    assert.equal(isClientDirectoryRowOpen(excel, grit.sourceId), false);
});

test('se busca por nombre, nombre legal, documento o correo, sin importar tildes', () => {
    const rows = buildClientDirectoryRows(directory, reconciliation);
    assert.deepEqual(filterClientDirectoryRows(rows, 'fundacion').map((row) => row.clientId), ['c-grit']);
    assert.deepEqual(filterClientDirectoryRows(rows, '901234').map((row) => row.clientId), ['c-grit']);
    assert.deepEqual(filterClientDirectoryRows(rows, 'PAGOS@').map((row) => row.clientId), ['c-grit']);
    assert.equal(filterClientDirectoryRows(rows, '   ').length, rows.length);
});

test('la pestaña Clientes es el directorio: ficha al desplegar, nuevo cliente y sin la etiqueta de importación', () => {
    const dashboard = read('../src/components/modules/FinancialDashboard.jsx');
    assert.match(dashboard, /<FinancialClientsDirectory/);
    assert.doesNotMatch(dashboard, /Importación activa/, 'Rodny: «esa etiqueta de importación activa no es necesaria»');
    const tab = read('../src/components/modules/financial/FinancialClientsDirectory.jsx');
    assert.match(tab, /\/api\/financials\/clients/);
    assert.match(tab, /Nuevo cliente/);
    assert.match(tab, /data-client-profile-card/);
    assert.match(tab, /Editar ficha/);
    assert.match(tab, /Crear una ficha con este nombre/);
    // La vinculación de siempre sigue dentro del panel.
    assert.match(tab, /Vincular/);
    assert.match(tab, /Ver estado de cuenta/);
});

test('Clientes crea y edita con la misma ficha completa', () => {
    const clients = read('../src/components/modules/Clients.jsx');
    assert.match(clients, /<ClientProfileFields showName=\{false\} value=\{newClientProfile\}/);
    assert.match(clients, /body: JSON\.stringify\(\{ \.\.\.profileFields, name: newClientName, slug: newClientSlug \}\)/);
    const edit = read('../src/components/modules/Clients/EditClientDialog.jsx');
    assert.match(edit, /<ClientProfileFields showName=\{false\} value=\{profile\}/);
    assert.doesNotMatch(edit, /Los tres datos van juntos/, 'el nombre legal ya va solo');
});

test('la ficha se escribe con los mismos campos en todas partes', () => {
    const dialog = read('../src/components/modules/financial/ClientProfileDialog.jsx');
    assert.match(dialog, /<ClientProfileFields/);
    assert.match(dialog, /normalizeClientProfile\(changes/);
    const fields = read('../src/components/modules/Clients/ClientProfileFields.jsx');
    for (const label of ['Nombre completo o razón social', 'Persona de contacto', 'Correo', 'Teléfono', 'Dirección', 'Ciudad', 'País']) {
        assert.match(fields, new RegExp(label));
    }
});
