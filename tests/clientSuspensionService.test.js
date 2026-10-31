import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientSuspensionService } from '../src/services/clientSuspensionService.js';
import { suspensionBlock } from '../src/services/clientSuspensionGate.js';

// Una base de mentira con lo justo: clientes, su cartera, las suspensiones y los avisos ya mandados.
const buildDb = ({ receivables = [], suspensions = [], areas = {}, enabled = true } = {}) => {
    const rows = { suspensions: [...suspensions], alerts: [] };
    const client = {
        id: 'cliente-1', name: 'Café Altura', slug: 'cafe-altura',
        contracts: [{ cutDay: 1 }],
        projectManager: { userId: 'u-pm' },
        responsible: { userId: 'u-cm' },
        accountsReceivables: receivables
    };
    const open = (clientId) => rows.suspensions.find((row) => row.clientId === clientId && !row.liftedAt) || null;
    return {
        rows,
        client: {
            findFirst: async ({ where }) => (where.id === client.id || where.slug === client.slug ? client : null),
            findMany: async () => (open(client.id) ? [] : [client])
        },
        clientSuspension: {
            findFirst: async ({ where }) => open(where.clientId),
            findMany: async () => rows.suspensions.filter((row) => !row.liftedAt),
            create: async ({ data }) => {
                if (open(data.clientId)) throw Object.assign(new Error('unique'), { code: 'P2002' });
                rows.suspensions.push({ ...data });
                return { ...data };
            },
            update: async ({ where, data }) => {
                const row = rows.suspensions.find((item) => item.id === where.id);
                Object.assign(row, data);
                return row;
            }
        },
        collectionAlert: {
            create: async ({ data }) => {
                if (rows.alerts.some((row) => row.subjectId === data.subjectId && row.cycle === data.cycle && row.step === data.step)) {
                    throw Object.assign(new Error('unique'), { code: 'P2002' });
                }
                rows.alerts.push(data);
                return data;
            }
        },
        collectionSetting: { findUnique: async () => ({ enabled, paymentTermDays: 15, monthlyAlertCount: 2, oneOffFirstAlertDays: 15, repeatDays: 7 }) },
        teamMember: { findFirst: async ({ where }) => (areas[where.userId] ? { role: '', areas: areas[where.userId] } : null) },
        user: {
            findUnique: async ({ where }) => ({ name: where.id === 'u-elisa' ? 'Elisa' : 'Alguien' }),
            findMany: async () => Object.entries(areas).map(([id, list]) => ({ id, teamMember: { role: '', areas: list } }))
        }
    };
};

const cuenta = (id, dueDate, amount = 1_000_000, payments = []) => ({
    id, kind: 'CLIENTE', status: 'DEBE', amount, dueDate, period: null, issuedAt: null, number: null, metadata: null, payments
});

const AREAS = { 'u-elisa': ['ADMINISTRATIVA'], 'u-pm': ['PROJECT_MANAGEMENT'], 'u-cm': ['COMMUNITY'] };
const NOW = new Date('2026-10-15T15:00:00Z');
const vencida = [cuenta('jul', '2026-07-10', 3_150_000)];

const build = (options = {}) => {
    const db = buildDb(options);
    const sent = [];
    const banded = [];
    const service = createClientSuspensionService({
        db,
        notify: async (data) => { sent.push(data); return { id: `n-${sent.length}` }; },
        queueNotice: async (_db, data) => { banded.push(data); return { id: 'b-1' }; },
        log: () => {}, info: () => {}
    });
    return { db, service, sent, banded };
};

test('suspender es de Administración o Dirección, y exige quién lo autorizó y por qué', async () => {
    const { service } = build({ receivables: vencida, areas: AREAS });
    await assert.rejects(
        () => service.suspendClient({ clientId: 'cliente-1', authorizedBy: 'Francisco Villa', reason: 'No ha pagado.', actorUserId: 'u-pm', now: NOW }),
        (error) => error.status === 403
    );
    await assert.rejects(
        () => service.suspendClient({ clientId: 'cliente-1', reason: 'No ha pagado.', actorUserId: 'u-elisa', now: NOW }),
        (error) => error.status === 422 && /quién autorizó/.test(error.message)
    );
});

