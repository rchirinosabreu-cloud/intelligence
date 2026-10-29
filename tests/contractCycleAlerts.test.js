import test from 'node:test';
import assert from 'node:assert/strict';
import { contractCycleAlerts, cycleAlertText, cycleDigestText } from '../src/lib/contractCycleAlerts.js';
import { currentContracts, runContractCycleAlerts } from '../src/services/contractCycleAlertService.js';

// Punto 5 de la solicitud de Elisa (29 de octubre de 2026): avisos antes del cierre de cada mes y antes de que termine el
// contrato, al project manager y a Administrativa y contable, según el paso.

const contract = (over = {}) => ({ id: 'k-1', clientId: 'c-1', status: 'ACTIVO', startDate: '2026-01-01', endDate: null, cutDay: 1, monthlyReport: false, ...over });
const steps = (alerts) => alerts.map((alert) => alert.step);

test('antes del cierre: revisar a 3 días, informe y facturación a 2, consolidar el día del cierre', () => {
    assert.deepEqual(steps(contractCycleAlerts(contract(), '2026-10-27')), [], 'a 4 días no hay nada');
    assert.deepEqual(steps(contractCycleAlerts(contract(), '2026-10-28')), ['REVISION']);
    assert.deepEqual(steps(contractCycleAlerts(contract(), '2026-10-29')), ['REVISION', 'FACTURACION'], 'sin informe contratado no se pide el informe');
    assert.deepEqual(steps(contractCycleAlerts(contract({ monthlyReport: true }), '2026-10-29')), ['REVISION', 'INFORME', 'FACTURACION']);
    assert.deepEqual(steps(contractCycleAlerts(contract(), '2026-10-31')), ['REVISION', 'FACTURACION', 'CIERRE']);
    const close = contractCycleAlerts(contract(), '2026-10-31').find((alert) => alert.step === 'CIERRE');
    assert.equal(close.close, '2026-10-31');
    assert.equal(close.cycleKey, '2026-10-01', 'el mes se identifica por su inicio');
});

test('el cierre de un sábado se avisa el lunes; pasada la ventana, ya no', () => {
    assert.deepEqual(steps(contractCycleAlerts(contract(), '2026-11-02')), ['CIERRE']);
    assert.equal(contractCycleAlerts(contract(), '2026-11-02')[0].cycleKey, '2026-10-01', 'es el cierre de octubre');
    assert.deepEqual(steps(contractCycleAlerts(contract(), '2026-11-04')), []);
});

test('el mes sigue el día de corte del contrato y se acorta si el contrato termina antes', () => {
    const fifteen = contractCycleAlerts(contract({ cutDay: 15 }), '2026-11-11');
    assert.deepEqual(steps(fifteen), ['REVISION']);
    assert.equal(fifteen[0].close, '2026-11-14', 'empieza el 15, cierra el 14');

    const ending = contractCycleAlerts(contract({ endDate: '2026-11-20' }), '2026-11-17');
    assert.deepEqual(steps(ending), ['REVISION', 'RENOVACION_15']);
    assert.equal(ending[0].close, '2026-11-20');
});

test('renovación: a 30 días al project manager y a Administrativa; a 15, a Administrativa', () => {
    const thirty = contractCycleAlerts(contract({ endDate: '2026-11-30' }), '2026-11-05');
    assert.deepEqual(thirty.map((alert) => [alert.step, alert.audience]), [['RENOVACION_30', ['PM', 'ADMINISTRATIVA']]]);
    assert.deepEqual(steps(contractCycleAlerts(contract({ endDate: '2026-11-30' }), '2026-10-30')), ['REVISION', 'FACTURACION'], 'a 31 días todavía no');
    assert.deepEqual(contractCycleAlerts(contract({ endDate: '2026-11-30' }), '2026-11-16').filter((alert) => alert.step.startsWith('RENOVACION')).map((alert) => [alert.step, alert.audience]), [['RENOVACION_15', ['ADMINISTRATIVA']]]);
    assert.deepEqual(steps(contractCycleAlerts(contract({ endDate: '2026-10-20' }), '2026-10-28')), [], 'un contrato que ya terminó no avisa');
});

test('stand by, terminado o sin empezar: nada', () => {
    assert.deepEqual(contractCycleAlerts(contract({ status: 'STAND_BY' }), '2026-10-28'), []);
    assert.deepEqual(contractCycleAlerts(contract({ status: 'TERMINADO' }), '2026-10-28'), []);
    assert.deepEqual(contractCycleAlerts(contract({ startDate: '2026-11-01' }), '2026-10-28'), []);
});

