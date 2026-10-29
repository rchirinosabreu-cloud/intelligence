import test from 'node:test';
import assert from 'node:assert/strict';
import {
    advanceState, exceptionProblem, formalizationEnabledText, formalizationRequestText, formalizationState, missingText
} from '../src/lib/projectFormalization.js';
import { receivableDueDate } from '../src/lib/receivableCollections.js';
import {
    attachFormalizationContract, canManageFormalizations, linkFormalizationAdvance, listFormalizations, quotationInstallments,
    refreshFormalizationsForReceivable, registerFormalizationException, startFormalization, sweepFormalizations
} from '../src/services/projectFormalizationService.js';

// Punto 3 de la solicitud de Elisa (Rodny, 29 de octubre de 2026): la solicitud de formalización le llega al área
// Administrativa; el contrato y las cifras los ven Dirección y Administrativa; la excepción del anticipo la autorizan
// Dirección o Administrativa; al aprobar, las cuotas del plan de pagos aparecen solas en Cuentas por cobrar sin emitir.

const NOW = new Date('2026-10-29T15:00:00Z');
const team = [
    { id: 'u-elisa', name: 'Elisa Mestra', teamMember: { role: 'Coordinadora Administrativa y Contable', areas: ['ADMINISTRATIVA'], isActive: true } },
    { id: 'u-francisco', name: 'Francisco Villa', teamMember: { role: 'Director general', areas: ['DIRECCION'], isActive: true } },
    { id: 'u-kamila', name: 'Kamila del Toro', teamMember: { role: 'Project Manager', areas: ['PROJECT_MANAGEMENT'], isActive: true } },
    { id: 'u-francys', name: 'Francys Caballero', teamMember: { role: 'Comercial', areas: ['COMERCIAL'], isActive: true } }
];

const plan = (installments) => ({ version: 1, paymentPlans: [{ scenarioId: null, mode: 'PERCENTAGE', installments }] });
const quotationFixture = (over = {}) => ({
    id: 'q-1', consecutive: 42, uuid_slug: 'slug-42', status: 'APROBADA', accepted_at: NOW, emisor_type: 'BRAIN_STUDIO',
    client_name: 'Laura Gómez', client_company: 'Café Altura', client_email: 'laura@cafealtura.co', client_phone: '+57 300 111 2233',
    items: [{ name: 'Branding' }], total_amount: 4000000, tax_amount: 0, currency: 'COP', lead_id: 'lead-1',
    proposal_details: plan([
        { id: 'i-1', label: 'Anticipo', value: 50, dueType: 'MILESTONE', milestone: 'Al aprobar' },
        { id: 'i-2', label: 'Saldo', value: 50, dueType: 'MILESTONE', milestone: 'Al entregar' }
    ]),
    ...over
});

