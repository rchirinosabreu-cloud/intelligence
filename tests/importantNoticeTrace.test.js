import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    NOTICE_TRACE_EVENTS, NOTICE_TRACE_LABELS, noticeTraceDescription, noticeTraceLink
} from '../src/lib/importantNoticeTrace.js';
import {
    closeReviewNotice, currentImportantNotice, followUpNotice, markNoticeShown, snoozeNotice
} from '../src/services/importantNoticeService.js';
import { runFollowUpAlerts } from '../src/services/crmFollowUpAlertService.js';
import { getOperationalTrace } from '../src/services/operationalTraceService.js';
import { isInternalTraceRequest } from '../src/lib/operationalMutationLabels.js';

// Rodny, 27 de octubre de 2026: «quiero que los logs guarden todos esos eventos». Que la alerta salió, que la banda se
// le mostró a alguien, lo que decidió y lo que salió solo de la banda quedan en la trazabilidad de Salud operativa y en
// los registros de Railway. Antes solo se sabía leyendo la base.

const at = (iso) => new Date(iso);
const NOW = at('2026-10-27T15:00:00Z');
const francys = { userId: 'u-francys', name: 'Francys Caballero', role: 'EDITOR', modulePermissions: { crm: true } };

test('cada evento se dice en una frase, con la persona y la oportunidad', () => {
    const E = NOTICE_TRACE_EVENTS;
    const who = { actor: 'Francys Caballero', subject: 'Francys Caballero' };
    assert.equal(noticeTraceDescription(E.ALERTS_SENT, { reviews: 55, reminders: 7, bell: 2, band: 62 }, who),
        'Le llegaron a Francys Caballero 62 alertas comerciales (55 revisiones y 7 recordatorios): 2 avisos en la campana y 62 en la banda.');
    assert.equal(noticeTraceDescription(E.ALERTS_SENT, { reviews: 55, reminders: 0, bell: 1, band: 0 }, { subject: 'Elisa Mestra' }),
        'Le llegaron a Elisa Mestra 55 alertas comerciales (55 revisiones): 1 aviso en la campana.');
    assert.equal(noticeTraceDescription(E.ALERTS_SENT, { reviews: 0, reminders: 1, bell: 1, band: 1, subject: 'Café Altura' }, who),
        'Le llegó a Francys Caballero la alerta comercial de Café Altura (recordatorio): 1 aviso en la campana y 1 en la banda.');
    assert.equal(noticeTraceDescription(E.SHOWN, { message: 'Centro Andino lleva 30 días sin responder: ¿sigue o no?' }, who),
        'Se le mostró a Francys Caballero en la banda: «Centro Andino lleva 30 días sin responder: ¿sigue o no?».');
    assert.equal(noticeTraceDescription(E.FOLLOWED_UP, { subject: 'Café Altura', channel: 'WHATSAPP' }, who),
        'Francys Caballero registró un seguimiento por WhatsApp desde el aviso de Café Altura.');
    assert.equal(noticeTraceDescription(E.FOLLOWED_UP, { subject: 'Café Altura', channel: 'RESPUESTA_CLIENTE' }, who),
        'Francys Caballero anotó desde el aviso que Café Altura respondió.');
    assert.equal(noticeTraceDescription(E.SNOOZED, { subject: 'Café Altura', option: 'tomorrow' }, who),
        'Francys Caballero pospuso el aviso de Café Altura hasta mañana a las 8:00.');
    assert.equal(noticeTraceDescription(E.CLOSED, { subject: 'Centro Andino', outcome: 'PERDIDO' }, who),
        'Francys Caballero marcó Centro Andino como perdida desde el aviso de revisión.');
    assert.equal(noticeTraceDescription(E.CLOSED, { subject: 'Centro Andino', outcome: 'DESCARTADO' }, who),
        'Francys Caballero marcó Centro Andino como descartada desde el aviso de revisión.');
    assert.equal(noticeTraceDescription(E.CLEARED, { subject: 'Café Altura', reason: 'GESTION' }, who),
        'Salió de la banda de Francys Caballero el aviso de Café Altura: ya se registró una gestión con el cliente en el CRM.');
    assert.equal(noticeTraceDescription(E.CLEARED, { subject: 'ARISTEA', reason: 'REASIGNADO' }, { subject: 'Rodny Chirinos' }),
        'Salió de la banda de Rodny Chirinos el aviso de ARISTEA: el seguimiento le corresponde al equipo comercial.');
    // Sin nombre de la oportunidad, la frase sigue en pie.
    assert.equal(noticeTraceDescription(E.SNOOZED, { option: '1h' }, who), 'Francys Caballero pospuso el aviso de la oportunidad por 1 hora.');
    assert.deepEqual(Object.keys(NOTICE_TRACE_LABELS).sort(), Object.values(E).sort());
});

