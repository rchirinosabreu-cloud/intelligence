import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PLAN_DIGEST_KIND,
    PLAN_DIGEST_THRESHOLD,
    PLAN_NOTICE_KIND,
    digestSubjectId,
    isPlanNotice,
    parsePlanSubject,
    planDigestText,
    planNoticePlan,
    planNoticeText,
    planSubjectId
} from '../src/lib/planCloseNotices.js';
import { cycleOf } from '../src/lib/clientOperations.js';

// Avisos de parrilla en la banda (Rodny, 30 de octubre de 2026: «me gustaría tener notificaciones de banda para poder
// cerrar correctamente las parrillas»). Lo que bloquea el cierre son las piezas que pasaron su fecha y siguen sin
// publicar. Un aviso por cuenta y mes —nunca uno por pieza—, al community manager y al project manager de esa cuenta.

const octubre = cycleOf(2026, 10, 1); // 2026-10-01 → 2026-10-31
const cuenta = { clientId: 'c1', clientName: 'Finas Asesores', slug: 'finas-asesores', cycle: octubre, overdue: 2 };

test('sin piezas atrasadas no hay aviso', () => {
    const { create, close } = planNoticePlan({ pending: [], open: [], today: '2026-10-20' });
    assert.deepEqual(create, []);
    assert.deepEqual(close, []);
});

test('el texto dice la cuenta, el mes y cuántas piezas, sin la orden del final', () => {
    const abierto = planNoticeText({ ...cuenta, closing: false });
    assert.equal(abierto.level, 'SEGUIMIENTO');
    assert.equal(abierto.label, 'Parrilla de octubre · Finas Asesores');
    assert.equal(abierto.message, '2 piezas pasaron su fecha y siguen sin publicar');

    const cerrando = planNoticeText({ ...cuenta, closing: true });
    assert.equal(cerrando.level, 'IMPORTANTE');
    assert.equal(cerrando.label, 'Octubre cierra el 31 · Finas Asesores');

    // Una sola pieza se dice en singular: un aviso mal escrito se lee como un error de la plataforma.
    assert.equal(planNoticeText({ ...cuenta, overdue: 1, closing: false }).message, '1 pieza pasó su fecha y sigue sin publicar');
});

// El salmón se reserva para lo que de verdad lo amerita: aquí, que el mes ya se está cerrando.
test('el nivel sube a salmón desde tres días antes del cierre, no antes', () => {
    const plan = (today) => planNoticePlan({ pending: [{ ...cuenta, today }], open: [], today }).create[0];
    assert.equal(plan('2026-10-27').level, 'SEGUIMIENTO');
    assert.equal(plan('2026-10-28').level, 'IMPORTANTE', 'tres días antes del 31');
    assert.equal(plan('2026-10-31').level, 'IMPORTANTE');
});

test('el asunto lleva la cuenta y el mes, así que cada mes tiene su aviso', () => {
    const id = planSubjectId('c1', octubre);
    assert.equal(id, 'c1:2026-10');
    assert.deepEqual(parsePlanSubject(id), { clientId: 'c1', year: 2026, month: 10 });
    assert.equal(parsePlanSubject('sin-mes'), null);
    assert.equal(parsePlanSubject(digestSubjectId('2026-10-20')), null, 'el resumen no es de una cuenta');
    assert.equal(isPlanNotice({ kind: PLAN_NOTICE_KIND }), true);
    assert.equal(isPlanNotice({ kind: PLAN_DIGEST_KIND }), true);
    assert.equal(isPlanNotice({ kind: 'CRM_REVIEW' }), false);
});

test('un aviso que ya está abierto y dice lo mismo no se vuelve a crear', () => {
    const abierto = { id: 'n1', kind: PLAN_NOTICE_KIND, subjectId: 'c1:2026-10', level: 'SEGUIMIENTO', message: '2 piezas pasaron su fecha y siguen sin publicar' };
    const { create, close } = planNoticePlan({ pending: [cuenta], open: [abierto], today: '2026-10-20' });
    assert.deepEqual(create, [], 'repetirlo borraría el «Recordarme» de la persona');
    assert.deepEqual(close, []);
});

