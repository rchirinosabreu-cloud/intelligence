import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDeadlines, validateDataRequest, DATA_REQUEST_TYPES } from '../src/lib/dataSubjectRequests.js';

// Consultas y reclamos de titulares (Ley 1581 de 2012, arts. 14 y 15), 27 de septiembre de 2026.
// Consulta: 10 días hábiles, prorrogables 5. Reclamo: 15 hábiles, prorrogables 8; si llega
// incompleto se pide completarlo dentro de los 5 días siguientes y a los 2 meses sin respuesta
// se entiende desistido; mientras se tramita el dato lleva la leyenda «reclamo en trámite».

const TODAY = '2026-09-28';
const consulta = (extra = {}) => ({
    type: 'CONSULTA', reason: 'CONOCER', requesterName: 'Ana Titular', contactEmail: 'ana@correo.co', channel: 'EMAIL',
    description: 'Quiere saber qué datos suyos tenemos.', receivedOn: '2026-09-28', status: 'RECIBIDA', ...extra
});
const reclamo = (extra = {}) => consulta({ type: 'RECLAMO', reason: 'SUPRIMIR', description: 'Pide suprimir sus datos.', ...extra });

test('plazos legales por tipo', () => {
    assert.deepEqual(DATA_REQUEST_TYPES.CONSULTA.days, 10);
    assert.deepEqual(DATA_REQUEST_TYPES.CONSULTA.extension, 5);
    assert.deepEqual(DATA_REQUEST_TYPES.RECLAMO.days, 15);
    assert.deepEqual(DATA_REQUEST_TYPES.RECLAMO.extension, 8);
});

test('una consulta vence a los 10 hábiles y la prórroga suma 5 desde ese vencimiento', () => {
    const base = computeDeadlines(validateDataRequest(consulta(), { today: TODAY }), TODAY);
    assert.equal(base.dueOn, '2026-10-13', 'salta el festivo del 12 de octubre');
    assert.equal(base.daysLeft, 10);
    assert.equal(base.overdue, false);

    const extended = computeDeadlines(validateDataRequest(consulta({ status: 'EN_TRAMITE', extendedOn: '2026-10-09', extensionReason: 'Se consulta a un proveedor.' }), { today: '2026-10-09' }), '2026-10-09');
    assert.equal(extended.dueOn, '2026-10-20');
});

test('un reclamo vence a los 15 hábiles y exige la leyenda «reclamo en trámite» en 2 hábiles', () => {
    const d = computeDeadlines(validateDataRequest(reclamo(), { today: TODAY }), '2026-10-01');
    assert.equal(d.dueOn, '2026-10-20');
    assert.equal(d.legendDueOn, '2026-09-30');
    assert.ok(d.alerts.some((a) => /reclamo en trámite/.test(a)), 'avisa que falta la leyenda');

    const withLegend = computeDeadlines(validateDataRequest(reclamo({ legendAddedOn: '2026-09-29' }), { today: '2026-10-01' }), '2026-10-01');
    assert.equal(withLegend.alerts.some((a) => /reclamo en trámite/.test(a)), false);
});

test('reclamo incompleto: el reloj se detiene, se ve cuándo se entiende desistido y al completarse cuenta de nuevo', () => {
    const incomplete = validateDataRequest(reclamo({ status: 'INCOMPLETA', incompleteRequestedOn: '2026-09-30' }), { today: '2026-10-01' });
    const paused = computeDeadlines(incomplete, '2026-10-01');
    assert.equal(paused.dueOn, null);
    assert.equal(paused.desistOn, '2026-11-30');
    assert.equal(paused.incompleteRequestDueOn, '2026-10-05', '5 hábiles para pedir que lo complete');

    const completed = computeDeadlines(validateDataRequest(reclamo({ status: 'EN_TRAMITE', incompleteRequestedOn: '2026-09-30', completedOn: '2026-10-06' }), { today: '2026-10-06' }), '2026-10-06');
    assert.equal(completed.dueOn, '2026-10-28', '15 hábiles desde que se completó');
});

test('vencido y cerrado', () => {
    const late = computeDeadlines(validateDataRequest(consulta({ receivedOn: '2026-09-01' }), { today: TODAY }), TODAY);
    assert.equal(late.overdue, true);
    assert.ok(late.daysLeft < 0);
    const answered = computeDeadlines(validateDataRequest(consulta({ receivedOn: '2026-09-01', status: 'RESPONDIDA', respondedOn: '2026-09-10', responseSummary: 'Se enviaron sus datos.', responseEvidence: 'Correo del 10/09' }), { today: TODAY }), TODAY);
    assert.equal(answered.open, false);
    assert.equal(answered.overdue, false);
    assert.equal(answered.answeredLate, false);
});