test('el enlace del evento lleva a la oportunidad del CRM y a nada más', () => {
    assert.deepEqual(noticeTraceLink({ url: '/crm/oportunidades/l1', subject: 'Café Altura' }), { url: '/crm/oportunidades/l1', label: 'Café Altura' });
    assert.equal(noticeTraceLink({ url: 'https://otro.sitio' }), null);
    assert.equal(noticeTraceLink({}), null);
});

// Una base en memoria con avisos, oportunidades y la traza.
const fakeDb = ({ notices = [], leads = {} } = {}) => {
    const rows = notices.map((row) => ({ snoozedUntil: null, decidedAt: null, resolvedAt: null, resolution: null, notificationId: null, ...row }));
    const traces = [];
    const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
        if (value && typeof value === 'object' && 'not' in value) return row[key] !== value.not;
        return row[key] === value;
    });
    const db = {
        rows, traces,
        importantNotice: {
            findMany: async ({ where }) => rows.filter((row) => matches(row, where)),
            findFirst: async ({ where }) => rows.filter((row) => matches(row, where))[0] || null,
            update: async ({ where, data }) => Object.assign(rows.find((row) => row.id === where.id), data),
            updateMany: async () => ({ count: 0 })
        },
        crmLead: { findUnique: async ({ where }) => leads[where.id] || null },
        notification: { updateMany: async () => ({ count: 1 }) },
        operationalTraceEvent: {
            create: async ({ data }) => {
                if (data.id && traces.some((row) => row.id === data.id)) throw Object.assign(new Error('duplicado'), { code: 'P2002' });
                const row = { id: data.id || `t${traces.length + 1}`, ...data };
                traces.push(row);
                return row;
            }
        },
        $transaction: async (run) => run(db)
    };
    return db;
};
const lead = (patch = {}) => ({ company: 'Café Altura', contactName: 'Laura', stage: 'PROPUESTA_ENVIADA', archivedAt: null, activities: [], ...patch });
const notice = (patch = {}) => ({
    id: 'n1', userId: 'u-francys', kind: 'CRM_FOLLOW_UP', level: 'SEGUIMIENTO', subjectId: 'l1', label: 'Seguimiento comercial',
    message: 'Café Altura lleva 10 días sin responder la COT-0042', url: '/crm/oportunidades/l1', createdAt: at('2026-10-27T14:00:00Z'), ...patch
});

test('la banda reporta que mostró el aviso: una vez por aparición, de nuevo si vuelve tras posponerlo', async () => {
    const lines = [];
    const db = fakeDb({ notices: [notice()], leads: { l1: lead() } });
    const log = (line) => lines.push(line);
    assert.deepEqual(await markNoticeShown(db, 'n1', francys, { now: NOW, log }), { ok: true, recorded: true });
    assert.deepEqual(await markNoticeShown(db, 'n1', francys, { now: NOW, log }), { ok: true, recorded: false });
    assert.equal(db.traces.length, 1);
    const [shown] = db.traces;
    assert.equal(shown.eventType, NOTICE_TRACE_EVENTS.SHOWN);
    assert.deepEqual([shown.actorId, shown.subjectUserId], [null, 'u-francys']);
    assert.equal(shown.metadata.subject, 'Café Altura');
    assert.equal(shown.metadata.url, '/crm/oportunidades/l1');
    assert.deepEqual(lines, ['[Avisos importantes] Se le mostró a Francys Caballero en la banda: «Café Altura lleva 10 días sin responder la COT-0042».']);
    // Pospuesto y todavía sin volver: no se puede estar mostrando.
    db.rows[0].snoozedUntil = at('2026-10-27T16:00:00Z');
    await assert.rejects(markNoticeShown(db, 'n1', francys, { now: NOW, log }), { statusCode: 409 });
    // Cuando vuelve, es otra aparición.
    assert.equal((await markNoticeShown(db, 'n1', francys, { now: at('2026-10-27T16:01:00Z'), log })).recorded, true);
    assert.equal(db.traces.length, 2);
    // Un aviso de otra persona no se puede reportar.
    await assert.rejects(markNoticeShown(db, 'n1', { ...francys, userId: 'u-otro' }, { now: NOW, log }), { statusCode: 404 });
});

