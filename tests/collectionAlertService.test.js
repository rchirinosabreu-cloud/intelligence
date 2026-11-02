import test from 'node:test';
import assert from 'node:assert/strict';
import { runCollectionAlerts } from '../src/services/collectionAlertService.js';
import { readCollectionSettings, saveCollectionSettings } from '../src/services/collectionState.js';
import { currentImportantNotice, followUpNotice } from '../src/services/importantNoticeService.js';
import { noticeTraceDescription, noticeTraceLink, NOTICE_TRACE_EVENTS } from '../src/lib/importantNoticeTrace.js';

// Punto 7 de la solicitud de Elisa (Rodny, 28 de octubre de 2026): la banda y sus decisiones son de Elisa, «la
// Coordinadora Administrativa y Contable»; Dirección y el project manager de la cuenta se enteran por la campana, y
// el project manager sin cifras.

const NOW = new Date('2026-10-01T15:00:00Z');
const team = [
    { id: 'u-elisa', name: 'Elisa Mestra', teamMember: { role: 'Coordinadora Administrativa y Contable', areas: [] } },
    { id: 'u-francisco', name: 'Francisco Villa', teamMember: { role: 'Director general ', areas: [] } },
    { id: 'u-rodny', name: 'Rodny Chirinos', teamMember: { role: 'Project Manager', areas: ['DIRECCION', 'PROJECT_MANAGEMENT'] } },
    { id: 'u-kamila', name: 'Kamila del Toro', teamMember: { role: 'Project Manager', areas: [] } },
    { id: 'u-francys', name: 'Francys Caballero', teamMember: { role: 'Comercial y Relaciones Públicas', areas: [] } }
];
const rec = (over) => ({ kind: 'CLIENTE', status: 'DEBE', amount: 1600000, issuedAt: null, dueDate: null, number: null, payments: [], ...over });
const clients = () => [
    { id: 'c-nuva', name: 'Muebles Nuva', slug: 'muebles-nuva', contracts: [{ serviceType: 'PARRILLA', startDate: '2026-01-01' }], projectManager: { userId: 'u-kamila' },
        accountsReceivables: [rec({ id: 'n-ago', period: '2026-08-01' }), rec({ id: 'n-sep', period: '2026-09-01' })] },
    { id: 'c-grit', name: 'Fundación Grit', slug: 'grit', contracts: [], projectManager: null,
        accountsReceivables: [rec({ id: 'g-1', number: 395, amount: 1500000, period: '2026-09-01', issuedAt: '2026-09-01T15:00:00Z' })] },
    { id: 'c-al-dia', name: 'Cliente al día', slug: 'al-dia', contracts: [{ serviceType: 'PARRILLA', startDate: '2026-01-01' }], projectManager: { userId: 'u-kamila' },
        accountsReceivables: [rec({ id: 'a-sep', period: '2026-09-01' })] }
];

const ON = { enabled: true, paymentTermDays: 15, monthlyAlertCount: 2, oneOffFirstAlertDays: 15, repeatDays: 7 };
const fakeDb = ({ people = team, settings = ON } = {}) => {
    const taken = new Set();
    const db = {
        logged: [],
        collectionSetting: {
            findUnique: async () => settings,
            upsert: async ({ create, update }) => ({ ...(settings ? update : create) })
        },
        client: { findMany: async () => clients() },
        collectionAlert: {
            create: async ({ data }) => {
                const key = `${data.subjectId}|${data.cycle}|${data.step}`;
                if (taken.has(key)) throw Object.assign(new Error('duplicada'), { code: 'P2002' });
                taken.add(key);
                db.logged.push(data);
                return data;
            }
        },
        user: { findMany: async () => people },
        importantNotice: { create: async () => ({}) }
    };
    return db;
};

const run = (db, options = {}) => {
    const bells = [];
    const bands = [];
    const infos = [];
    const logs = [];
    return runCollectionAlerts(db, {
        now: NOW,
        notify: async (data) => { bells.push(data); return { id: `n${bells.length}` }; },
        queueNotice: async (_db, data) => { bands.push(data); return data; },
        info: (line) => infos.push(line),
        log: (...args) => logs.push(args.join(' ')),
        ...options
    }).then((result) => ({ result, bells, bands, infos, logs }));
};

