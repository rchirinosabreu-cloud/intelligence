import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    closeReviewNotice, currentImportantNotice, followUpNotice, queueImportantNotice, reassignCrmNotices, snoozeNotice
} from '../src/services/importantNoticeService.js';
import { runFollowUpAlerts } from '../src/services/crmFollowUpAlertService.js';

// Avisos importantes (Rodny, 26 de octubre de 2026): «Ya hice seguimiento» registra la gestión en el CRM y reinicia la
// cuenta; «Recordarme» lo pospone; en la revisión de los 30 días, «No sigue» la cierra como perdida o descartada. Un aviso
// que ya se atendió por otro lado no se queda en la banda.

const at = (iso) => new Date(iso);
const NOW = at('2026-10-26T15:00:00Z');
const crmUser = { userId: 'u-francys', role: 'EDITOR', modulePermissions: { crm: true } };

const fakeDb = ({ notices = [], leads = {} } = {}) => {
    const rows = notices.map((row) => ({ snoozedUntil: null, decidedAt: null, resolvedAt: null, resolution: null, notificationId: null, ...row }));
    const readNotifications = [];
    const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
        if (value && typeof value === 'object' && 'not' in value) return row[key] !== value.not;
        return row[key] === value;
    });
    const db = {
        rows,
        readNotifications,
        importantNotice: {
            findMany: async ({ where }) => rows.filter((row) => matches(row, where)),
            findFirst: async ({ where, orderBy }) => {
                const found = rows.filter((row) => matches(row, where));
                if (orderBy?.decidedAt) found.sort((a, b) => b.decidedAt - a.decidedAt);
                return found[0] || null;
            },
            create: async ({ data }) => { const row = { id: `n${rows.length + 1}`, snoozedUntil: null, decidedAt: null, resolvedAt: null, resolution: null, createdAt: NOW, ...data }; rows.push(row); return row; },
            update: async ({ where, data }) => Object.assign(rows.find((row) => row.id === where.id), data),
            updateMany: async ({ where, data }) => { const hit = rows.filter((row) => matches(row, where)); hit.forEach((row) => Object.assign(row, data)); return { count: hit.length }; }
        },
        crmLead: { findUnique: async ({ where }) => leads[where.id] || null },
        notification: { updateMany: async ({ where }) => { readNotifications.push(where.id); return { count: 1 }; } },
        $transaction: async (run) => run(db)
    };
    return db;
};
const waitingLead = { stage: 'PROPUESTA_ENVIADA', archivedAt: null, activities: [] };
const notice = (patch = {}) => ({
    id: 'n1', userId: 'u-francys', kind: 'CRM_FOLLOW_UP', level: 'SEGUIMIENTO', subjectId: 'l1', label: 'Seguimiento comercial',
    message: 'Café Altura lleva 10 días sin responder la COT-0042', url: '/crm/oportunidades/l1', createdAt: at('2026-10-26T14:00:00Z'), ...patch
});

test('la banda muestra el aviso que toca, con su nivel y su texto, y nada de otra persona', async () => {
    const db = fakeDb({ notices: [notice(), notice({ id: 'ajeno', userId: 'u-otro' })], leads: { l1: waitingLead } });
    const { notice: current } = await currentImportantNotice(db, 'u-francys', NOW);
    assert.deepEqual(current, {
        id: 'n1', kind: 'CRM_FOLLOW_UP', level: 'SEGUIMIENTO', label: 'Seguimiento comercial',
        message: 'Café Altura lleva 10 días sin responder la COT-0042', url: '/crm/oportunidades/l1'
    });
});

test('un aviso que ya se atendió por otro lado sale de la banda sin contar como decisión', async () => {
    const leads = {
        l1: { ...waitingLead, activities: [{ id: 'a1' }] },                 // alguien registró una gestión después del aviso
        l2: { ...waitingLead, stage: 'GANADO' },                            // ya no se espera al cliente
        l3: waitingLead
    };
    const db = fakeDb({ notices: [notice(), notice({ id: 'n2', subjectId: 'l2' }), notice({ id: 'n3', subjectId: 'l3', createdAt: at('2026-10-26T14:30:00Z') })], leads });
    const { notice: current } = await currentImportantNotice(db, 'u-francys', NOW);
    assert.equal(current.id, 'n3');
    assert.deepEqual(db.rows.filter((row) => row.resolution === 'YA_ATENDIDO').map((row) => [row.id, row.decidedAt]), [['n1', null], ['n2', null]]);
});

