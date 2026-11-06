import test from 'node:test';
import assert from 'node:assert/strict';
import { adBudgetService } from '../src/services/adBudgetService.js';
import { adNoticeStillNeeded, runAdBudgetAlerts } from '../src/services/adBudgetNoticeService.js';
import { adNoticePlan, adNoticesFor, parseAdSubject } from '../src/lib/adBudgetNotices.js';
import { createAdBudgetsDb } from './fixtures/adBudgetsMemoryDb.js';

const at = (day, hour = 15) => new Date(`${day}T${hour}:00:00Z`);
const actor = { userId: 'u-keila' };
const keila = { id: 'm-keila', name: 'Keila', role: 'Pauta', areas: ['PAUTA'], userId: 'u-keila', isActive: true };
const camila = { id: 'm-camila', name: 'Camila', role: 'Project Manager', areas: ['PROJECT_MANAGEMENT'], userId: 'u-camila', isActive: true };
const users = [
    { id: 'u-keila', name: 'Keila', role: 'EDITOR', isActive: true, modulePermissions: { pautas: true } },
    { id: 'u-camila', name: 'Camila', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { manager: true } }
];
const clients = [
    { id: 'c-endova', name: 'Promo Group', slug: 'promo-group', isArchived: false, projectManagerId: 'm-camila', contracts: [{ startDate: '2026-01-15', cutDay: 15 }] },
    { id: 'c-pueblito', name: 'New Pueblito', slug: 'new-pueblito', isArchived: false, projectManagerId: 'm-camila', contracts: [{ startDate: '2026-01-01', cutDay: 1 }] },
    { id: 'c-archivado', name: 'Antiguo', slug: 'antiguo', isArchived: true, contracts: [] }
];
const newDb = (extra = {}) => createAdBudgetsDb({ clients, team: [keila, camila], users, ...extra });
const endova = { id: 'b-endova', clientId: 'c-endova', brand: 'Endova', amount: 300000, responsibleId: 'm-keila', createdAt: at('2026-10-20') };
const service = (db, day = '2026-11-06') => adBudgetService(db, { clock: () => at(day) });
const baseInput = { clientId: 'c-pueblito', platform: 'META', kind: 'MENSUAL', currency: 'COP', amount: '300000', responsibleId: 'm-keila', payer: 'TARJETA_BRAIN' };

test('crear una pauta toma el ciclo del contrato del cliente', async () => {
    const db = newDb();
    const saved = await service(db).create({ ...baseInput, clientId: 'c-endova', brand: 'Endova' }, actor);
    assert.equal(saved.cycle.start, '2026-10-15');
    assert.equal(saved.cycle.end, '2026-11-14');
    assert.equal(saved.cutFromContract, true);
    assert.equal(saved.evaluation.availableCents, 30_000_000);
    assert.equal(saved.responsible.name, 'Keila');
});

test('no se crea una pauta incompleta ni de un cliente archivado, y el motivo llega en palabras', async () => {
    const db = newDb();
    await assert.rejects(service(db).create({ ...baseInput, amount: '' }, actor), (error) => error.statusCode === 422 && /presupuesto/.test(error.message));
    await assert.rejects(service(db).create({ ...baseInput, clientId: 'c-archivado' }, actor), /no está activo/);
    await assert.rejects(service(db).create({ ...baseInput, responsibleId: 'nadie' }, actor), /Equipo/);
    assert.equal(db.store.budgets.length, 0);
});

test('una lectura guarda quién y cuándo, y deja el historial completo', async () => {
    const db = newDb({ budgets: [endova] });
    await service(db).recordSpend('b-endova', { spent: '50000', readOn: '2026-11-02' }, actor);
    const after = await service(db).recordSpend('b-endova', { spent: '91000', readOn: '2026-11-06', note: 'Pauta de convocatorias' }, actor);
    assert.equal(after.evaluation.spentCents, 9_100_000);
    assert.equal(after.evaluation.asOf, '2026-11-06');
    assert.equal(db.store.readings.length, 2);
    assert.equal(db.store.readings[1].recordedById, 'u-keila');
    assert.equal(db.store.cycles.length, 1, 'un ciclo, dos lecturas');
});