const fakeDb = ({ quotation = quotationFixture(), lead = { id: 'lead-1', clientId: null }, clients = [], people = team } = {}) => {
    const db = {
        rows: { formalizations: [], receivables: [], documents: [], clients: [...clients], audits: [], crmActivities: [] },
        lead: lead ? { ...lead } : null,
        quotations: [quotation],
        $transaction: async (fn) => fn(db),
        quotation: {
            findUnique: async ({ where }) => db.quotations.find((item) => item.id === where.id) || null,
            findMany: async ({ where } = {}) => db.quotations.filter((item) => (!where?.status || item.status === where.status) && (!where?.id?.in || where.id.in.includes(item.id)))
        },
        crmLead: {
            findUnique: async ({ where }) => (db.lead && db.lead.id === where.id ? { ...db.lead } : null),
            update: async ({ data }) => Object.assign(db.lead, data)
        },
        crmActivity: { create: async ({ data }) => { db.rows.crmActivities.push(data); return data; } },
        client: {
            findUnique: async ({ where }) => db.rows.clients.find((item) => (where.id ? item.id === where.id : item.slug === where.slug)) || null,
            findMany: async ({ where }) => db.rows.clients.filter((item) => where.id.in.includes(item.id)),
            create: async ({ data }) => { const client = { id: `c-${db.rows.clients.length + 1}`, ...data }; db.rows.clients.push(client); return client; }
        },
        financialAuditEvent: { create: async ({ data }) => { db.rows.audits.push(data); return data; } },
        accountsReceivable: {
            create: async ({ data }) => { const row = { id: `r-${db.rows.receivables.length + 1}`, kind: 'CLIENTE', payments: [], ...data }; db.rows.receivables.push(row); return row; },
            findUnique: async ({ where }) => db.rows.receivables.find((item) => item.id === where.id) || null,
            findMany: async ({ where }) => db.rows.receivables.filter((item) => item.clientId === where.clientId && !['PAGADO', 'SALDADO'].includes(item.status))
        },
        projectFormalization: {
            findUnique: async ({ where }) => db.rows.formalizations.find((item) => (where.id ? item.id === where.id : item.quotationId === where.quotationId)) || null,
            findMany: async ({ where = {} } = {}) => db.rows.formalizations.filter((item) => (!where.status || item.status === where.status)
                && (!where.advanceReceivableId || item.advanceReceivableId === where.advanceReceivableId)
                && (!where.quotationId?.in || where.quotationId.in.includes(item.quotationId))),
            create: async ({ data }) => {
                if (db.rows.formalizations.some((item) => item.quotationId === data.quotationId)) throw Object.assign(new Error('duplicada'), { code: 'P2002' });
                const row = { id: `f-${db.rows.formalizations.length + 1}`, status: 'PENDIENTE', exceptionAt: null, enabledAt: null, projectManagerNotified: false, ...data };
                db.rows.formalizations.push(row);
                return row;
            },
            update: async ({ where, data }) => Object.assign(db.rows.formalizations.find((item) => item.id === where.id), data),
            updateMany: async ({ where, data }) => {
                const rows = db.rows.formalizations.filter((item) => item.id === where.id && (!where.status || item.status === where.status)
                    && (!('exceptionAt' in where) || item.exceptionAt === where.exceptionAt));
                rows.forEach((row) => Object.assign(row, data));
                return { count: rows.length };
            }
        },
        projectFormalizationDocument: {
            create: async ({ data }) => { const row = { id: `d-${db.rows.documents.length + 1}`, uploadedAt: NOW, ...data }; db.rows.documents.push(row); return row; },
            findMany: async ({ where }) => db.rows.documents.filter((item) => item.formalizationId === where.formalizationId),
            findFirst: async ({ where }) => db.rows.documents.find((item) => item.id === where.id && item.formalizationId === where.formalizationId) || null
        },
        user: { findMany: async () => people },
        teamMember: { findFirst: async ({ where }) => people.find((item) => item.id === where.userId)?.teamMember || null }
    };
    return db;
};

const collect = () => {
    const bells = [];
    return { bells, notify: async (data) => { bells.push(data); return { id: `n${bells.length}` }; }, log: () => {} };
};