test('«Ya hice seguimiento» registra la gestión en el CRM, cierra el aviso y su notificación de la campana', async () => {
    const db = fakeDb({ notices: [notice({ notificationId: 'bell-1' })], leads: { l1: waitingLead } });
    const calls = [];
    const crm = { addActivity: async (...args) => { calls.push(args); return {}; } };
    await followUpNotice(db, 'n1', { channel: 'WHATSAPP' }, crmUser, { crm, now: NOW });
    assert.equal(calls.length, 1);
    const [, leadId, payload, actor] = calls[0];
    assert.equal(leadId, 'l1');
    assert.deepEqual(payload, { type: 'WHATSAPP', note: 'Registrado desde el aviso de seguimiento.', requestId: 'aviso-n1' });
    assert.equal(actor, crmUser);
    assert.deepEqual([db.rows[0].resolution, db.rows[0].decidedAt, db.rows[0].resolvedAt], ['SEGUIMIENTO', NOW, NOW]);
    assert.deepEqual(db.readNotifications, ['bell-1']);
    // Y el siguiente espera cinco minutos.
    db.rows.push({ ...notice({ id: 'n2', subjectId: 'l1' }), snoozedUntil: null, decidedAt: null, resolvedAt: null });
    const next = await currentImportantNotice(db, 'u-francys', at('2026-10-26T15:02:00Z'));
    assert.equal(next.notice, null);
    assert.equal(next.nextAt.toISOString(), '2026-10-26T15:05:00.000Z');
});

test('el seguimiento solo admite las opciones de la banda y pide el permiso del CRM', async () => {
    const crm = { addActivity: async () => ({}) };
    await assert.rejects(followUpNotice(fakeDb({ notices: [notice()] }), 'n1', { channel: 'NOTA' }, crmUser, { crm, now: NOW }), { statusCode: 400 });
    await assert.rejects(followUpNotice(fakeDb({ notices: [notice()] }), 'n1', { channel: 'LLAMADA' }, { userId: 'u-francys', role: 'EDITOR', modulePermissions: {} }, { crm, now: NOW }), { statusCode: 403 });
    await assert.rejects(followUpNotice(fakeDb({ notices: [notice()] }), 'n1', { channel: 'LLAMADA' }, { ...crmUser, userId: 'u-otro' }, { crm, now: NOW }), { statusCode: 404 });
    await assert.rejects(followUpNotice(fakeDb({ notices: [notice({ resolvedAt: NOW })] }), 'n1', { channel: 'LLAMADA' }, crmUser, { crm, now: NOW }), { statusCode: 409 });
});

test('«Recordarme» lo pospone sin cerrarlo, y vuelve a su hora', async () => {
    const db = fakeDb({ notices: [notice()], leads: { l1: waitingLead } });
    await snoozeNotice(db, 'n1', { option: '1h' }, crmUser, { now: NOW });
    assert.deepEqual([db.rows[0].snoozedUntil.toISOString(), db.rows[0].resolvedAt, db.rows[0].decidedAt], ['2026-10-26T16:00:00.000Z', null, NOW]);
    assert.equal((await currentImportantNotice(db, 'u-francys', at('2026-10-26T15:30:00Z'))).notice, null);
    assert.equal((await currentImportantNotice(db, 'u-francys', at('2026-10-26T16:00:00Z'))).notice.id, 'n1');
    await assert.rejects(snoozeNotice(db, 'n1', { option: 'para siempre' }, crmUser, { now: NOW }), { statusCode: 400 });
});