test('una fecha futura no vale: la lectura dice lo que ya pasó', async () => {
    const db = newDb({ budgets: [endova] });
    await assert.rejects(service(db).recordSpend('b-endova', { spent: '1', readOn: '2026-11-07' }, actor), /futura/);
});

test('el gasto final cierra el ciclo y su saldo pasa al siguiente', async () => {
    const db = newDb({ budgets: [{ ...endova, clientId: 'c-pueblito', id: 'b-p' }] });
    await service(db, '2026-11-02').recordSpend('b-p', { spent: '60000', readOn: '2026-10-31', final: true, cycleKey: '2026-10' }, actor);
    const { budgets } = await service(db).list();
    assert.equal(budgets[0].cycle.key, '2026-11');
    assert.equal(budgets[0].evaluation.carryCents, 24_000_000, 'New Pueblito trae lo que no se gastó en octubre');
    assert.equal(budgets[0].evaluation.availableCents, 54_000_000);
    assert.equal(budgets[0].pendingClose, null);
});

test('mientras falte el gasto final del ciclo anterior se pide y el saldo queda provisional', async () => {
    const db = newDb({ budgets: [{ ...endova, clientId: 'c-pueblito', id: 'b-p' }] });
    await service(db, '2026-10-20').recordSpend('b-p', { spent: '60000', readOn: '2026-10-20' }, actor);
    const { budgets } = await service(db).list();
    assert.equal(budgets[0].pendingClose.cycle.key, '2026-10');
    assert.equal(budgets[0].evaluation.carryFinal, false);
    assert.match(adNoticesFor(budgets[0])[0].message, /gasto final de octubre/);
});

test('una pauta nueva no debe el cierre de un mes en el que no existía', async () => {
    const db = newDb();
    const saved = await adBudgetService(db, { clock: () => at('2026-11-06') }).create(baseInput, actor);
    assert.equal(saved.pendingClose, null);
});

test('una lectura sin marcar reabre el ciclo, para poder corregir', async () => {
    const db = newDb({ budgets: [endova] });
    await service(db).recordSpend('b-endova', { spent: '300000', readOn: '2026-11-06', final: true }, actor);
    assert.ok(db.store.cycles[0].closedAt);
    await service(db).recordSpend('b-endova', { spent: '290000', readOn: '2026-11-06' }, actor);
    assert.equal(db.store.cycles[0].closedAt, null);
});

test('cambiar el presupuesto aplica al ciclo abierto y respeta los meses pasados', async () => {
    const db = newDb({
        budgets: [endova],
        cycles: [
            { id: 'old', budgetId: 'b-endova', cycleKey: '2026-09', amount: 200000, spent: 200000, closedAt: at('2026-10-15') },
            { id: 'now', budgetId: 'b-endova', cycleKey: '2026-10', amount: 300000, spent: 91000, spentAsOf: '2026-11-06', closedAt: null }
        ]
    });
    await service(db).update('b-endova', { ...baseInput, clientId: 'c-endova', amount: '400000' }, actor);
    assert.equal(db.store.cycles.find((row) => row.id === 'now').amount, 400000);
    assert.equal(db.store.cycles.find((row) => row.id === 'old').amount, 200000);
});

test('corregir un dato conserva los demás y deja qué decía antes', async () => {
    const db = newDb({ budgets: [{ ...endova, objective: 'Interacción', platform: 'META', kind: 'MENSUAL', currency: 'COP', payer: 'POR_DEFINIR' }] });
    const saved = await service(db).update('b-endova', { amount: '350000' }, actor);
    assert.equal(saved.amount, 350000);
    assert.equal(saved.objective, 'Interacción');
    assert.equal(db.store.events[0].summary, 'Cambió el presupuesto');
    assert.deepEqual(db.store.events[0].before, { amount: 300000 });
});

test('se corrige todo, incluso la moneda y el cliente de una pauta con gasto registrado', async () => {
    const db = newDb({ budgets: [endova] });
    await service(db).recordSpend('b-endova', { spent: '100', readOn: '2026-11-06' }, actor);
    const usd = await service(db).update('b-endova', { currency: 'USD', amount: '100' }, actor);
    assert.equal(usd.currency, 'USD');
    const moved = await service(db).update('b-endova', { clientId: 'c-pueblito' }, actor);
    assert.equal(moved.client.name, 'New Pueblito');
    await assert.rejects(service(db).update('b-endova', { clientId: 'c-archivado' }, actor), /no está activo/);
});