test('validación: lo mínimo para tramitar y pruebas de lo que se afirma', () => {
    const fails = (input, pattern, today = TODAY) => assert.throws(() => validateDataRequest(input, { today }), pattern);
    fails(consulta({ requesterName: '' }), /nombre/i);
    fails(consulta({ contactEmail: '', contactPhone: '' }), /contacto/i);
    fails(consulta({ reason: 'SUPRIMIR' }), /motivo/i, TODAY);
    fails(consulta({ receivedOn: '2026-10-30' }), /futura/i);
    fails(consulta({ receivedOn: '2026-02-30' }), /fecha/i);
    fails(consulta({ status: 'INCOMPLETA', incompleteRequestedOn: '2026-09-28' }), /solo un reclamo/i);
    fails(consulta({ extendedOn: '2026-09-29' }), /motivo de la prórroga/i, '2026-09-29');
    fails(consulta({ receivedOn: '2026-09-01', extendedOn: '2026-09-25', extensionReason: 'x' }), /antes del vencimiento/i);
    fails(consulta({ status: 'RESPONDIDA' }), /respuesta/i);
    fails(reclamo({ status: 'DESISTIDA', incompleteRequestedOn: '2026-09-28' }), /dos meses/i);
    fails({ ...consulta(), extra: 'x' }, /campo no permitido/i);
});

test('el servicio solo deja operar a administradores y devuelve plazos calculados con el día de Bogotá', async () => {
    const { createDataRequestService, formatDataRequestReference } = await import('../src/services/dataSubjectRequestService.js');
    const stored = [];
    const pool = {
        query: async (sql, params = []) => {
            if (sql.includes('FROM "User" u JOIN "TeamMember"')) return { rows: params[0] === 'u-admin' ? [{ id: 'u-admin' }] : [] };
            if (sql.startsWith('INSERT INTO "DataSubjectRequest"')) {
                const columns = sql.match(/\(id, (.*?), "createdById"/)[1].split(', ').map((c) => c.replace(/"/g, ''));
                const row = { id: params[0], consecutive: stored.length + 1, ...Object.fromEntries(columns.map((c, i) => [c, params[i + 1]])) };
                stored.push(row);
                return { rows: [row] };
            }
            if (sql.startsWith('SELECT * FROM "DataSubjectRequest"')) return { rows: stored };
            return { rows: [] };
        }
    };
    // 28 de septiembre de 2026 a las 11 p. m. en Bogotá = 29 en UTC: manda el día de Bogotá.
    const service = createDataRequestService({ pool, clock: () => new Date('2026-09-29T04:00:00Z') });

    await assert.rejects(service.create('u-editor', consulta()), (error) => error.status === 403);
    const created = await service.create('u-admin', consulta());
    assert.equal(created.reference, 'SOL-0001');
    assert.equal(created.deadlines.dueOn, '2026-10-13');
    assert.equal(created.deadlines.daysLeft, 10);
    const { items, today } = await service.list('u-admin', {});
    assert.equal(today, '2026-09-28');
    assert.equal(items[0].requesterName, 'Ana Titular');
    assert.equal(formatDataRequestReference(42), 'SOL-0042');
});

test('las rutas de solicitudes de titulares crean, listan y editan', async () => {
    const { default: express } = await import('express');
    const { createAiGovernanceRouter } = await import('../src/routes/api/aiGovernance.js');
    const calls = [];
    const dataRequests = {
        list: async (userId, query) => { calls.push(['list', userId, query.open]); return { items: [], hasMore: false, page: 1 }; },
        create: async (userId, body) => { calls.push(['create', userId, body.type]); return { id: 'r1' }; },
        update: async (userId, id, body) => {
            calls.push(['update', userId, id, body.status]);
            throw Object.assign(new Error('Para cerrar como respondida registra la fecha, la respuesta y la evidencia del envío.'), { status: 400, code: 'DATA_REQUEST_INVALID' });
        }
    };
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { userId: 'u-admin' }; next(); });
    app.use('/api/ai-governance', createAiGovernanceRouter({ service: {}, dataRequests }));
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/ai-governance/data-requests`;
    try {
        assert.equal((await fetch(`${base}?open=true`)).status, 200);
        const created = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(consulta()) });
        assert.equal(created.status, 201);
        const invalid = await fetch(`${base}/r1`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'RESPONDIDA' }) });
        assert.equal(invalid.status, 400);
        assert.match((await invalid.json()).error, /evidencia del envío/);
        assert.deepEqual(calls, [['list', 'u-admin', 'true'], ['create', 'u-admin', 'CONSULTA'], ['update', 'u-admin', 'r1', 'RESPONDIDA']]);
    } finally {
        server.close();
    }
});

test('desistido solo tras dos meses sin completar', () => {
    const ok = validateDataRequest(reclamo({ receivedOn: '2026-07-01', status: 'DESISTIDA', incompleteRequestedOn: '2026-07-02' }), { today: '2026-09-02' });
    assert.equal(ok.status, 'DESISTIDA');
});