test('Elisa recibe la banda con cifras; Dirección y el project manager, la campana sin cifras', async () => {
    const { result, bells, bands } = await run(fakeDb());
    assert.equal(result.sent, 2, 'Muebles Nuva (dos mensualidades) y la cuenta puntual de Grit');

    assert.deepEqual(bands.map((band) => [band.userId, band.kind, band.subjectId]), [
        ['u-elisa', 'CARTERA_MENSUAL', 'c-nuva'],
        ['u-elisa', 'CARTERA_UNICO', 'g-1']
    ]);
    assert.match(bands[0].message, /\$3\.200\.000/);
    assert.equal(bands[0].level, 'IMPORTANTE');
    assert.equal(bands[0].url, '/financiero?tab=cartera');

    const byUser = (userId) => bells.filter((bell) => bell.userId === userId).map((bell) => bell.message);
    assert.equal(byUser('u-elisa').length, 2);
    assert.deepEqual(byUser('u-francisco'), ['Muebles Nuva tiene 2 mensualidades vencidas. Hay riesgo de suspender el servicio.']);
    assert.deepEqual(byUser('u-rodny'), byUser('u-francisco'), 'Rodny marcó Dirección en Equipo');
    assert.deepEqual(byUser('u-kamila'), ['Muebles Nuva tiene pagos atrasados: puede pausarse la producción de contenidos.']);
    assert.deepEqual(byUser('u-francys'), [], 'Comercial no recibe cartera');
    for (const bell of bells) assert.doesNotMatch(bell.message, /\$/, 'la campana llega al celular: sin cifras');
    assert.equal(bells.find((bell) => bell.userId === 'u-kamila').url, '/clientes/operacion/muebles-nuva');
    // Un servicio puntual solo le llega a Administración.
    assert.equal(bells.filter((bell) => bell.relatedId === 'g-1').map((bell) => bell.userId).join(), 'u-elisa');
});

test('apagados (como nacen), no avisan nada ni anotan nada', async () => {
    const db = fakeDb({ settings: null });
    const { result, bells, bands } = await run(db);
    assert.deepEqual([result.sent, bells.length, bands.length, db.logged.length], [0, 0, 0, 0]);
});

test('lo que ya se avisó no se repite en el mismo ciclo y paso', async () => {
    const db = fakeDb();
    await run(db);
    const again = await run(db);
    assert.equal(again.result.sent, 0);
    assert.equal(again.bells.length, 0);
    assert.equal(again.bands.length, 0);
});

test('sin nadie en Administrativa y contable, Dirección igual se entera y queda dicho en los registros', async () => {
    const people = team.filter((person) => person.id !== 'u-elisa');
    const { bands, bells, logs } = await run(fakeDb({ people }));
    assert.equal(bands.length, 0);
    assert.ok(bells.some((bell) => bell.userId === 'u-francisco'));
    assert.ok(logs.some((line) => /Administrativa y contable/.test(line)));
});

test('lo que le llegó a cada persona queda en los registros', async () => {
    const { infos } = await run(fakeDb());
    assert.ok(infos.some((line) => /Cartera: 2 avisos/.test(line)));
    assert.ok(infos.some((line) => /Elisa Mestra/.test(line) && /2 en la banda/.test(line)));
});

test('los plazos se leen de lo guardado y solo un administrador los cambia', async () => {
    assert.deepEqual(await readCollectionSettings(fakeDb({ settings: null })), { enabled: false, paymentTermDays: 15, monthlyAlertCount: 2, oneOffFirstAlertDays: 15, repeatDays: 7 });
    assert.equal((await readCollectionSettings(fakeDb({ settings: { ...ON, paymentTermDays: 10 } }))).paymentTermDays, 10);
    await assert.rejects(saveCollectionSettings(fakeDb(), { paymentTermDays: 10 }, { role: 'EDITOR' }), { statusCode: 403 });
    await assert.rejects(saveCollectionSettings(fakeDb(), { paymentTermDays: 0 }, { role: 'ADMIN', id: 'u-rodny' }), { statusCode: 400 });
    assert.equal((await saveCollectionSettings(fakeDb(), { paymentTermDays: 10 }, { role: 'ADMIN', id: 'u-rodny' })).paymentTermDays, 10);
});

