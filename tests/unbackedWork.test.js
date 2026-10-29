import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizationProblem, contractGap, unbackedWork, unbackedWorkNoticeText } from '../src/lib/unbackedWork.js';
import { evaluateClientOperation } from '../src/lib/clientOperations.js';
import { runUnbackedWorkAlerts } from '../src/services/unbackedWorkAlertService.js';
import { createClientOperationsService } from '../src/services/clientOperationsService.js';

// Punto 5 de la solicitud de Elisa (Rodny, 29 de octubre de 2026): trabajo en curso sin propuesta aprobada. Con tareas
// abiertas o parrilla del mes y sin contrato vigente, el semáforo lo dice y Dirección recibe un aviso; Dirección o
// Administración pueden autorizar seguir hasta una fecha.

const TODAY = '2026-10-29';
const contract = (over = {}) => ({ serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-01-01', endDate: null, deliverables: [], ...over });
const busy = { openTasks: 9, plans: ['octubre'] };

test('qué cuenta como contrato que no respalda el trabajo', () => {
    assert.equal(contractGap(null, TODAY), 'SIN_CONTRATO');
    assert.equal(contractGap(contract({ endDate: '2026-09-10' }), TODAY), 'VENCIDO');
    assert.equal(contractGap(contract({ status: 'TERMINADO' }), TODAY), 'TERMINADO');
    assert.equal(contractGap(contract({ status: 'STAND_BY' }), TODAY), null, 'stand by es una pausa decidida');
    assert.equal(contractGap(contract({ endDate: '2026-10-29' }), TODAY), null, 'el día que vence todavía respalda');
});

test('solo cuenta si hay trabajo: tareas abiertas o parrilla del mes', () => {
    assert.equal(unbackedWork({ contract: null, work: { openTasks: 0, plans: [] } }, TODAY), null);
    const promo = unbackedWork({ contract: null, work: busy }, TODAY);
    assert.equal(promo.text, 'Se está trabajando sin contrato cargado: 9 tareas abiertas y parrilla de octubre.');
    const aristea = unbackedWork({ contract: contract({ endDate: '2026-09-10' }), work: { openTasks: 5, plans: ['octubre', 'noviembre'] } }, TODAY);
    assert.equal(aristea.text, 'Se está trabajando con el contrato vencido desde el 10 sep: 5 tareas abiertas y parrilla de octubre y noviembre.');
    assert.equal(unbackedWork({ contract: null, work: { openTasks: 1, plans: [] } }, TODAY).what, '1 tarea abierta');
    assert.doesNotMatch(unbackedWorkNoticeText('Promo Group', promo), /\$|\d{3}\.\d{3}/);
});

test('una autorización vigente lo deja dicho y en gris; vencida, vuelve a contar', () => {
    const authorization = { until: '2026-11-15', reason: 'La renovación está firmada y falta cargarla.', byName: 'Francisco Villa' };
    const authorized = unbackedWork({ contract: null, work: busy, authorization }, TODAY);
    assert.equal(authorized.authorized, true);
    assert.equal(authorized.text, 'Francisco Villa autorizó seguir trabajando sin propuesta aprobada hasta el 15 nov: La renovación está firmada y falta cargarla.');
    assert.equal(unbackedWork({ contract: null, work: busy, authorization: { ...authorization, until: '2026-10-20' } }, TODAY).authorized, false);

    assert.match(authorizationProblem({ until: '2026-11-15' }, TODAY), /por qué/);
    assert.match(authorizationProblem({ reason: 'x', until: '2026-10-01' }, TODAY), /pasado/);
    assert.match(authorizationProblem({ reason: 'x', until: '2027-06-01' }, TODAY), /120 días/);
    assert.equal(authorizationProblem({ reason: 'x', until: '2026-11-15' }, TODAY), null);
});

test('el semáforo ya no lo calla en gris: es un motivo propio', () => {
    const promo = evaluateClientOperation({ contract: null, work: busy, openTasks: [] }, { today: TODAY });
    assert.equal(promo.level, 'yellow');
    assert.match(promo.reasons[0].text, /sin contrato cargado: 9 tareas abiertas/);

    const quiet = evaluateClientOperation({ contract: null, work: { openTasks: 0, plans: [] }, openTasks: [] }, { today: TODAY });
    assert.equal(quiet.level, 'gray', 'sin trabajo, sigue siendo «sin medir»');

    const expired = evaluateClientOperation({ contract: contract({ serviceType: 'SERVICIOS', endDate: '2026-09-10' }), work: { openTasks: 2, plans: [] }, openTasks: [] }, { today: TODAY });
    assert.deepEqual(expired.reasons.map((reason) => reason.text), ['Se está trabajando con el contrato vencido desde el 10 sep: 2 tareas abiertas.'], 'reemplaza a «el contrato venció»');

    const authorized = evaluateClientOperation({ contract: null, work: busy, workAuthorization: { until: '2026-11-15', reason: 'Firmado', byName: 'Elisa' }, openTasks: [] }, { today: TODAY });
    assert.equal(authorized.level, 'gray');
});

const NOW = new Date('2026-10-29T15:00:00Z');
const people = [
    { id: 'u-francisco', teamMember: { role: 'Director general', areas: ['DIRECCION'], isActive: true } },
    { id: 'u-kamila', teamMember: { role: 'Project Manager', areas: ['PROJECT_MANAGEMENT'], isActive: true } }
];
const clientRow = (id, over = {}) => ({
    id, name: `Cliente ${id}`, slug: id, contracts: [], workAuthorizations: [],
    contentPlans: [{ year: 2026, month: 10, _count: { contentItems: 4 } }], _count: { nativeTasks: 3 }, ...over
});
const fakeDb = (clients) => {
    const taken = new Set();
    return {
        client: { findMany: async () => clients },
        user: { findMany: async () => people },
        unbackedWorkAlert: {
            create: async ({ data }) => {
                const key = `${data.clientId}|${data.monthKey}`;
                if (taken.has(key)) throw Object.assign(new Error('duplicada'), { code: 'P2002' });
                taken.add(key);
                return data;
            }
        }
    };
};
const run = async (db) => {
    const bells = [];
    const result = await runUnbackedWorkAlerts(db, { now: NOW, notify: async (data) => { bells.push(data); return { id: bells.length }; }, log: () => {}, info: () => {} });
    return { result, bells };
};

test('Dirección recibe el aviso una vez por cliente y mes; lo autorizado o con contrato no avisa', async () => {
    const db = fakeDb([
        clientRow('promo'),
        clientRow('aristea', { contracts: [{ status: 'ACTIVO', startDate: '2026-01-01', endDate: '2026-09-10' }] }),
        clientRow('al-dia', { contracts: [{ status: 'ACTIVO', startDate: '2026-01-01', endDate: null }] }),
        clientRow('autorizado', { workAuthorizations: [{ until: '2026-11-15', reason: 'Firmado', authorizedByName: 'Francisco' }] }),
        clientRow('quieto', { contentPlans: [], _count: { nativeTasks: 0 } }),
        clientRow('viejo', { contentPlans: [{ year: 2026, month: 8, _count: { contentItems: 4 } }], _count: { nativeTasks: 0 } })
    ]);
    const { result, bells } = await run(db);
    assert.equal(result.found, 2);
    assert.deepEqual(bells.map((bell) => [bell.userId, bell.relatedId]), [['u-francisco', 'promo'], ['u-francisco', 'aristea']], 'solo a Dirección');
    assert.equal(bells[0].url, '/clientes/operacion/promo');
    assert.match(bells[0].message, /^Cliente promo tiene trabajo en curso sin propuesta aprobada \(3 tareas abiertas y parrilla de octubre\)/);

    const again = await run(db);
    assert.equal(again.bells.length, 0, 'no se repite en el mismo mes');
});

test('autorizar seguir es de Dirección o Administración, con motivo y fecha', async () => {
    const created = [];
    const db = {
        teamMember: { findFirst: async ({ where }) => ({ 'u-francisco': { role: 'Director general', areas: [] }, 'u-kamila': { role: 'Project Manager', areas: [] } }[where.userId] || null) },
        client: { findFirst: async ({ where }) => (where.id === 'c-promo' || where.slug === 'promo' ? { id: 'c-promo', slug: 'promo' } : null) },
        user: { findUnique: async () => ({ name: 'Francisco Villa' }) },
        clientWorkAuthorization: { create: async ({ data }) => { created.push(data); return data; } }
    };
    const service = createClientOperationsService({ db, now: () => NOW });
    await assert.rejects(service.authorizeWork({ clientId: 'c-promo', until: '2026-11-15', reason: 'x', actorUserId: 'u-kamila' }), { status: 403 });
    await assert.rejects(service.authorizeWork({ clientId: 'c-promo', until: '2026-11-15', reason: '', actorUserId: 'u-francisco' }), { status: 422 });
    // Guardar y devolver la página: la lectura de la página no es de esta prueba.
    await service.authorizeWork({ clientId: 'c-promo', until: '2026-11-15', reason: 'La renovación está firmada', actorUserId: 'u-francisco' }).catch(() => null);
    assert.deepEqual(created, [{ clientId: 'c-promo', until: '2026-11-15', reason: 'La renovación está firmada', authorizedById: 'u-francisco', authorizedByName: 'Francisco Villa' }]);
});

test('más de tres clientes salen en un solo aviso', async () => {
    const { bells } = await run(fakeDb(['a', 'b', 'c', 'd'].map((id) => clientRow(id))));
    assert.equal(bells.length, 1);
    assert.match(bells[0].message, /^4 clientes tienen trabajo en curso sin propuesta aprobada/);
});
