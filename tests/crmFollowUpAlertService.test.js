import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFollowUpAlertDays, runFollowUpAlerts, saveFollowUpAlertDays } from '../src/services/crmFollowUpAlertService.js';
import { listLeads } from '../src/services/crmService.js';

// Punto 2 de la solicitud de Elisa: los recordatorios al responsable y la revisión a los 30 días, que les llega
// también a los administradores (Rodny, 26 de octubre de 2026).

const day = (iso) => new Date(`${iso}T15:00:00Z`);
const lead = (patch = {}) => ({
    id: 'l1', company: 'Café Altura', contactName: 'Laura', stage: 'PROPUESTA_ENVIADA', proposalSentAt: day('2026-10-01'), archivedAt: null,
    owner: { userId: 'u-francys' }, activities: [], quotations: [{ consecutive: 42 }], followUpAlertLog: [], ...patch
});

const fakeDb = ({ leads = [lead()], settings = null, taken = new Set() } = {}) => {
    const created = [];
    const db = {
        created,
        crmSetting: {
            findUnique: async () => settings,
            upsert: async ({ create, update }) => ({ id: 'global', ...(settings ? update : create) })
        },
        crmLead: { findMany: async () => leads },
        crmFollowUpAlert: {
            create: async ({ data }) => {
                const key = `${data.leadId}|${data.cycleStart.toISOString()}|${data.step}`;
                if (taken.has(key)) throw Object.assign(new Error('duplicada'), { code: 'P2002' });
                taken.add(key);
                created.push(data);
                return data;
            },
            createMany: async ({ data }) => { created.push(...data.map((item) => ({ ...item, skipped: true }))); return { count: data.length }; }
        },
        user: { findMany: async () => [{ id: 'u-rodny' }, { id: 'u-elisa' }] }
    };
    return db;
};

test('el recordatorio le llega al responsable, con quién, cuántos días y qué cotización', async () => {
    const db = fakeDb();
    const sent = [];
    const result = await runFollowUpAlerts(db, { now: day('2026-10-11'), notify: async (data) => sent.push(data) });
    assert.deepEqual(result, { checked: 1, sent: 1 });
    assert.deepEqual(sent, [{
        userId: 'u-francys', type: 'CRM_FOLLOW_UP_REMINDER', relatedId: 'l1', url: '/crm/oportunidades/l1',
        message: 'Café Altura lleva 10 días sin responder la COT-0042. Haz seguimiento.'
    }]);
    // Se anotó el paso del día 10 y, como el reloj no avisó el del 5, ese queda cubierto sin mandarse.
    assert.deepEqual(db.created.map((row) => [row.step, Boolean(row.skipped)]), [[10, false], [5, true]]);
});

test('la revisión de los 30 días también les llega a los administradores', async () => {
    const sent = [];
    await runFollowUpAlerts(fakeDb(), { now: day('2026-10-31'), notify: async (data) => sent.push(data) });
    assert.deepEqual(sent.map((item) => [item.userId, item.type]), [
        ['u-francys', 'CRM_FOLLOW_UP_REVIEW'], ['u-rodny', 'CRM_FOLLOW_UP_REVIEW'], ['u-elisa', 'CRM_FOLLOW_UP_REVIEW']
    ]);
    assert.match(sent[0].message, /revisa si sigue o se cierra/);
});

test('una oportunidad sin responsable no se queda sin aviso: va a los administradores', async () => {
    const sent = [];
    await runFollowUpAlerts(fakeDb({ leads: [lead({ owner: null })] }), { now: day('2026-10-06'), notify: async (data) => sent.push(data) });
    assert.deepEqual(sent.map((item) => item.userId), ['u-rodny', 'u-elisa']);
});

test('nada se repite: un paso ya anotado no se vuelve a avisar, aunque el reloj corra dos veces', async () => {
    const taken = new Set([`l1|${day('2026-10-01').toISOString()}|10`]);
    const sent = [];
    const result = await runFollowUpAlerts(fakeDb({ taken }), { now: day('2026-10-11'), notify: async (data) => sent.push(data) });
    assert.deepEqual(result, { checked: 1, sent: 0 });
    assert.equal(sent.length, 0);
    // Y si el historial ya lo tiene, ni siquiera se intenta.
    const logged = lead({ followUpAlertLog: [{ cycleStart: day('2026-10-01'), step: 10 }, { cycleStart: day('2026-10-01'), step: 5 }] });
    const again = await runFollowUpAlerts(fakeDb({ leads: [logged] }), { now: day('2026-10-12'), notify: async (data) => sent.push(data) });
    assert.deepEqual(again, { checked: 1, sent: 0 });
});