test('la suspensión empieza en el mes siguiente, guarda la cartera que la sustenta y avisa al PM, al CM y a Administración', async () => {
    const { db, service, sent } = build({ receivables: vencida, areas: AREAS });
    const suspension = await service.suspendClient({
        clientId: 'cliente-1', authorizedBy: 'Francisco Villa', reason: 'Dos meses y medio sin pagar.', actorUserId: 'u-elisa', now: NOW
    });
    assert.equal(suspension.fromCycle, '2026-11', 'octubre se termina');
    assert.equal(suspension.suspendedOn, '2026-10-15');

    const guardada = db.rows.suspensions[0];
    assert.equal(guardada.createdByName, 'Elisa');
    assert.equal(guardada.evidence.since, '2026-07-10');
    assert.equal(guardada.evidence.balanceCents, 315_000_000);

    assert.deepEqual([...new Set(sent.map((item) => item.userId))].sort(), ['u-cm', 'u-elisa', 'u-pm']);
    for (const aviso of sent) {
        assert.equal(aviso.type, 'CLIENTE_SUSPENDIDO');
        assert.doesNotMatch(aviso.message, /\$/, 'la campana llega al celular: nunca cifras');
        assert.match(aviso.message, /noviembre de 2026/);
    }
});

test('un cliente no puede quedar suspendido dos veces', async () => {
    const { service } = build({ receivables: vencida, areas: AREAS });
    const datos = { clientId: 'cliente-1', authorizedBy: 'Francisco Villa', reason: 'No ha pagado.', actorUserId: 'u-elisa', now: NOW };
    await service.suspendClient(datos);
    await assert.rejects(() => service.suspendClient(datos), (error) => error.status === 409);
});

test('se puede suspender por un acuerdo aunque hoy no llegue al umbral: lo explica el motivo', async () => {
    const { db, service } = build({ receivables: [cuenta('sep', '2026-10-01')], areas: AREAS });
    await service.suspendClient({ clientId: 'cliente-1', authorizedBy: 'Francisco Villa', reason: 'Lo acordamos con el cliente.', actorUserId: 'u-elisa', now: NOW });
    assert.deepEqual(db.rows.suspensions[0].evidence, {}, 'sin candidato la evidencia queda vacía, no inventada');
});

test('la suspensión congela el mes siguiente, no el que va en curso', async () => {
    const { db, service } = build({ receivables: vencida, areas: AREAS });
    await service.suspendClient({ clientId: 'cliente-1', authorizedBy: 'Francisco Villa', reason: 'No ha pagado.', actorUserId: 'u-elisa', now: NOW });

    assert.equal(await suspensionBlock(db, { clientId: 'cliente-1', year: 2026, month: 10 }), null);
    const bloqueo = await suspensionBlock(db, { clientId: 'cliente-1', year: 2026, month: 11, clientName: 'Café Altura' });
    assert.match(bloqueo.reason, /suspendido por cartera/);
    assert.match(bloqueo.reason, /Francisco Villa/);

    const pendiente = await suspensionBlock(db, { clientId: 'cliente-1', year: 2026, month: 11, forTask: true });
    assert.match(pendiente.reason, /pendiente/);
});

test('se levanta sola cuando el cliente se pone al día, y no antes', async () => {
    const pagada = cuenta('jul', '2026-07-10', 3_150_000, [{ amount: 3_150_000, reversedAt: null, kind: 'PAGO' }]);
    const sigueDebiendo = build({ receivables: vencida, areas: AREAS });
    await sigueDebiendo.service.suspendClient({ clientId: 'cliente-1', authorizedBy: 'F', reason: 'x', actorUserId: 'u-elisa', now: NOW });
    assert.equal(await sigueDebiendo.service.liftIfPaid('cliente-1', { now: NOW }), null);
    assert.equal(sigueDebiendo.db.rows.suspensions[0].liftedAt, undefined);

    const alDia = build({ receivables: [pagada], areas: AREAS });
    await alDia.service.suspendClient({ clientId: 'cliente-1', authorizedBy: 'F', reason: 'x', actorUserId: 'u-elisa', now: NOW });
    alDia.sent.length = 0;
    const levantada = await alDia.service.liftIfPaid('cliente-1', { now: NOW });
    assert.equal(levantada.liftKind, 'PAGO');
    assert.equal(alDia.db.rows.suspensions[0].liftReason, 'El cliente se puso al día.');
    assert.ok(alDia.sent.every((aviso) => aviso.type === 'CLIENTE_REACTIVADO'));
    assert.match(alDia.sent[0].message, /se puso al día/);
});