test('una lectura mal escrita se corrige y el ciclo se recalcula', async () => {
    const db = newDb({ budgets: [endova] });
    await service(db).recordSpend('b-endova', { spent: '91000', readOn: '2026-11-06' }, actor);
    const [reading] = db.store.readings;
    const after = await service(db).updateReading('b-endova', reading.id, { spent: '19000' }, actor);
    assert.equal(after.evaluation.spentCents, 1_900_000);
    assert.match(db.store.events[0].summary, /de \$ 91\.000 a \$ 19\.000/);
    await assert.rejects(service(db).updateReading('otra', reading.id, { spent: '1' }, actor), (error) => error.statusCode === 404);
});

test('eliminar una lectura la deshace: vuelve la anterior, y sin lecturas no hay gasto', async () => {
    const db = newDb({ budgets: [endova] });
    await service(db).recordSpend('b-endova', { spent: '50000', readOn: '2026-11-02' }, actor);
    await service(db).recordSpend('b-endova', { spent: '91000', readOn: '2026-11-06' }, actor);
    const newest = db.store.readings.find((row) => row.readOn === '2026-11-06');
    const undone = await service(db).deleteReading('b-endova', newest.id, actor);
    assert.equal(undone.evaluation.spentCents, 5_000_000);
    assert.equal(undone.evaluation.asOf, '2026-11-02');
    const empty = await service(db).deleteReading('b-endova', db.store.readings[0].id, actor);
    assert.equal(empty.evaluation.hasReading, false);
    assert.equal(db.store.events.length, 2, 'cada lectura eliminada deja constancia');
});

test('una lectura con fecha vieja no pisa la cifra vigente', async () => {
    const db = newDb({ budgets: [endova] });
    await service(db).recordSpend('b-endova', { spent: '91000', readOn: '2026-11-06' }, actor);
    const after = await service(db).recordSpend('b-endova', { spent: '20000', readOn: '2026-10-25' }, actor);
    assert.equal(after.evaluation.spentCents, 9_100_000);
});

test('un cierre se deshace, y el saldo que pasaba vuelve a ser provisional', async () => {
    const db = newDb({ budgets: [{ ...endova, clientId: 'c-pueblito', id: 'b-p' }] });
    await service(db, '2026-11-02').recordSpend('b-p', { spent: '60000', readOn: '2026-10-31', final: true, cycleKey: '2026-10' }, actor);
    await service(db).reopenCycle('b-p', '2026-10', actor);
    assert.equal(db.store.cycles[0].closedAt, null);
    assert.equal(db.store.cycles[0].spent, 60000, 'reabrir no borra el gasto');
    const { budgets } = await service(db).list();
    assert.equal(budgets[0].evaluation.carryFinal, false);
    assert.ok(budgets[0].pendingClose);
});

test('el presupuesto de un mes cerrado se corrige aparte, y cambia el saldo que pasó', async () => {
    const db = newDb({ budgets: [{ ...endova, clientId: 'c-pueblito', id: 'b-p' }], cycles: [{ id: 'y', budgetId: 'b-p', cycleKey: '2026-10', amount: 300000, spent: 100000, closedAt: at('2026-11-01') }] });
    await service(db).updateCycle('b-p', '2026-10', { amount: '400000' }, actor);
    assert.equal((await service(db).list()).budgets[0].evaluation.carryCents, 30_000_000);
    await assert.rejects(service(db).updateCycle('b-p', '2026-10', { amount: '0' }, actor), /presupuesto/);
});

test('un saldo ajustado vuelve a la cuenta automática', async () => {
    const db = newDb({ budgets: [{ ...endova, clientId: 'c-pueblito', id: 'b-p' }], cycles: [{ id: 'y', budgetId: 'b-p', cycleKey: '2026-10', amount: 300000, spent: 100000, closedAt: at('2026-11-01') }] });
    const adjusted = await service(db).adjustCarryOver('b-p', { carryOver: '5', reason: 'Prueba' }, actor);
    assert.equal(adjusted.evaluation.carryCents, 500);
    const undone = await service(db).clearCarryOver('b-p', {}, actor);
    assert.equal(undone.evaluation.carryCents, 20_000_000);
    assert.equal(undone.evaluation.carryManual, false);
});