test('un aviso que no sale no frena a los demás', async () => {
    const db = fakeDb({ leads: [lead(), lead({ id: 'l2', company: 'Nautical Eventos' })] });
    const sent = [];
    const result = await runFollowUpAlerts(db, {
        now: day('2026-10-11'),
        notify: async (data) => { if (data.relatedId === 'l1') throw new Error('push caído'); sent.push(data); },
        log: () => {}
    });
    assert.equal(result.sent, 2);
    assert.deepEqual(sent.map((item) => item.relatedId), ['l2']);
});

test('los días: los del documento hasta que un administrador los cambie, validados en el servidor', async () => {
    assert.deepEqual(await readFollowUpAlertDays(fakeDb()), { reminders: [5, 10, 15, 20], review: 30 });
    assert.deepEqual(await readFollowUpAlertDays(fakeDb({ settings: { followUpReminderDays: [3, 7], followUpReviewDay: 14 } })), { reminders: [3, 7], review: 14 });
    assert.deepEqual(await readFollowUpAlertDays({}), { reminders: [5, 10, 15, 20], review: 30 }, 'sin la tabla todavía, los del documento');
    await assert.rejects(saveFollowUpAlertDays(fakeDb(), { reminders: [5], review: 30 }, { role: 'EDITOR' }), { statusCode: 403 });
    await assert.rejects(saveFollowUpAlertDays(fakeDb(), { reminders: [40], review: 30 }, { role: 'ADMIN', id: 'u' }), { statusCode: 400 });
    assert.deepEqual(await saveFollowUpAlertDays(fakeDb(), { reminders: [7, 3], review: 14 }, { role: 'ADMIN', id: 'u' }), { reminders: [3, 7], review: 14 });
});

test('la lista del CRM dice los días sin respuesta y filtra desde el primer recordatorio o en revisión', async () => {
    const raw = (id, sent, patch = {}) => ({
        id, consecutive: 1, origin: 'OTRO', stage: 'PROPUESTA_ENVIADA', priority: 'MEDIA', enteredAt: day('2026-09-01'), company: id,
        proposalSentAt: day(sent), activities: [], quotations: [], archivedAt: null, ...patch
    });
    const db = { crmLead: { findMany: async () => [raw('fresco', '2026-10-24'), raw('frio', '2026-10-15'), raw('helado', '2026-09-20'), raw('ganado', '2026-09-01', { stage: 'GANADO' })] } };
    const now = day('2026-10-26');
    const all = await listLeads(db, {}, now);
    assert.deepEqual(Object.fromEntries(all.items.map((item) => [item.id, item.silentDays])), { fresco: 2, frio: 11, helado: 36, ganado: null });
    assert.deepEqual(all.alertDays, { reminders: [5, 10, 15, 20], review: 30 });
    assert.deepEqual((await listLeads(db, { silence: 'SIN_RESPUESTA' }, now)).items.map((item) => item.id).sort(), ['frio', 'helado']);
    assert.deepEqual((await listLeads(db, { silence: 'REVISION' }, now)).items.map((item) => item.id), ['helado']);
});

test('las alertas van por la campana y el celular, y el reloj vive en el servidor en horario hábil', () => {
    const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    assert.match(server, /initCrmFollowUpAlertScheduler\(\)/);
    const source = fs.readFileSync(new URL('../src/services/crmFollowUpAlertService.js', import.meta.url), 'utf8');
    assert.match(source, /isWorkingTime\(now\)/);
    const ensure = fs.readFileSync(new URL('../scripts/ensure-crm-schema.js', import.meta.url), 'utf8');
    assert.match(ensure, /CREATE TABLE IF NOT EXISTS "CrmFollowUpAlert"/);
    assert.match(ensure, /UNIQUE\("leadId", "cycleStart", step\)/);
    assert.match(ensure, /CREATE TABLE IF NOT EXISTS "CrmSetting"/);
});