const PDF = { buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'), originalname: 'Contrato Café Altura.pdf', mimetype: 'application/pdf', size: 52 };
const storage = () => { const saved = []; return { saved, upload: async (item) => { saved.push(item); }, get: async () => ({}) }; };

test('las reglas: qué falta, cuándo el anticipo está pagado y qué pide la excepción', () => {
    assert.equal(advanceState(null), 'SIN_CUENTA');
    assert.equal(advanceState({ amount: 2000000, status: 'DEBE', payments: [] }), 'PENDIENTE');
    assert.equal(advanceState({ amount: 2000000, status: 'DEBE', payments: [{ amount: 500000, kind: 'PAGO' }] }), 'PARCIAL');
    assert.equal(advanceState({ amount: 2000000, status: 'DEBE', payments: [{ amount: 2000000, kind: 'PAGO', reversedAt: '2026-10-29' }] }), 'PENDIENTE', 'un pago revertido no cuenta');
    assert.equal(advanceState({ amount: 2000000, status: 'PAGADO', payments: [] }), 'PAGADO');

    assert.deepEqual(formalizationState({}).missing, ['CONTRATO', 'ANTICIPO']);
    assert.equal(formalizationState({ documents: [{}], advance: { amount: 1, status: 'PAGADO' } }).ready, true);
    assert.equal(formalizationState({ documents: [{}], advance: { amount: 1, status: 'DEBE', payments: [] }, exceptionAt: NOW }).ready, true, 'la excepción reemplaza al anticipo');
    assert.equal(formalizationState({ documents: [], exceptionAt: NOW }).ready, false, 'la excepción nunca reemplaza al contrato');
    assert.equal(missingText(['CONTRATO', 'ANTICIPO']), 'Falta el contrato firmado y el anticipo');
    assert.equal(missingText([]), '');

    assert.equal(exceptionProblem({}, '2026-10-29'), 'Escribe el motivo de la excepción.');
    assert.equal(exceptionProblem({ reason: 'Cliente de años' }, '2026-10-29'), 'Elige la fecha de pago acordada.');
    assert.match(exceptionProblem({ reason: 'x', paymentDate: '2026-10-01' }, '2026-10-29'), /pasado/);
    assert.equal(exceptionProblem({ reason: 'x', paymentDate: '2026-11-15' }, '2026-10-29'), null);

    // Los avisos que viajan al celular nunca llevan cifras.
    assert.doesNotMatch(formalizationRequestText('Café Altura', 'COT-0042'), /\$|\d{3}\.\d{3}/);
    assert.doesNotMatch(formalizationEnabledText('Café Altura'), /\$|anticipo|contrato/);
});

test('las cuotas salen del plan de pagos del escenario aprobado y suman exactamente el total', () => {
    const rows = quotationInstallments(quotationFixture({ total_amount: 1000000.03 }));
    assert.deepEqual(rows.map((row) => [row.label, row.isAdvance]), [['Anticipo', true], ['Saldo', false]]);
    assert.equal(rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0), 100000003, 'el redondeo no crea ni pierde un centavo');

    const scenarios = quotationFixture({
        items: [{ scenarioId: 's-a', selectedScenario: false }, { scenarioId: 's-b', selectedScenario: true }],
        proposal_details: { version: 1, paymentPlans: [
            { scenarioId: 's-a', mode: 'PERCENTAGE', installments: [{ id: 'a', label: 'Único', value: 100, dueType: 'MILESTONE', milestone: 'x' }] },
            { scenarioId: 's-b', mode: 'PERCENTAGE', installments: [{ id: 'b1', label: 'Mitad', value: 50, dueType: 'MILESTONE', milestone: 'x' }, { id: 'b2', label: 'Mitad', value: 50, dueType: 'DATE', date: '2026-12-01' }] }
        ] }
    });
    assert.deepEqual(quotationInstallments(scenarios).map((row) => row.id), ['b1', 'b2'], 'el plan del escenario que el cliente eligió');
    assert.deepEqual(quotationInstallments(quotationFixture({ proposal_details: null })), [], 'sin plan de pagos no hay cuotas');
});

test('aprobar abre la formalización: ficha del cliente, cuotas sin emitir y aviso solo a Administrativa', async () => {
    const db = fakeDb();
    const { bells, notify, log } = collect();
    const formalization = await startFormalization(db, 'q-1', { userId: 'u-francys', name: 'Francys' }, { now: NOW, notify, log });

    assert.equal(formalization.status, 'PENDIENTE');
    assert.equal(db.rows.clients.length, 1, 'el cliente potencial quedó con su ficha');
    assert.equal(db.rows.clients[0].name, 'Café Altura');
    assert.equal(db.rows.clients[0].contactName, 'Laura Gómez');
    assert.equal(db.lead.clientId, db.rows.clients[0].id, 'su oportunidad del CRM apunta a la ficha');

    assert.equal(db.rows.receivables.length, 2);
    assert.deepEqual(db.rows.receivables.map((row) => [row.amount, row.status, row.origin, row.number ?? null]), [[2000000, 'DEBE', 'SYSTEM', null], [2000000, 'DEBE', 'SYSTEM', null]]);
    assert.match(db.rows.receivables[0].notes, /^Anticipo · COT-0042/);
    assert.equal(formalization.advanceReceivableId, db.rows.receivables[0].id, 'el anticipo es la primera cuota');
    assert.equal(db.rows.receivables[1].metadata.waitsForMilestone, true, 'el saldo «al entregar» espera su hito');
    assert.equal(receivableDueDate(db.rows.receivables[1]), null, 'y los avisos de cartera no lo cuentan como vencido');
    assert.ok(receivableDueDate(db.rows.receivables[0]), 'el anticipo sí vence');

    assert.deepEqual(bells.map((bell) => [bell.userId, bell.type]), [['u-elisa', 'FORMALIZACION_PENDIENTE']]);
    assert.match(bells[0].message, /Café Altura aprobó la COT-0042/);
    assert.equal(bells[0].url, '/financiero?tab=formalizacion');

    const again = await startFormalization(db, 'q-1', null, { now: NOW, notify, log });
    assert.equal(again.id, formalization.id, 'una cotización tiene una sola formalización');
    assert.equal(db.rows.receivables.length, 2, 'y no vuelve a crear las cuotas');
    assert.equal(bells.length, 1);
});