test('«No sigue» solo existe en la revisión y cierra la oportunidad como perdida o descartada', async () => {
    const calls = [];
    const crm = { changeStage: async (...args) => { calls.push(args); return {}; } };
    const review = () => fakeDb({ notices: [notice({ kind: 'CRM_REVIEW', level: 'IMPORTANTE' })] });
    await assert.rejects(closeReviewNotice(fakeDb({ notices: [notice()] }), 'n1', { outcome: 'PERDIDO' }, crmUser, { crm, now: NOW }), { statusCode: 409 });
    await assert.rejects(closeReviewNotice(review(), 'n1', { outcome: 'GANADO' }, crmUser, { crm, now: NOW }), { statusCode: 400 });
    // Perdida: el cliente no la tomó, con el motivo que el CRM exige para Perdido.
    const lost = review();
    await closeReviewNotice(lost, 'n1', { outcome: 'PERDIDO' }, crmUser, { crm, now: NOW });
    assert.deepEqual(calls[0].slice(1, 3), ['l1', { stage: 'PERDIDO', lostReason: 'Sin respuesta del cliente.' }]);
    assert.equal(lost.rows[0].resolution, 'PERDIDA');
    // Descartada: no sigue por decisión nuestra, con la nota de por qué.
    const discarded = review();
    await closeReviewNotice(discarded, 'n1', { outcome: 'DESCARTADO' }, crmUser, { crm, now: NOW });
    assert.deepEqual(calls[1].slice(1, 3), ['l1', { stage: 'DESCARTADO', note: 'Descartada desde el aviso de revisión: sin respuesta del cliente.' }]);
    assert.equal(discarded.rows[0].resolution, 'DESCARTADA');
});

test('un aviso nuevo de la misma oportunidad reemplaza al que seguía abierto', async () => {
    const db = fakeDb({ notices: [notice()] });
    await queueImportantNotice(db, { userId: 'u-francys', kind: 'CRM_REVIEW', level: 'IMPORTANTE', subjectId: 'l1', label: 'Revisión · 30 días', message: 'x', url: '/crm/oportunidades/l1' }, NOW);
    assert.deepEqual(db.rows.map((row) => [row.id, row.resolution]), [['n1', 'REEMPLAZADO'], ['n2', null]]);
});

// Rodny, 28 de octubre de 2026: «la alerta del CRM solo debe aparecerle a Francys o a quien tenga rol textual de
// Comercial, Relaciones Públicas o Comercial y Relaciones Públicas». La banda de quien no es comercial no muestra avisos
// del CRM, y lo que la dirección tenía abierto pasa al equipo comercial en el siguiente pase.
const commercialTeam = [
    { id: 'u-francys', name: 'Francys Caballero', teamMember: { role: 'Comercial y Relaciones Públicas' } },
    { id: 'u-rodny', name: 'Rodny Chirinos', teamMember: { role: 'Project Manager' } }
];

test('a quien no es comercial la banda no le muestra avisos del CRM', async () => {
    const db = fakeDb({ notices: [notice({ userId: 'u-rodny' })], leads: { l1: waitingLead } });
    db.teamMember = { findFirst: async ({ where }) => ({ role: commercialTeam.find((user) => user.id === where.userId)?.teamMember.role }) };
    assert.deepEqual(await currentImportantNotice(db, 'u-rodny', NOW), { notice: null, nextAt: null });
    assert.equal(db.rows[0].resolvedAt, null, 'no lo cierra: lo pasa el reloj al equipo comercial');
    db.rows[0].userId = 'u-francys';
    assert.equal((await currentImportantNotice(db, 'u-francys', NOW)).notice.id, 'n1');
});