test('una campaña y una pauta creadas por error se eliminan, y queda constancia', async () => {
    const db = newDb({ budgets: [endova], campaigns: [{ id: 'k1', budgetId: 'b-endova', name: 'Prueba', status: 'ACTIVA' }] });
    await service(db).recordSpend('b-endova', { spent: '1000', readOn: '2026-11-06' }, actor);
    await service(db).deleteCampaign('b-endova', 'k1', actor);
    assert.equal(db.store.campaigns.length, 0);
    await service(db).remove('b-endova', actor);
    assert.equal(db.store.budgets.length, 0);
    assert.equal(db.store.readings.length, 0);
    const last = db.store.events.at(-1);
    assert.equal(last.action, 'ELIMINAR');
    assert.equal(last.before.cycles[0].spent, 1000, 'lo eliminado se puede reconstruir');
});

test('una pauta terminada se reactiva editando su estado', async () => {
    const db = newDb({ budgets: [{ ...endova, status: 'TERMINADA' }] });
    assert.equal((await service(db).update('b-endova', { status: 'ACTIVA' }, actor)).status, 'ACTIVA');
});

test('el detalle dice qué se corrigió y quién', async () => {
    const db = newDb({ budgets: [endova] });
    await service(db).update('b-endova', { amount: '350000' }, actor);
    const detail = await service(db).detail('b-endova');
    assert.equal(detail.changes[0].by, 'Keila');
    assert.match(detail.changes[0].summary, /presupuesto/);
});

test('un ciclo mal escrito no crea filas', async () => {
    const db = newDb({ budgets: [endova] });
    await assert.rejects(service(db).recordSpend('b-endova', { spent: '1', readOn: '2026-11-06', cycleKey: 'octubre' }, actor), /ciclo/);
    assert.equal(db.store.cycles.length, 0);
});

test('ajustar el saldo exige motivo y queda escrito', async () => {
    const db = newDb({ budgets: [endova] });
    await assert.rejects(service(db).adjustCarryOver('b-endova', { carryOver: '181' }, actor), /por qué/);
    const after = await service(db).adjustCarryOver('b-endova', { carryOver: '100000', reason: 'Saldo de octubre según Meta' }, actor);
    assert.equal(after.evaluation.carryCents, 10_000_000);
    assert.equal(after.evaluation.carryManual, true);
    assert.equal(after.carryOverReason, 'Saldo de octubre según Meta');
});

test('una pauta específica no recibe saldo', async () => {
    const db = newDb({ budgets: [{ ...endova, kind: 'ESPECIFICA', startDate: '2026-11-01', endDate: '2026-11-20' }] });
    await assert.rejects(service(db).adjustCarryOver('b-endova', { carryOver: '1', reason: 'x' }, actor), /específica/);
});

test('una campaña se crea dentro de su pauta y no se toca desde otra', async () => {
    const db = newDb({ budgets: [endova, { ...endova, id: 'b-otra' }] });
    const campaign = await service(db).createCampaign('b-endova', { name: 'Convocatorias', status: 'ACTIVA', endDate: '2026-11-10' }, actor);
    await assert.rejects(service(db).updateCampaign('b-otra', campaign.id, { status: 'FINALIZADA' }, actor), (error) => error.statusCode === 404);
    const saved = await service(db).updateCampaign('b-endova', campaign.id, { status: 'FINALIZADA' }, actor);
    assert.equal(saved.status, 'FINALIZADA');
    assert.equal(saved.name, 'Convocatorias', 'cambiar el estado conserva lo demás');
});

test('el tablero no muestra terminadas ni pautas de clientes archivados, salvo que se pidan', async () => {
    const db = newDb({ budgets: [endova, { ...endova, id: 'b2', status: 'TERMINADA' }, { ...endova, id: 'b3', clientId: 'c-archivado' }] });
    assert.deepEqual((await service(db).list()).budgets.map((row) => row.id), ['b-endova']);
    assert.equal((await service(db).list({ includeFinished: true })).budgets.length, 2);
});