test('los textos dicen la fecha y nunca una cifra', () => {
    const alert = contractCycleAlerts(contract(), '2026-10-28')[0];
    assert.equal(cycleAlertText(alert, 'Café Altura'), 'El mes de Café Altura cierra el 31 de octubre: revisa contenidos, jornadas y pendientes.');
    assert.equal(cycleAlertText({ step: 'RENOVACION_30', endDate: '2026-11-30' }, 'Café Altura'), 'El contrato de Café Altura termina el 30 de noviembre: activa la gestión de renovación.');
    assert.match(cycleDigestText('REVISION', 8), /^8 cuentas cierran el mes en tres días/);
});

test('el contrato vigente es el de inicio más reciente que ya empezó', () => {
    const list = [
        contract({ id: 'old', startDate: '2025-01-01' }),
        contract({ id: 'now', startDate: '2026-01-01' }),
        contract({ id: 'future', startDate: '2026-12-01' }),
        contract({ id: 'other', clientId: 'c-2', startDate: '2026-03-01' })
    ];
    assert.deepEqual(currentContracts(list, '2026-10-28').map((item) => item.id).sort(), ['now', 'other']);
});

const NOW = new Date('2026-10-29T15:00:00Z');
const team = [
    { id: 'u-elisa', teamMember: { role: 'Coordinadora Administrativa y Contable', areas: ['ADMINISTRATIVA'], isActive: true } },
    { id: 'u-kamila', teamMember: { role: 'Project Manager', areas: ['PROJECT_MANAGEMENT'], isActive: true } },
    { id: 'u-rodny', teamMember: { role: 'Project Manager', areas: ['PROJECT_MANAGEMENT', 'DIRECCION'], isActive: true } }
];
const clientOf = (id, over = {}) => ({ id, name: `Cliente ${id}`, slug: `cliente-${id}`, isArchived: false, projectManager: { userId: 'u-kamila', isActive: true }, ...over });
const fakeDb = (contracts) => {
    const taken = new Set();
    return {
        clientContract: { findMany: async () => contracts },
        user: { findMany: async () => team },
        contractCycleAlert: {
            create: async ({ data }) => {
                const key = `${data.contractId}|${data.cycleKey}|${data.step}`;
                if (taken.has(key)) throw Object.assign(new Error('duplicada'), { code: 'P2002' });
                taken.add(key);
                return data;
            }
        }
    };
};
const run = async (db) => {
    const bells = [];
    const result = await runContractCycleAlerts(db, { now: NOW, notify: async (data) => { bells.push(data); return { id: bells.length }; }, log: () => {}, info: () => {} });
    return { result, bells };
};

test('el project manager recibe lo suyo, Administrativa la facturación, y nada se repite', async () => {
    const db = fakeDb([
        contract({ id: 'k-1', clientId: 'c-1', client: clientOf('c-1') }),
        contract({ id: 'k-2', clientId: 'c-2', client: clientOf('c-2', { projectManager: null }) }),
        contract({ id: 'k-3', clientId: 'c-3', client: clientOf('c-3', { isArchived: true }) })
    ]);
    const { result, bells } = await run(db);
    assert.equal(result.sent, 4, 'revisión y facturación de dos clientes; el archivado no avisa');
    const of = (userId) => bells.filter((bell) => bell.userId === userId).map((bell) => [bell.type, bell.relatedId]);
    assert.deepEqual(of('u-kamila'), [['CIERRE_MENSUAL', 'c-1'], ['CIERRE_MENSUAL', 'c-2']], 'sin project manager en la cuenta, al área');
    assert.deepEqual(of('u-rodny'), [['CIERRE_MENSUAL', 'c-2']]);
    assert.deepEqual(of('u-elisa'), [['FACTURACION_MENSUAL', 'c-1'], ['FACTURACION_MENSUAL', 'c-2']]);
    assert.equal(bells.find((bell) => bell.userId === 'u-elisa').url, '/financiero?tab=cartera');
    assert.equal(bells.find((bell) => bell.userId === 'u-kamila').url, '/clientes/operacion/cliente-c-1');

    const again = await run(db);
    assert.equal(again.result.sent, 0);
    assert.equal(again.bells.length, 0);
});

test('más de tres avisos del mismo paso para una persona salen en uno solo', async () => {
    const db = fakeDb(['a', 'b', 'c', 'd', 'e'].map((id) => contract({ id: `k-${id}`, clientId: id, client: clientOf(id) })));
    const { bells } = await run(db);
    const kamila = bells.filter((bell) => bell.userId === 'u-kamila');
    assert.equal(kamila.length, 1);
    assert.match(kamila[0].message, /^5 cuentas cierran el mes en tres días/);
    assert.equal(kamila[0].url, '/clientes');
    assert.equal(bells.filter((bell) => bell.userId === 'u-elisa').length, 1);
});