test('lo que la dirección tenía abierto pasa al equipo comercial, sin repetirlo y diciendo por qué', async () => {
    const leads = {
        l1: { ...waitingLead, company: 'ARISTEA', owner: null },
        l2: { ...waitingLead, company: 'Café Altura', owner: { userId: 'u-francys' } }
    };
    const db = fakeDb({
        notices: [
            notice({ id: 'n1', userId: 'u-rodny', subjectId: 'l1', snoozedUntil: at('2026-10-26T16:00:00Z') }),
            notice({ id: 'n2', userId: 'u-rodny', subjectId: 'l2' }),
            notice({ id: 'n3', userId: 'u-francys', subjectId: 'l2' })
        ],
        leads
    });
    const traces = [];
    db.operationalTraceEvent = { create: async ({ data }) => { traces.push(data); return data; } };
    const moved = await reassignCrmNotices(db, { commercialIds: ['u-francys'], now: NOW, log: () => {} });
    assert.equal(moved, 2);
    assert.deepEqual(db.rows.filter((row) => row.userId === 'u-rodny').map((row) => [row.id, row.resolution]), [['n1', 'REASIGNADO'], ['n2', 'REASIGNADO']]);
    // ARISTEA le llega a Francys con su texto y su pausa; Café Altura ya lo tenía, no se duplica.
    const francys = db.rows.filter((row) => row.userId === 'u-francys' && !row.resolvedAt);
    assert.deepEqual(francys.map((row) => [row.subjectId, row.message]), [['l2', notice().message], ['l1', notice().message]]);
    assert.equal(francys[1].snoozedUntil.toISOString(), '2026-10-26T16:00:00.000Z');
    assert.deepEqual(traces.map((row) => [row.eventType, row.subjectUserId, row.metadata.reason]), [
        ['IMPORTANT_NOTICE_CLEARED', 'u-rodny', 'REASIGNADO'], ['IMPORTANT_NOTICE_CLEARED', 'u-rodny', 'REASIGNADO']
    ]);
    // Sin nadie comercial no se mueve nada: no se pierde el aviso.
    const lonely = fakeDb({ notices: [notice({ userId: 'u-rodny' })], leads });
    assert.equal(await reassignCrmNotices(lonely, { commercialIds: [], now: NOW, log: () => {} }), 0);
    assert.equal(lonely.rows[0].resolvedAt, null);
});

test('el reloj de alertas deja el aviso en la banda del responsable, ligado a su notificación de la campana', async () => {
    const day = (iso) => new Date(`${iso}T15:00:00Z`);
    const lead = (patch = {}) => ({
        id: 'l1', company: 'Café Altura', contactName: 'Laura', stage: 'PROPUESTA_ENVIADA', proposalSentAt: day('2026-10-01'), archivedAt: null,
        owner: { userId: 'u-francys' }, activities: [], quotations: [{ consecutive: 42 }], followUpAlertLog: [], ...patch
    });
    const db = fakeDb();
    Object.assign(db, {
        crmSetting: { findUnique: async () => null },
        crmLead: { findMany: async () => [lead(), lead({ id: 'l2', company: 'Sin dueño', owner: null })] },
        crmFollowUpAlert: { create: async ({ data }) => data, createMany: async () => ({ count: 0 }) },
        user: { findMany: async () => commercialTeam }
    });
    let bell = 0;
    await runFollowUpAlerts(db, { now: day('2026-10-11'), notify: async () => ({ id: `bell-${++bell}` }), info: () => {} });
    // La oportunidad sin responsable también es del equipo comercial, nunca de la dirección.
    assert.deepEqual(db.rows.map((row) => [row.userId, row.subjectId, row.kind, row.level, row.notificationId, row.message]), [
        ['u-francys', 'l1', 'CRM_FOLLOW_UP', 'SEGUIMIENTO', 'bell-1', 'Café Altura lleva 10 días sin responder la COT-0042'],
        ['u-francys', 'l2', 'CRM_FOLLOW_UP', 'SEGUIMIENTO', 'bell-2', 'Sin dueño lleva 10 días sin responder la COT-0042']
    ]);
});

test('la tabla se crea al arrancar, sin tocar nada de lo que ya existe', () => {
    const ensure = fs.readFileSync(new URL('../scripts/ensure-important-notices-schema.js', import.meta.url), 'utf8');
    assert.match(ensure, /CREATE TABLE IF NOT EXISTS "ImportantNotice"/);
    assert.doesNotMatch(ensure, /DROP |TRUNCATE|DELETE FROM/);
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.match(pkg.scripts.start, /ensure-important-notices-schema\.js/);
});