test('el detalle trae los ciclos del más reciente al más antiguo, con quién leyó', async () => {
    const db = newDb({ budgets: [endova] });
    await service(db, '2026-10-20').recordSpend('b-endova', { spent: '40000', readOn: '2026-10-20' }, actor);
    const detail = await service(db).detail('b-endova');
    assert.equal(detail.history.length, 1);
    assert.equal(detail.history[0].readings[0].recordedBy, 'Keila');
});

// Los avisos.

const silent = { log: () => {}, info: () => {} };

test('a quien lleva la pauta le llega a la banda lo que debe, y solo eso', async () => {
    const db = newDb({ budgets: [{ ...endova, id: 'b1' }], cycles: [{ id: 'c', budgetId: 'b1', cycleKey: '2026-10', amount: 300000, spent: 91000, spentAsOf: '2026-11-02', closedAt: null }] });
    const notified = [];
    await runAdBudgetAlerts(db, { now: at('2026-11-06'), notify: async (data) => notified.push(data), ...silent });
    const open = db.store.notices.filter((row) => !row.resolvedAt);
    assert.equal(open.length, 1);
    assert.equal(open[0].userId, 'u-keila');
    assert.equal(open[0].kind, 'PAUTA_REVISION');
    assert.match(open[0].message, /hace 4 días/);
    assert.equal(open[0].url, '/pautas?pauta=b1');
    assert.equal(notified.length, 0, 'a ocho días del cierre el project manager no recibe nada');
});

test('actualizar el gasto saca el aviso sin que nadie tenga que cerrarlo', async () => {
    const db = newDb({ budgets: [{ ...endova, id: 'b1' }], cycles: [{ id: 'c', budgetId: 'b1', cycleKey: '2026-10', amount: 300000, spent: 91000, spentAsOf: '2026-11-02', closedAt: null }] });
    await runAdBudgetAlerts(db, { now: at('2026-11-06'), notify: async () => {}, ...silent });
    const notice = db.store.notices[0];
    assert.equal(await adNoticeStillNeeded(db, notice, at('2026-11-06')), null, 'todavía debe la revisión');
    await service(db).recordSpend('b1', { spent: '120000', readOn: '2026-11-06' }, actor);
    const cleared = await adNoticeStillNeeded(db, notice, at('2026-11-06'));
    assert.equal(cleared.reason, 'PAUTA_ATENDIDA');
});

test('correr el reloj dos veces no repite nada ni borra el «Recordarme»', async () => {
    const db = newDb({ budgets: [{ ...endova, id: 'b1' }] });
    await runAdBudgetAlerts(db, { now: at('2026-11-06'), notify: async () => {}, ...silent });
    db.store.notices[0].snoozedUntil = at('2026-11-07');
    await runAdBudgetAlerts(db, { now: at('2026-11-06', 16), notify: async () => {}, ...silent });
    assert.equal(db.store.notices.length, 1);
    assert.ok(db.store.notices[0].snoozedUntil);
});

test('a cinco días del cierre el project manager recibe la campana una sola vez y sin cifras', async () => {
    const db = newDb({ budgets: [{ ...endova, id: 'b1' }], cycles: [{ id: 'c', budgetId: 'b1', cycleKey: '2026-10', amount: 300000, spent: 91000, spentAsOf: '2026-11-10', closedAt: null }] });
    const notified = [];
    const notify = async (data) => notified.push(data);
    await runAdBudgetAlerts(db, { now: at('2026-11-10'), notify, ...silent });
    await runAdBudgetAlerts(db, { now: at('2026-11-11'), notify, ...silent });
    assert.equal(notified.length, 1);
    assert.equal(notified[0].userId, 'u-camila');
    assert.doesNotMatch(notified[0].message, /\d{3}|\$/, 'la campana llega al celular');
    assert.match(notified[0].message, /cierra el 14 nov/);
});