test('las tres decisiones quedan en la traza a nombre de quien decidió', async () => {
    const log = () => {};
    const crm = { addActivity: async () => ({}), changeStage: async () => ({}) };
    const follow = fakeDb({ notices: [notice()], leads: { l1: lead() } });
    await followUpNotice(follow, 'n1', { channel: 'LLAMADA' }, francys, { crm, now: NOW, log });
    assert.deepEqual(follow.traces.map((row) => [row.eventType, row.actorId, row.subjectUserId, row.metadata.channel, row.metadata.subject]),
        [[NOTICE_TRACE_EVENTS.FOLLOWED_UP, 'u-francys', 'u-francys', 'LLAMADA', 'Café Altura']]);

    const snooze = fakeDb({ notices: [notice()], leads: { l1: lead() } });
    await snoozeNotice(snooze, 'n1', { option: '1h' }, francys, { now: NOW, log });
    assert.deepEqual(snooze.traces.map((row) => [row.eventType, row.metadata.option, row.metadata.until]),
        [[NOTICE_TRACE_EVENTS.SNOOZED, '1h', '2026-10-27T16:00:00.000Z']]);

    const close = fakeDb({ notices: [notice({ kind: 'CRM_REVIEW', level: 'IMPORTANTE' })], leads: { l1: lead({ company: 'Centro Andino' }) } });
    await closeReviewNotice(close, 'n1', { outcome: 'DESCARTADO' }, francys, { crm, now: NOW, log });
    assert.deepEqual(close.traces.map((row) => [row.eventType, row.metadata.outcome, row.metadata.subject, row.metadata.kind]),
        [[NOTICE_TRACE_EVENTS.CLOSED, 'DESCARTADO', 'Centro Andino', 'CRM_REVIEW']]);
});

test('una decisión que no se pudo trazar sigue valiendo', async () => {
    const db = fakeDb({ notices: [notice()], leads: { l1: lead() } });
    db.operationalTraceEvent.create = async () => { throw new Error('traza caída'); };
    const originalError = console.error; console.error = () => {};
    try {
        assert.deepEqual(await followUpNotice(db, 'n1', { channel: 'CORREO' }, francys, { crm: { addActivity: async () => ({}) }, now: NOW, log: () => {} }), { ok: true });
    } finally { console.error = originalError; }
    assert.equal(db.rows[0].resolution, 'SEGUIMIENTO');
});

test('lo que sale solo de la banda dice por qué', async () => {
    const lines = [];
    const leads = {
        l1: lead({ activities: [{ id: 'a1' }] }),
        l2: lead({ company: 'Centro Andino', stage: 'GANADO' }),
        l3: lead({ company: 'Calzado Andino', archivedAt: NOW })
    };
    const db = fakeDb({ notices: [notice(), notice({ id: 'n2', subjectId: 'l2' }), notice({ id: 'n3', subjectId: 'l3' })], leads });
    await currentImportantNotice(db, 'u-francys', NOW, { who: 'Francys Caballero', log: (line) => lines.push(line) });
    assert.deepEqual(db.traces.map((row) => [row.eventType, row.actorId, row.metadata.subject, row.metadata.reason]), [
        [NOTICE_TRACE_EVENTS.CLEARED, null, 'Café Altura', 'GESTION'],
        [NOTICE_TRACE_EVENTS.CLEARED, null, 'Centro Andino', 'ETAPA'],
        [NOTICE_TRACE_EVENTS.CLEARED, null, 'Calzado Andino', 'INACTIVA']
    ]);
    assert.match(lines[1], /^\[Avisos importantes\] Salió de la banda de Francys Caballero el aviso de Centro Andino: la oportunidad ya no espera respuesta del cliente\.$/);
});