test('si cambia lo que dice —otra pieza atrasada o el mes cerrando— se vuelve a crear', () => {
    const abierto = { id: 'n1', kind: PLAN_NOTICE_KIND, subjectId: 'c1:2026-10', level: 'SEGUIMIENTO', message: '2 piezas pasaron su fecha y siguen sin publicar' };
    const { create } = planNoticePlan({ pending: [{ ...cuenta, overdue: 3 }], open: [abierto], today: '2026-10-20' });
    assert.equal(create.length, 1);
    assert.equal(create[0].message, '3 piezas pasaron su fecha y siguen sin publicar');
});

test('la cuenta que se puso al día cierra su aviso', () => {
    const abierto = { id: 'n1', kind: PLAN_NOTICE_KIND, subjectId: 'c1:2026-10', level: 'SEGUIMIENTO', message: '2 piezas pasaron su fecha y siguen sin publicar' };
    const { create, close } = planNoticePlan({ pending: [], open: [abierto], today: '2026-10-20' });
    assert.deepEqual(create, []);
    assert.deepEqual(close, [{ id: 'n1', resolution: 'YA_ATENDIDO' }]);
});

test('más de tres cuentas se dicen en un solo aviso, no en una fila de avisos', () => {
    const pending = Array.from({ length: PLAN_DIGEST_THRESHOLD + 2 }, (_, i) => ({ ...cuenta, clientId: `c${i}`, clientName: `Cuenta ${i}` }));
    const { create } = planNoticePlan({ pending, open: [], today: '2026-10-20' });
    assert.equal(create.length, 1);
    assert.equal(create[0].kind, PLAN_DIGEST_KIND);
    assert.equal(create[0].subjectId, digestSubjectId('2026-10-20'));
    assert.match(create[0].message, /5 cuentas/);
    assert.equal(create[0].url, '/clientes?tab=operacion');
});

test('el resumen y los avisos de cuenta no conviven: al pasar el umbral se reemplazan', () => {
    const open = [
        { id: 'n1', kind: PLAN_NOTICE_KIND, subjectId: 'c0:2026-10', level: 'SEGUIMIENTO', message: 'x' },
        { id: 'n2', kind: PLAN_NOTICE_KIND, subjectId: 'c1:2026-10', level: 'SEGUIMIENTO', message: 'y' }
    ];
    const pending = Array.from({ length: 5 }, (_, i) => ({ ...cuenta, clientId: `c${i}`, clientName: `Cuenta ${i}` }));
    const subida = planNoticePlan({ pending, open, today: '2026-10-20' });
    assert.equal(subida.create[0].kind, PLAN_DIGEST_KIND);
    assert.deepEqual(subida.close.map((row) => row.id).sort(), ['n1', 'n2']);

    // Y al revés: cuando bajan de cuatro, vuelve el aviso por cuenta.
    const resumen = [{ id: 'd1', kind: PLAN_DIGEST_KIND, subjectId: digestSubjectId('2026-10-20'), level: 'IMPORTANTE', message: '5 cuentas…' }];
    const bajada = planNoticePlan({ pending: [cuenta], open: resumen, today: '2026-10-20' });
    assert.equal(bajada.create.length, 1);
    assert.equal(bajada.create[0].kind, PLAN_NOTICE_KIND);
    assert.deepEqual(bajada.close, [{ id: 'd1', resolution: 'YA_ATENDIDO' }]);
});

test('el aviso abre la parrilla de esa cuenta', () => {
    const { create } = planNoticePlan({ pending: [cuenta], open: [], today: '2026-10-20' });
    assert.equal(create[0].url, '/clientes/operacion/finas-asesores');
    assert.equal(create[0].kind, PLAN_NOTICE_KIND);
    assert.equal(create[0].subjectId, 'c1:2026-10');
});

test('el resumen dice el mes cuando ya se está cerrando', () => {
    assert.equal(planDigestText(5, { closing: true, monthLabel: 'Octubre' }).label, 'Cierre de octubre · 5 cuentas');
    assert.equal(planDigestText(5, { closing: false, monthLabel: 'Octubre' }).label, 'Parrillas · 5 cuentas');
    assert.equal(planDigestText(5, { closing: true, monthLabel: 'Octubre' }).level, 'IMPORTANTE');
});