test('si el cliente ya tiene ficha se usa esa; una cotización sin aprobar no abre nada', async () => {
    const db = fakeDb({ lead: { id: 'lead-1', clientId: 'c-existing' }, clients: [{ id: 'c-existing', name: 'Café Altura SAS', slug: 'cafe-altura' }] });
    await startFormalization(db, 'q-1', null, { now: NOW, ...collect() });
    assert.equal(db.rows.clients.length, 1);
    assert.equal(db.rows.receivables[0].clientId, 'c-existing');

    const draft = fakeDb({ quotation: quotationFixture({ status: 'ACTIVA' }) });
    assert.equal(await startFormalization(draft, 'q-1', null, { now: NOW, ...collect() }), null);
    assert.equal(draft.rows.formalizations.length, 0);
});

test('en dólares la cartera va en pesos con la tasa de la cotización', async () => {
    const db = fakeDb({ quotation: quotationFixture({ currency: 'USD', total_amount: 2000, exchange_rate: 4000, exchange_rate_source: 'SUPERFINANCIERA_TRM', exchange_rate_date: NOW }) });
    await startFormalization(db, 'q-1', null, { now: NOW, ...collect() });
    assert.deepEqual(db.rows.receivables.map((row) => [row.currency, row.foreignAmount, row.amount, row.exchangeRate]), [['USD', 1000, 4000000, 4000], ['USD', 1000, 4000000, 4000]]);
});

test('contrato y anticipo pagado habilitan el proyecto y avisan al project manager de la cuenta, sin cifras', async () => {
    const db = fakeDb({ lead: { id: 'lead-1', clientId: 'c-1' }, clients: [{ id: 'c-1', name: 'Café Altura', slug: 'cafe-altura', projectManager: { userId: 'u-kamila', isActive: true, name: 'Kamila' } }] });
    const { bells, notify, log } = collect();
    const formalization = await startFormalization(db, 'q-1', null, { now: NOW, notify, log });

    const { status } = await attachFormalizationContract(db, storage(), formalization.id, PDF, { userId: 'u-elisa' }, { now: NOW, notify, log });
    assert.equal(status, 'PENDIENTE', 'el contrato solo no basta');

    db.rows.receivables[0].status = 'PAGADO';
    await refreshFormalizationsForReceivable(db, db.rows.receivables[0].id, { now: NOW, notify, log });
    const enabled = db.rows.formalizations[0];
    assert.equal(enabled.status, 'HABILITADO');
    assert.ok(enabled.enabledAt);
    assert.equal(enabled.projectManagerNotified, true);
    const pmBell = bells.find((bell) => bell.type === 'PROYECTO_HABILITADO');
    assert.equal(pmBell.userId, 'u-kamila');
    assert.equal(pmBell.url, '/clientes/operacion/cafe-altura');
    assert.doesNotMatch(pmBell.message, /\$|\d{3}\.\d{3}/);

    await refreshFormalizationsForReceivable(db, db.rows.receivables[0].id, { now: NOW, notify, log });
    assert.equal(bells.filter((bell) => bell.type === 'PROYECTO_HABILITADO').length, 1, 'el aviso al project manager sale una vez');
});

