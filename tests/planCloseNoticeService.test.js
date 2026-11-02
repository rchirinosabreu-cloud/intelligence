import test from 'node:test';
import assert from 'node:assert/strict';
import { runPlanCloseNotices } from '../src/services/planCloseNoticeService.js';
import { PLAN_DIGEST_KIND, PLAN_NOTICE_KIND } from '../src/lib/planCloseNotices.js';
import { cycleOf } from '../src/lib/clientOperations.js';

// El reloj que reparte los avisos de parrilla (Rodny, 30 de octubre de 2026). Le llega al community manager y al
// project manager de la cuenta; nadie reenvía nada. Un aviso que ya dice lo mismo no se vuelve a crear.

const octubre = cycleOf(2026, 10, 1);
const NOW = new Date('2026-10-20T15:00:00Z'); // 10:00 en Bogotá

const cuenta = (extra = {}) => ({
    clientId: 'c1', clientName: 'Finas Asesores', slug: 'finas-asesores', cycle: octubre, overdue: 2,
    communityManager: { userId: 'u-cm', name: 'Melissa' },
    projectManager: { userId: 'u-pm', name: 'Kamila' },
    ...extra
});

const fakeDb = (open = []) => {
    const notices = [...open];
    const closed = [];
    return {
        notices, closed,
        importantNotice: {
            findMany: async ({ where }) => notices.filter((row) => !row.resolvedAt && (!where?.userId || row.userId === where.userId)),
            updateMany: async ({ where, data }) => {
                for (const row of notices) if (row.userId === where.userId && row.subjectId === where.subjectId && !row.resolvedAt) Object.assign(row, data);
                return { count: 0 };
            },
            update: async ({ where, data }) => {
                const row = notices.find((item) => item.id === where.id);
                Object.assign(row, data);
                closed.push({ id: where.id, resolution: data.resolution });
                return row;
            },
            create: async ({ data }) => { const row = { id: `n${notices.length + 1}`, ...data }; notices.push(row); return row; }
        },
        $transaction: async (fn) => fn(fakeTx(notices))
    };
};
const fakeTx = (notices) => ({
    importantNotice: {
        updateMany: async ({ where, data }) => {
            for (const row of notices) if (row.userId === where.userId && row.subjectId === where.subjectId && !row.resolvedAt) Object.assign(row, data);
            return { count: 0 };
        },
        create: async ({ data }) => { const row = { id: `n${notices.length + 1}`, ...data }; notices.push(row); return row; }
    }
});

const run = (db, plans, options = {}) => runPlanCloseNotices(db, {
    now: NOW, listOverduePlans: async () => plans, log: () => {}, info: () => {}, ...options
});

test('el mismo aviso le llega al community manager y al project manager', async () => {
    const db = fakeDb();
    const result = await run(db, [cuenta()]);
    assert.equal(result.sent, 2);
    const nuevos = db.notices.filter((row) => !row.resolvedAt);
    assert.deepEqual(nuevos.map((row) => row.userId).sort(), ['u-cm', 'u-pm']);
    assert.equal(nuevos[0].kind, PLAN_NOTICE_KIND);
    assert.equal(nuevos[0].subjectId, 'c1:2026-10');
    assert.equal(nuevos[0].message, '2 piezas pasaron su fecha y siguen sin publicar');
    assert.equal(nuevos[0].url, '/clientes/operacion/finas-asesores');
});

test('con una sola de las dos personas, el aviso igual sale', async () => {
    const db = fakeDb();
    const result = await run(db, [cuenta({ projectManager: null })]);
    assert.equal(result.sent, 1);
    assert.equal(db.notices[0].userId, 'u-cm');
});

test('una cuenta sin nadie a cargo no se pierde en silencio: queda dicho', async () => {
    const db = fakeDb();
    const dicho = [];
    const result = await run(db, [cuenta({ communityManager: null, projectManager: null })], { log: (text) => dicho.push(text) });
    assert.equal(result.sent, 0);
    assert.equal(dicho.length, 1);
    assert.match(dicho[0], /Finas Asesores/);
});

test('un aviso que ya está abierto y dice lo mismo no se repite', async () => {
    const abierto = {
        id: 'n1', userId: 'u-cm', kind: PLAN_NOTICE_KIND, subjectId: 'c1:2026-10', level: 'SEGUIMIENTO',
        message: '2 piezas pasaron su fecha y siguen sin publicar', resolvedAt: null
    };
    const db = fakeDb([abierto]);
    const result = await run(db, [cuenta({ projectManager: null })]);
    assert.equal(result.sent, 0, 'recrearlo borraría su «Recordarme»');
    assert.equal(db.notices.length, 1);
});

test('la cuenta que se puso al día cierra el aviso de las dos personas', async () => {
    const abiertos = ['u-cm', 'u-pm'].map((userId, index) => ({
        id: `n${index + 1}`, userId, kind: PLAN_NOTICE_KIND, subjectId: 'c1:2026-10', level: 'SEGUIMIENTO',
        message: '2 piezas pasaron su fecha y siguen sin publicar', resolvedAt: null
    }));
    const db = fakeDb(abiertos);
    const result = await run(db, []);
    assert.equal(result.sent, 0);
    assert.deepEqual(db.closed.map((row) => row.resolution), ['YA_ATENDIDO', 'YA_ATENDIDO']);
});

test('más de tres cuentas de la misma persona salen en un solo aviso', async () => {
    const db = fakeDb();
    const plans = Array.from({ length: 5 }, (_, i) => cuenta({ clientId: `c${i}`, clientName: `Cuenta ${i}`, slug: `cuenta-${i}`, projectManager: null }));
    const result = await run(db, plans);
    assert.equal(result.sent, 1);
    assert.equal(db.notices[0].kind, PLAN_DIGEST_KIND);
    assert.match(db.notices[0].message, /5 cuentas/);
});

// Que la plataforma no pueda avisar nunca puede frenar al resto: lo de una persona falla sola.
test('un aviso que no se puede guardar no frena a los demás', async () => {
    const db = fakeDb();
    let first = true;
    db.$transaction = async (fn) => {
        if (first) { first = false; throw new Error('base caída'); }
        return fn(fakeTx(db.notices));
    };
    const result = await run(db, [cuenta()]);
    assert.equal(result.sent, 1, 'el segundo destinatario sí recibió');
});