test('levantarla a mano pide el motivo y queda quién la levantó', async () => {
    const { db, service } = build({ receivables: vencida, areas: AREAS });
    await service.suspendClient({ clientId: 'cliente-1', authorizedBy: 'F', reason: 'x', actorUserId: 'u-elisa', now: NOW });
    await assert.rejects(() => service.liftSuspension({ clientId: 'cliente-1', actorUserId: 'u-elisa' }), (error) => error.status === 422);
    await assert.rejects(() => service.liftSuspension({ clientId: 'cliente-1', reason: 'Acuerdo.', actorUserId: 'u-pm' }), (error) => error.status === 403);

    await service.liftSuspension({ clientId: 'cliente-1', reason: 'Acuerdo de pago a tres cuotas.', actorUserId: 'u-elisa', now: NOW });
    assert.equal(db.rows.suspensions[0].liftKind, 'MANUAL');
    assert.equal(db.rows.suspensions[0].liftedByName, 'Elisa');
});

test('revisar si se puede levantar nunca lanza: no puede tumbar el pago que la provocó', async () => {
    const { service, db } = build({ receivables: vencida, areas: AREAS });
    db.clientSuspension.findFirst = async () => { throw new Error('la base se cayó'); };
    assert.equal(await service.liftIfPaid('cliente-1'), null);
});

test('la propuesta sale desde el día 15, una vez por cliente y mes congelado', async () => {
    const { service, banded, sent, db } = build({ receivables: vencida, areas: AREAS });

    const antes = await service.runClientSuspensions({ now: new Date('2026-10-14T15:00:00Z') });
    assert.equal(antes.proposed, 0, 'el 14 todavía no se decide');

    const primera = await service.runClientSuspensions({ now: NOW });
    assert.equal(primera.proposed, 1);
    assert.equal(banded.length, 1);
    assert.equal(banded[0].userId, 'u-elisa');
    assert.equal(banded[0].kind, 'CARTERA_SUSPENSION');
    assert.equal(banded[0].subjectId, 'cliente-1');
    assert.match(banded[0].message, /\$3\.150\.000/, 'la banda de Administración sí lleva cifras');
    const alPm = sent.find((aviso) => aviso.userId === 'u-pm');
    assert.doesNotMatch(alPm.message, /\$/);
    assert.match(alPm.message, /no empieces/);

    const segunda = await service.runClientSuspensions({ now: new Date('2026-10-16T15:00:00Z') });
    assert.equal(segunda.proposed, 0, 'no se repite todos los días');
    assert.equal(db.rows.alerts.length, 1);
});

test('con los avisos de cartera apagados no se proponen suspensiones', async () => {
    const { service, banded } = build({ receivables: vencida, areas: AREAS, enabled: false });
    const result = await service.runClientSuspensions({ now: NOW });
    assert.equal(result.proposed, 0);
    assert.equal(banded.length, 0);
});

test('el pase del reloj levanta las que ya no hacen falta antes de proponer', async () => {
    const pagada = cuenta('jul', '2026-07-10', 3_150_000, [{ amount: 3_150_000, reversedAt: null, kind: 'PAGO' }]);
    const { service, db } = build({
        receivables: [pagada], areas: AREAS,
        suspensions: [{ id: 's-1', clientId: 'cliente-1', fromCycle: '2026-11', suspendedOn: '2026-10-15', authorizedBy: 'F', reason: 'x' }]
    });
    const result = await service.runClientSuspensions({ now: NOW });
    assert.equal(result.lifted, 1);
    assert.equal(db.rows.suspensions[0].liftKind, 'PAGO');
});