// La banda: el aviso de cartera es de Administrativa y contable y sale solo cuando el cliente se pone al día.
const noticeDb = ({ receivables = clients()[0].accountsReceivables, role = 'Coordinadora Administrativa y Contable' } = {}) => {
    const notice = { id: 'aviso-1', userId: 'u-x', kind: 'CARTERA_MENSUAL', level: 'IMPORTANTE', subjectId: 'c-nuva', label: 'Cartera vencida',
        message: 'Muebles Nuva tiene 2 mensualidades vencidas desde agosto: $3.200.000 pendientes', url: '/financiero?tab=cartera', createdAt: NOW, resolvedAt: null };
    const updates = [];
    return {
        updates,
        importantNotice: {
            findMany: async () => (notice.resolvedAt ? [] : [notice]),
            findFirst: async ({ where }) => (where.id ? (where.id === notice.id ? notice : null) : null),
            update: async ({ data }) => { updates.push(data); Object.assign(notice, data); return notice; }
        },
        notification: { updateMany: async () => ({ count: 0 }) },
        teamMember: { findFirst: async () => ({ role, areas: [] }) },
        collectionSetting: { findUnique: async () => null },
        client: { findUnique: async () => ({ name: 'Muebles Nuva', accountsReceivables: receivables }) }
    };
};

test('la banda de cartera solo se le muestra a Administrativa y contable', async () => {
    assert.equal((await currentImportantNotice(noticeDb(), 'u-x', NOW)).notice?.kind, 'CARTERA_MENSUAL');
    assert.equal((await currentImportantNotice(noticeDb({ role: 'Comercial y Relaciones Públicas' }), 'u-x', NOW)).notice, null);
});

test('si el cliente se pone al día, el aviso sale solo y no cuenta como decisión', async () => {
    const db = noticeDb({ receivables: [clients()[0].accountsReceivables[0]] });
    assert.equal((await currentImportantNotice(db, 'u-x', NOW, { log: () => {} })).notice, null);
    assert.deepEqual(db.updates.map((data) => [data.resolution, data.decidedAt]), [['YA_ATENDIDO', undefined]]);
});

test('«Ya le escribí» pide Financiero, no toca el CRM y cierra el aviso', async () => {
    const crm = { addActivity: async () => { throw new Error('no debería tocar el CRM'); } };
    await assert.rejects(followUpNotice(noticeDb(), 'aviso-1', { channel: 'WHATSAPP' }, { userId: 'u-x', role: 'EDITOR', modulePermissions: {} }, { crm, now: NOW }), { statusCode: 403 });
    const db = noticeDb();
    await followUpNotice(db, 'aviso-1', { channel: 'WHATSAPP' }, { userId: 'u-x', role: 'ADMIN', name: 'Elisa Mestra' }, { crm, now: NOW, log: () => {} });
    assert.equal(db.updates.at(-1).resolution, 'SEGUIMIENTO');
});

test('la trazabilidad lo dice en palabras de cobro y enlaza a Cuentas por cobrar', () => {
    const meta = { kind: 'CARTERA_MENSUAL', subject: 'Muebles Nuva', channel: 'WHATSAPP', url: '/financiero?tab=cartera' };
    assert.equal(noticeTraceDescription(NOTICE_TRACE_EVENTS.FOLLOWED_UP, meta, { actor: 'Elisa Mestra' }), 'Elisa Mestra registró una gestión de cobro por WhatsApp con Muebles Nuva.');
    assert.equal(noticeTraceDescription(NOTICE_TRACE_EVENTS.CLEARED, { ...meta, reason: 'AL_DIA' }, { subject: 'Elisa Mestra' }),
        'Salió de la banda de Elisa Mestra el aviso de Muebles Nuva: el cliente se puso al día con lo que tenía vencido.');
    assert.equal(noticeTraceDescription(NOTICE_TRACE_EVENTS.COLLECTION_ALERTS_SENT, { alerts: 2, bell: 2, band: 2 }, { subject: 'Elisa Mestra' }),
        'Le llegaron a Elisa Mestra 2 avisos de cartera: 2 avisos en la campana y 2 en la banda.');
    assert.deepEqual(noticeTraceLink(meta), { url: '/financiero?tab=cartera', label: 'Muebles Nuva' });
});