test('la excepción la registra Dirección o Administrativa con motivo y fecha; sin project manager avisa al área', async () => {
    const db = fakeDb();
    const { bells, notify, log } = collect();
    const formalization = await startFormalization(db, 'q-1', null, { now: NOW, notify, log });
    await attachFormalizationContract(db, storage(), formalization.id, PDF, { userId: 'u-elisa' }, { now: NOW, notify, log });

    await assert.rejects(registerFormalizationException(db, formalization.id, { reason: '' }, { userId: 'u-francisco' }, { now: NOW, notify, log }), { statusCode: 400 });
    await registerFormalizationException(db, formalization.id, { reason: 'Cliente de hace tres años', conditions: 'Paga con la primera entrega', paymentDate: '2026-11-15' }, { userId: 'u-francisco', name: 'Francisco Villa' }, { now: NOW, notify, log });
    const row = db.rows.formalizations[0];
    assert.equal(row.status, 'HABILITADO');
    assert.equal(row.exceptionByName, 'Francisco Villa');
    assert.equal(row.exceptionPaymentDate, '2026-11-15');
    assert.equal(db.rows.receivables[0].status, 'DEBE', 'la deuda sigue en Cuentas por cobrar');
    assert.deepEqual(bells.filter((bell) => bell.type === 'PROYECTO_HABILITADO').map((bell) => bell.userId), ['u-kamila'], 'sin project manager en la cuenta, al área de Project management');
    assert.ok(db.rows.audits.some((item) => item.entityType === 'ProjectFormalization' && item.after.operation === 'EXCEPTION'));

    await assert.rejects(registerFormalizationException(db, formalization.id, { reason: 'otra', paymentDate: '2026-11-20' }, { userId: 'u-elisa' }, { now: NOW, notify, log }), { statusCode: 409 });
});

test('sin plan de pagos, Administración liga la cuenta del anticipo; solo una del mismo cliente', async () => {
    const db = fakeDb({ quotation: quotationFixture({ proposal_details: null }) });
    const formalization = await startFormalization(db, 'q-1', null, { now: NOW, ...collect() });
    assert.equal(db.rows.receivables.length, 0);
    assert.equal(formalization.advanceReceivableId, null);

    const own = await db.accountsReceivable.create({ data: { clientId: db.rows.clients[0].id, amount: 1500000, status: 'DEBE' } });
    const other = await db.accountsReceivable.create({ data: { clientId: 'c-otro', amount: 1500000, status: 'DEBE' } });
    const { items } = await listFormalizations(db);
    assert.deepEqual(items[0].clientReceivables.map((item) => item.id), [own.id], 'se ofrecen las cuentas abiertas del cliente');
    assert.deepEqual(items[0].state.missing, ['CONTRATO', 'ANTICIPO']);

    await assert.rejects(linkFormalizationAdvance(db, formalization.id, other.id, {}, collect()), { statusCode: 400 });
    await linkFormalizationAdvance(db, formalization.id, own.id, {}, collect());
    assert.equal(db.rows.formalizations[0].advanceReceivableId, own.id);
});

test('solo Dirección y Administrativa gestionan la formalización', async () => {
    const db = fakeDb();
    assert.equal(await canManageFormalizations(db, { userId: 'u-elisa' }), true);
    assert.equal(await canManageFormalizations(db, { userId: 'u-francisco' }), true);
    assert.equal(await canManageFormalizations(db, { userId: 'u-kamila' }), false, 'el project manager solo se entera de que puede empezar');
    assert.equal(await canManageFormalizations(db, { userId: 'u-francys' }), false);
});

test('el reloj abre la formalización que no se abrió al aprobar y no toca cotizaciones de antes', async () => {
    const db = fakeDb();
    db.quotations.push(quotationFixture({ id: 'q-old', accepted_at: new Date('2026-09-01T15:00:00Z') }));
    db.quotation.findMany = async ({ where }) => db.quotations.filter((item) => item.status === where.status && item.accepted_at >= where.accepted_at.gte);
    await sweepFormalizations(db, { now: NOW, ...collect() });
    assert.deepEqual(db.rows.formalizations.map((item) => item.quotationId), ['q-1']);
});