test('cada pase de las alertas deja una línea por persona en la traza y en los registros', async () => {
    const day = (iso) => new Date(`${iso}T15:00:00Z`);
    const crmLead = (patch = {}) => ({
        id: 'l1', company: 'Café Altura', contactName: 'Laura', stage: 'PROPUESTA_ENVIADA', proposalSentAt: day('2026-10-01'), archivedAt: null,
        owner: { userId: 'u-francys' }, activities: [], quotations: [{ consecutive: 42 }], followUpAlertLog: [], ...patch
    });
    const db = fakeDb();
    db.importantNotice.create = async ({ data }) => ({ id: `nn${data.subjectId}`, ...data });
    Object.assign(db, {
        crmSetting: { findUnique: async () => null },
        crmLead: { findMany: async () => [crmLead(), crmLead({ id: 'l2', company: 'Sin dueño', owner: null })] },
        crmFollowUpAlert: { create: async ({ data }) => data, createMany: async () => ({ count: 0 }) },
        user: {
            findMany: async () => [
                { id: 'u-francys', name: 'Francys Caballero', teamMember: { role: 'Comercial y Relaciones Públicas' } },
                { id: 'u-rodny', name: 'Rodny Chirinos', teamMember: { role: 'Project Manager' } }
            ]
        }
    });
    const lines = [];
    let bell = 0;
    const result = await runFollowUpAlerts(db, { now: day('2026-10-11'), notify: async () => ({ id: `bell-${++bell}` }), info: (line) => lines.push(line) });
    assert.equal(result.sent, 2);
    // Las dos son del equipo comercial, también la que no tiene responsable.
    assert.deepEqual(db.traces.map((row) => [row.eventType, row.subjectUserId, row.actorId, row.metadata.reminders, row.metadata.bell, row.metadata.band, row.metadata.subject]), [
        [NOTICE_TRACE_EVENTS.ALERTS_SENT, 'u-francys', null, 2, 2, 2, undefined]
    ]);
    assert.deepEqual(lines, [
        '[CRM] Alertas comerciales: 2 oportunidades avisadas.',
        '[CRM] Le llegaron a Francys Caballero 2 alertas comerciales (2 recordatorios): 2 avisos en la campana y 2 en la banda.'
    ]);
    // Un pase sin nada que avisar no escribe nada.
    lines.length = 0;
    db.crmLead.findMany = async () => [];
    await runFollowUpAlerts(db, { now: day('2026-10-11'), info: (line) => lines.push(line) });
    assert.deepEqual(lines, []);
});

test('la trazabilidad de Salud operativa muestra los eventos de la banda, con su frase y su enlace', async () => {
    const events = [
        { id: 'e1', eventType: NOTICE_TRACE_EVENTS.FOLLOWED_UP, actorId: 'u-francys', subjectUserId: 'u-francys', occurredAt: NOW,
            metadata: { subject: 'Café Altura', channel: 'WHATSAPP', url: '/crm/oportunidades/l1' }, actor: { name: 'Francys Caballero' }, subjectUser: { name: 'Francys Caballero' } },
        { id: 'e2', eventType: NOTICE_TRACE_EVENTS.SHOWN, actorId: null, subjectUserId: 'u-francys', occurredAt: NOW,
            metadata: { message: 'Café Altura lleva 10 días sin responder', url: '/crm/oportunidades/l1', subject: 'Café Altura' }, actor: null, subjectUser: { name: 'Francys Caballero' } }
    ];
    let where = null;
    const db = {
        user: { findMany: async () => [] },
        task: { findMany: async () => [] },
        operationalTraceEvent: { findMany: async (args) => { where = args.where; return events; } }
    };
    const trace = await getOperationalTrace({ requester: { role: 'ADMIN' }, now: NOW, db });
    assert.deepEqual(trace.timeline.map((event) => [event.displayLabel, event.description, event.link?.url]), [
        ['Ya hice seguimiento', 'Francys Caballero registró un seguimiento por WhatsApp desde el aviso de Café Altura.', '/crm/oportunidades/l1'],
        ['Aviso en la banda', 'Se le mostró a Francys Caballero en la banda: «Café Altura lleva 10 días sin responder».', '/crm/oportunidades/l1']
    ]);
    // El filtro de la base los deja pasar antes del límite.
    assert.match(JSON.stringify(where), /IMPORTANT_NOTICE_SHOWN/);
    assert.match(JSON.stringify(where), /CRM_FOLLOW_UP_ALERTS_SENT/);
});

test('las rutas de la banda no se registran además como un cambio genérico', () => {
    assert.equal(isInternalTraceRequest('/api/important-notices/n1/shown'), true);
    assert.equal(isInternalTraceRequest('/api/important-notices/n1/follow-up'), true);
});

test('la banda avisa al servidor cuando el aviso de verdad está a la vista', () => {
    const band = readFileSync(new URL('../src/components/notifications/ImportantNoticeBand.jsx', import.meta.url), 'utf8');
    assert.match(band, /post\(`\$\{notice\.id\}\/shown`\)/);
    assert.match(band, /document\.visibilityState !== 'visible'/);
    assert.match(band, /addEventListener\('visibilitychange'/);
    const panel = readFileSync(new URL('../src/components/modules/OperationalTracePanel.jsx', import.meta.url), 'utf8');
    assert.match(panel, /event\.link/);
    for (const type of Object.values(NOTICE_TRACE_EVENTS)) assert.match(panel, new RegExp(type));
    assert.doesNotMatch(panel, /violet-|fuchsia-|emerald-/, 'al tocar la pantalla, la paleta heredada pasa a la oficial');
});
