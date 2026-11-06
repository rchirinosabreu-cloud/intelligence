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
].map(person => ({ ...person, role: 'EDITOR', isActive: true, modulePermissions: { financiero: ['u-elisa', 'u-francisco', 'u-rodny'].includes(person.id) }, teamMember: { ...person.teamMember, isActive: true } }));
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
            findFirst: async ({ where }) => [...db.logged].reverse().find((row) => row.subjectId === where.subjectId && row.kind === where.kind) || null,
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

test('una gestión de una cuota no detiene los avisos de otras obligaciones del cliente', async () => {
    const db = fakeDb();
    db.client.findMany = async () => [{ ...clients()[1], accountsReceivables: [
        rec({ id: 'q1', period: '2026-08-01', metadata: { collectionMode: 'CUOTA' } }),
        rec({ id: 'q2', period: '2026-08-01', metadata: { collectionMode: 'CUOTA' } })
    ] }];
    db.collectionActivity = { findFirst: async ({ where }) => where.clientId === 'c-grit' && (where.receivableId === undefined || where.receivableId === 'q1') ? { id: 'gestion-q1' } : null };
    const { bands } = await run(db);
    assert.deepEqual(bands.map((item) => item.subjectId), ['q2']);
});

test('mensualidades explícitas avisan a Dirección y PM aunque el contrato general sea de servicios', async () => {
    const db = fakeDb();
    db.client.findMany = async () => [{ ...clients()[0], contracts: [], accountsReceivables: [
        rec({ id: 'm1', period: '2026-08-01', metadata: { collectionMode: 'MENSUAL' } }),
        rec({ id: 'm2', period: '2026-09-01', metadata: { collectionMode: 'MENSUAL' } })
    ] }];
    const { bells } = await run(db);
    const pm = bells.find((item) => item.userId === 'u-kamila');
    assert.equal(pm?.type, 'CARTERA_RIESGO');
    assert.doesNotMatch(pm.message, /\$|mensualidad|\d/);
    assert.ok(bells.some((item) => item.userId === 'u-francisco'));
});

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
    assert.deepEqual(byUser('u-francisco'), ['Muebles Nuva tiene 2 cuentas vencidas en 2 períodos. Revisa su cartera.']);
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

test('reducir de tres períodos vencidos a dos no dispara otra alerta antes del intervalo', async () => {
    const db = fakeDb();
    let accounts = [...clients()[0].accountsReceivables, rec({ id: 'n-jul', period: '2026-07-01' })];
    db.client.findMany = async () => [{ ...clients()[0], accountsReceivables: accounts }];
    assert.equal((await run(db)).result.sent, 1);
    accounts = clients()[0].accountsReceivables;
    assert.equal((await run(db, { now: new Date('2026-10-01T15:30:00Z') })).result.sent, 0);
    assert.equal((await run(db, { now: new Date('2026-10-08T15:00:00Z') })).result.sent, 1);
});

test('corregir el vencimiento de una cuenta ya avisada no duplica el recordatorio en el mismo día', async () => {
    const db = fakeDb();
    let dueDate = '2026-09-01';
    db.client.findMany = async () => [{ ...clients()[1], accountsReceivables: [rec({ id: 'g-1', dueDate })] }];
    assert.equal((await run(db)).result.sent, 1);
    dueDate = '2026-09-02';
    assert.equal((await run(db, { now: new Date('2026-10-01T15:30:00Z') })).result.sent, 0);
});

test('registrar seguimiento espera el intervalo antes de volver a pedir la misma gestión', async () => {
    const db = fakeDb();
    db.client.findMany = async () => [clients()[0]];
    const contacted = new Date('2026-09-30T15:00:00Z');
    db.collectionActivity = { findFirst: async ({ where }) => contacted > where.occurredAt.gt ? { id: 'contacto' } : null };
    assert.equal((await run(db)).result.sent, 0);
    assert.equal(db.logged.length, 0, 'posponer el aviso no consume su paso');
    assert.equal((await run(db, { now: new Date('2026-10-07T15:00:00Z') })).result.sent, 1);
});

test('una parrilla vigente no convierte las cuotas de una formalización en mensualidades', async () => {
    const db = fakeDb();
    db.client.findMany = async () => [{ ...clients()[0], accountsReceivables: [
        rec({ id: 'fee', period: '2026-08-01' }),
        rec({ id: 'cuota', period: '2026-09-01', dueDate: '2026-09-01', metadata: { origin: 'FORMALIZACION', quotationId: 'q1', installmentId: 'i1' } })
    ] }];
    const { bands, bells } = await run(db);
    assert.deepEqual(bands.map((band) => [band.kind, band.subjectId]), [['CARTERA_UNICO', 'cuota']]);
    for (const item of [...bands, ...bells]) assert.doesNotMatch(item.message, /mensualidad/i);
    assert.ok(bells.some((bell) => bell.userId === 'u-kamila'), 'el PM conserva el aviso operativo sin cifras');
});

