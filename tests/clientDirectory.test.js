import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    listClientDirectory,
    createDirectoryClient,
    updateDirectoryClient
} from '../src/services/clientDirectoryService.js';
import { createClientWith } from '../src/services/clientService.js';

// El directorio de clientes de Financiero (Rodny, 30 de septiembre de 2026: «necesito
// crear y tener una base de datos de los clientes, un directorio … los mismos datos que
// lleva la cuenta de cobro»). Quien lleva el financiero lo mantiene sin depender de un
// administrador, y cada cambio queda en la auditoría.

const actor = { id: 'user-1' };

const makeDb = (clients = []) => {
    const calls = [];
    const db = {
        calls,
        client: {
            findMany: async (args) => { calls.push(['client.findMany', args]); return clients; },
            findUnique: async (args) => {
                calls.push(['client.findUnique', args]);
                if (args.where.slug !== undefined) return clients.find((client) => client.slug === args.where.slug) || null;
                return clients.find((client) => client.id === args.where.id) || null;
            },
            create: async (args) => { calls.push(['client.create', args]); return { id: 'client-new', ...args.data }; },
            update: async (args) => { calls.push(['client.update', args]); return { ...clients.find((client) => client.id === args.where.id), ...args.data }; }
        },
        financialAuditEvent: { create: async (args) => { calls.push(['audit.create', args]); return { id: 'audit-1' }; } }
    };
    db.$transaction = async (callback) => callback(db);
    return db;
};

test('crear una ficha guarda todos sus datos, no solo el nombre', async () => {
    const db = makeDb();
    const created = await createClientWith(db, {
        name: 'Fundación Grit', legalName: 'FUNDACIÓN GRIT', documentType: 'NIT', documentNumber: '901234567',
        contactName: 'María Pérez', email: 'pagos@grit.org', phone: '3001234567', address: 'Calle 1', city: 'Cartagena', country: 'Colombia'
    });
    const data = db.calls.find(([name]) => name === 'client.create')[1].data;
    assert.equal(data.name, 'Fundación Grit');
    assert.equal(data.slug, 'fundacion-grit');
    assert.equal(data.documentType, 'NIT');
    assert.equal(data.email, 'pagos@grit.org');
    assert.equal(data.city, 'Cartagena');
    assert.equal(created.legalName, 'FUNDACIÓN GRIT');
});

test('una ficha con un dato mal escrito no se crea a medias', async () => {
    await assert.rejects(
        createClientWith(makeDb(), { name: 'Grit', email: 'no-es-correo' }),
        (error) => error.statusCode === 400 && /correo/.test(error.message)
    );
});

test('el directorio crea la ficha y deja la auditoría', async () => {
    const db = makeDb();
    const client = await createDirectoryClient(db, { name: '2X Global', legalName: '2X GLOBAL LLC', documentType: 'EIN', documentNumber: '12-3456789', country: 'Estados Unidos' }, actor);
    assert.equal(client.id, 'client-new');
    const audit = db.calls.find(([name]) => name === 'audit.create')[1].data;
    assert.equal(audit.entityType, 'Client');
    assert.equal(audit.action, 'CREATE');
    assert.equal(audit.actorId, 'user-1');
    assert.equal(audit.after.documentType, 'EIN');
    await assert.rejects(createDirectoryClient(makeDb(), { legalName: 'Sin nombre de ficha' }, actor), (error) => error.statusCode === 400 && error.code === 'CLIENT_PROFILE_INVALID');
});

test('editar desde el directorio cambia solo lo enviado y guarda el antes y el después', async () => {
    const db = makeDb([{ id: 'client-1', name: 'Titanes', slug: 'titanes', legalName: null, documentType: null, documentNumber: null, email: null, city: 'Cartagena' }]);
    const updated = await updateDirectoryClient(db, 'client-1', { legalName: 'CORPORACIÓN DEPORTIVA LOS TITANES', email: 'Pagos@Titanes.co', city: '' }, actor);
    const update = db.calls.find(([name]) => name === 'client.update')[1];
    assert.deepEqual(update.data, { legalName: 'CORPORACIÓN DEPORTIVA LOS TITANES', email: 'pagos@titanes.co', city: null });
    assert.equal(updated.email, 'pagos@titanes.co');
    const audit = db.calls.find(([name]) => name === 'audit.create')[1].data;
    assert.equal(audit.action, 'UPDATE');
    assert.deepEqual(audit.before, { legalName: null, email: null, city: 'Cartagena' });
    assert.deepEqual(audit.after, { legalName: 'CORPORACIÓN DEPORTIVA LOS TITANES', email: 'pagos@titanes.co', city: null });
});

test('editar una ficha que no existe o con datos inválidos se dice', async () => {
    await assert.rejects(updateDirectoryClient(makeDb(), 'client-404', { city: 'Bogotá' }, actor), (error) => error.statusCode === 404);
    await assert.rejects(updateDirectoryClient(makeDb([{ id: 'client-1', name: 'X' }]), 'client-1', { name: '' }, actor), (error) => error.statusCode === 400);
    await assert.rejects(updateDirectoryClient(makeDb([{ id: 'client-1', name: 'X' }]), 'client-1', {}, actor), (error) => error.statusCode === 400);
});

// Un cliente archivado sigue debiendo: el directorio de Financiero lo muestra.
test('el directorio lista todas las fichas, archivadas incluidas, y busca por sus datos', async () => {
    const db = makeDb([{ id: 'client-1', name: 'Titanes', slug: 'titanes', isArchived: true, documentType: 'NIT', documentNumber: '901378858' }]);
    const [row] = await listClientDirectory(db, { q: ' 901378 ' });
    const args = db.calls.find(([name]) => name === 'client.findMany')[1];
    assert.equal(args.where.isArchived, undefined, 'sin filtrar archivados');
    assert.ok(args.where.OR.some((condition) => condition.documentNumber), 'busca también por documento');
    assert.equal(row.formattedDocument, 'NIT: 901378858');
    assert.equal(row.isArchived, true);
    assert.deepEqual(Object.keys(args.select).sort(), ['address', 'city', 'contactName', 'country', 'documentNumber', 'documentType', 'email', 'id', 'isArchived', 'legalName', 'name', 'phone', 'slug'].sort());
});

test('las rutas del directorio usan los permisos de Financiero', () => {
    const routes = fs.readFileSync(new URL('../src/routes/api/financials.js', import.meta.url), 'utf8');
    assert.match(routes, /router\.get\('\/clients', requireFinancialAccess, listClientDirectoryHandler\)/);
    assert.match(routes, /router\.post\('\/clients', requireFinancialWrite, createDirectoryClientHandler\)/);
    assert.match(routes, /router\.patch\('\/clients\/:id', requireFinancialWrite, updateDirectoryClientHandler\)/);
});