test('sin responsable la pauta va al área de Pauta; si la persona no tiene acceso no se le avisa', async () => {
    const db = newDb({ budgets: [{ ...endova, id: 'b1', responsibleId: null }] });
    await runAdBudgetAlerts(db, { now: at('2026-11-06'), notify: async () => {}, ...silent });
    assert.equal(db.store.notices[0].userId, 'u-keila');

    const logged = [];
    const blocked = newDb({ budgets: [{ ...endova, id: 'b1' }], users: [{ ...users[0], modulePermissions: {} }, users[1]] });
    await runAdBudgetAlerts(blocked, { now: at('2026-11-06'), notify: async () => {}, log: (line) => logged.push(line), info: () => {} });
    assert.equal(blocked.store.notices.length, 0);
    assert.match(logged[0], /no tiene quién la reciba/);
});

test('una campaña activa pasada su fecha pide confirmar y se cae al finalizarla', async () => {
    const db = newDb({
        budgets: [{ ...endova, id: 'b1' }],
        cycles: [{ id: 'c', budgetId: 'b1', cycleKey: '2026-10', amount: 300000, spent: 91000, spentAsOf: '2026-11-06', closedAt: null }],
        campaigns: [{ id: 'k1', budgetId: 'b1', name: 'Evento', status: 'ACTIVA', endDate: '2026-11-03' }]
    });
    await runAdBudgetAlerts(db, { now: at('2026-11-06'), notify: async () => {}, ...silent });
    const notice = db.store.notices.find((row) => row.kind === 'PAUTA_CAMPANA');
    assert.match(notice.message, /«Evento» sigue activa/);
    assert.deepEqual(parseAdSubject(notice.subjectId), { campaignId: 'k1' });
    await service(db).updateCampaign('b1', 'k1', { status: 'FINALIZADA' }, actor);
    assert.equal((await adNoticeStillNeeded(db, notice, at('2026-11-06'))).reason, 'PAUTA_ATENDIDA');
});

test('una campaña que termina después del cierre avisa y se cae al corregir la fecha: lo de Bonsai', async () => {
    const db = newDb({
        budgets: [{ ...endova, id: 'b1' }],
        cycles: [{ id: 'c', budgetId: 'b1', cycleKey: '2026-10', amount: 300000, spent: 91000, spentAsOf: '2026-11-06', closedAt: null }],
        campaigns: [{ id: 'k1', budgetId: 'b1', name: 'Convocatorias', status: 'ACTIVA', endDate: '2026-11-18' }]
    });
    await runAdBudgetAlerts(db, { now: at('2026-11-06'), notify: async () => {}, ...silent });
    const notice = db.store.notices.find((row) => row.kind === 'PAUTA_CAMPANA');
    assert.match(notice.message, /«Convocatorias»: termina el 18 nov, después del cierre del 14 nov/);
    await service(db).updateCampaign('b1', 'k1', { endDate: '2026-11-14' }, actor);
    assert.equal((await adNoticeStillNeeded(db, notice, at('2026-11-06'))).reason, 'PAUTA_ATENDIDA');
});

test('más de tres pautas salen en un solo aviso, y lo atendido se cierra en el pase siguiente', () => {
    const wanted = [1, 2, 3, 4].map((n) => ({ kind: 'PAUTA_REVISION', subjectId: `pauta:${n}:2026-11`, level: 'SEGUIMIENTO', label: `Pauta · ${n}`, message: 'x', url: '/pautas' }));
    const digest = adNoticePlan({ wanted, open: [], today: '2026-11-06' });
    assert.equal(digest.create.length, 1);
    assert.equal(digest.create[0].kind, 'PAUTA_RESUMEN');
    assert.equal(digest.create[0].url, '/pautas?filtro=revisar');
    const twoOfOne = adNoticePlan({ wanted: wanted.map((item, index) => ({ ...item, budgetId: index < 2 ? 'a' : `b${index}` })), open: [], today: '2026-11-06' });
    assert.match(twoOfOne.create[0].message, /^3 pautas/, 'cuenta pautas, no avisos: lo mismo que el tablero');
    const closed = adNoticePlan({ wanted: [], open: [{ id: 'n', subjectId: 'pauta:1:2026-11' }], today: '2026-11-06' });
    assert.deepEqual(closed.close, [{ id: 'n', resolution: 'YA_ATENDIDO' }]);
});