test('varias cuotas de una misma cuenta generan un solo riesgo para su project manager', async () => {
    const db = fakeDb();
    db.client.findMany = async () => [{ ...clients()[0], accountsReceivables: Array.from({ length: 4 }, (_, index) =>
        rec({ id: `cuota-${index}`, period: '2026-09-01', dueDate: '2026-09-01',
            metadata: { origin: 'FORMALIZACION', quotationId: 'q1', installmentId: `i${index}` } }))
    }];
    const { bands, bells } = await run(db);
    assert.equal(bands.length, 4, 'Administración conserva cada obligación y su decisión');
    const risks = bells.filter((bell) => bell.userId === 'u-kamila');
    assert.equal(risks.length, 1);
    assert.equal(risks[0].relatedId, 'c-nuva');
    assert.equal(risks[0].message, 'Muebles Nuva tiene pagos atrasados: puede pausarse la producción de contenidos.');
});

test('la cartera sin modalidad demostrada dice cuentas y períodos, no presume mensualidades', async () => {
    const db = fakeDb();
    db.client.findMany = async () => [{ ...clients()[0], accountsReceivables: [
        ...clients()[0].accountsReceivables,
        rec({ id: 'n-sep-extra', period: '2026-09-01' })
    ] }];
    const { bands, bells } = await run(db);
    assert.match(bands[0].message, /3 cuentas vencidas.*2 períodos/);
    for (const item of [...bands, ...bells]) assert.doesNotMatch(item.message, /mensualidad/i);
});

test('las cuotas sin hito exigible y los saldos expresamente por verificar no generan cobro', async () => {
    const db = fakeDb();
    db.client.findMany = async () => [{ ...clients()[0], accountsReceivables: [
        rec({ id: 'hito', period: '2026-07-01', metadata: { origin: 'FORMALIZACION', quotationId: 'q1', installmentId: 'i2', waitsForMilestone: true } }),
        rec({ id: 'revisar', period: '2026-08-01', metadata: { balanceReviewRequired: true } }),
        rec({ id: 'fee', period: '2026-09-01' })
    ] }];
    const { result, bells, bands } = await run(db);
    assert.equal(result.sent, 0);
    assert.equal(bells.length, 0);
    assert.equal(bands.length, 0);
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
        user: { findUnique: async () => ({ role: 'EDITOR', modulePermissions: { financiero: true }, isActive: true, teamMember: { isActive: true } }) },
        importantNotice: {
            findMany: async () => (notice.resolvedAt ? [] : [notice]),
            findFirst: async ({ where }) => (where.id ? (where.id === notice.id ? notice : null) : null),
            update: async ({ data }) => { updates.push(data); Object.assign(notice, data); return notice; }
        },
        notification: { updateMany: async () => ({ count: 0 }) },
        teamMember: { findFirst: async () => ({ role, areas: [] }) },
        collectionSetting: { findUnique: async () => null },
        client: { findUnique: async () => ({ name: 'Muebles Nuva', contracts: clients()[0].contracts, accountsReceivables: receivables }) }
    };
};

test('la banda de cartera solo se le muestra a Administrativa y contable', async () => {
    assert.equal((await currentImportantNotice(noticeDb(), 'u-x', NOW)).notice?.kind, 'CARTERA_MENSUAL');
    assert.equal((await currentImportantNotice(noticeDb({ role: 'Comercial y Relaciones Públicas' }), 'u-x', NOW)).notice, null);
});

test('la banda guardada se actualiza con saldo vigente y texto neutral sin reemplazar el aviso', async () => {
    const db = noticeDb({ receivables: [
        { ...clients()[0].accountsReceivables[0], payments: [{ amount: 600000 }] }, clients()[0].accountsReceivables[1]
    ] });
    const { notice } = await currentImportantNotice(db, 'u-x', NOW);
    assert.equal(notice.id, 'aviso-1');
    assert.match(notice.message, /2 cuentas vencidas en 2 períodos/);
    assert.match(notice.message, /\$2\.600\.000/);
    assert.ok(db.updates.every((data) => !('snoozedUntil' in data) && !('createdAt' in data) && !('resolvedAt' in data)));
});

test('una alerta guardada no sostiene dos períodos sumando una cuota de formalización', async () => {
    const db = noticeDb({ receivables: [clients()[0].accountsReceivables[0],
        { ...clients()[0].accountsReceivables[1], metadata: { origin: 'FORMALIZACION', quotationId: 'q1', installmentId: 'i1' } }
    ] });
    assert.equal((await currentImportantNotice(db, 'u-x', NOW, { log: () => {} })).notice, null);
});

test('el aviso individual deja de insistir si el vencimiento se corrigió al futuro', async () => {
    const db = noticeDb();
    const previousRead = db.importantNotice.findMany;
    db.importantNotice.findMany = async (...args) => (await previousRead(...args)).map((notice) => ({ ...notice, kind: 'CARTERA_UNICO', subjectId: 'r1' }));
    db.accountsReceivable = { findUnique: async () => rec({ id: 'r1', clientId: 'c-nuva', client: { name: 'Muebles Nuva' }, dueDate: '2026-11-01' }) };
    assert.equal((await currentImportantNotice(db, 'u-x', NOW, { log: () => {} })).notice, null);
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
