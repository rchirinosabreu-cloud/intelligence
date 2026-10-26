import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_FOLLOW_UP_ALERT_DAYS, FOLLOW_UP_ALERT_STAGES, dueFollowUpAlert, followUpAlertMessage, followUpSilence,
    markFollowUpAlertSent, normalizeFollowUpAlertDays
} from '../src/lib/crmFollowUpAlerts.js';

// Punto 2 de la solicitud de Elisa (20 de octubre de 2026): «generar recordatorios a los 5, 10, 15 y 20 días sin
// respuesta y una revisión a los 30 días. Los tiempos serán configurables y las alertas se actualizarán según las
// gestiones registradas». Rodny, 26 de octubre de 2026: cualquier gestión registrada reinicia la cuenta, los días los
// cambia un administrador y la revisión de los 30 también les llega a los administradores.

const day = (iso) => new Date(`${iso}T15:00:00Z`);
const lead = (patch = {}) => ({ id: 'l1', stage: 'PROPUESTA_ENVIADA', proposalSentAt: day('2026-10-01'), ...patch });

test('los días por defecto son los del documento: 5, 10, 15 y 20, y la revisión a los 30', () => {
    assert.deepEqual(DEFAULT_FOLLOW_UP_ALERT_DAYS, { reminders: [5, 10, 15, 20], review: 30 });
    assert.deepEqual(FOLLOW_UP_ALERT_STAGES, ['PROPUESTA_ENVIADA', 'NEGOCIACION', 'ESPERANDO_CLIENTE', 'SIN_RESPUESTA']);
});

test('la cuenta arranca con el envío de la propuesta y la reinicia cualquier gestión registrada', () => {
    assert.deepEqual(followUpSilence(lead(), [], day('2026-10-11')), { since: day('2026-10-01'), days: 10 });
    const activities = [
        { type: 'NOTA', occurredAt: day('2026-10-09') },
        { type: 'CAMBIO_ETAPA', occurredAt: day('2026-10-09') },
        { type: 'LLAMADA', occurredAt: day('2026-10-06') }
    ];
    // Una nota o un cambio de etapa no son una gestión con el cliente; una llamada sí.
    assert.equal(followUpSilence(lead(), activities, day('2026-10-11')).days, 5);
    assert.equal(followUpSilence(lead(), [{ type: 'RESPUESTA_CLIENTE', occurredAt: day('2026-10-10') }], day('2026-10-11')).days, 1);
    // Sin propuesta enviada no hay nada que esperar, y fuera de las etapas de espera tampoco.
    assert.equal(followUpSilence(lead({ proposalSentAt: null }), [], day('2026-10-11')), null);
    assert.equal(followUpSilence(lead({ stage: 'APROBADA' }), [], day('2026-10-11')), null);
    assert.equal(followUpSilence(lead({ archivedAt: day('2026-10-02') }), [], day('2026-10-11')), null);
});

test('sale el último recordatorio alcanzado, una sola vez por ciclo', () => {
    assert.equal(dueFollowUpAlert(lead(), [], day('2026-10-05')), null, 'cuatro días: todavía nada');
    const at5 = dueFollowUpAlert(lead(), [], day('2026-10-06'));
    assert.deepEqual({ kind: at5.kind, step: at5.step, days: at5.days }, { kind: 'REMINDER', step: 5, days: 5 });
    const sent = markFollowUpAlertSent(null, at5);
    assert.equal(dueFollowUpAlert(lead({ followUpAlerts: sent }), [], day('2026-10-08')), null, 'el del día 5 ya salió');
    // Si el reloj se saltó días, no se mandan los atrasados en tanda: solo el último que corresponde.
    const at12 = dueFollowUpAlert(lead(), [], day('2026-10-13'));
    assert.equal(at12.step, 10);
    assert.deepEqual(markFollowUpAlertSent(null, at12).steps, [5, 10]);
    const review = dueFollowUpAlert(lead({ followUpAlerts: markFollowUpAlertSent(null, at12) }), [], day('2026-10-31'));
    assert.deepEqual({ kind: review.kind, step: review.step }, { kind: 'REVIEW', step: 30 });
});

test('una gestión nueva abre otro ciclo: los recordatorios vuelven a contar desde ahí', () => {
    const sent = markFollowUpAlertSent(null, dueFollowUpAlert(lead(), [], day('2026-10-11')));
    const activities = [{ type: 'WHATSAPP', occurredAt: day('2026-10-12') }];
    assert.equal(dueFollowUpAlert(lead({ followUpAlerts: sent }), activities, day('2026-10-16')), null, 'cuatro días desde el WhatsApp');
    assert.equal(dueFollowUpAlert(lead({ followUpAlerts: sent }), activities, day('2026-10-17')).step, 5);
});

test('los días los fija un administrador, ordenados y con la revisión después del último recordatorio', () => {
    assert.deepEqual(normalizeFollowUpAlertDays({ reminders: [10, '3', 3, 7], review: 21 }), { value: { reminders: [3, 7, 10], review: 21 }, problem: null });
    assert.match(normalizeFollowUpAlertDays({ reminders: [], review: 30 }).problem, /al menos un recordatorio/);
    assert.match(normalizeFollowUpAlertDays({ reminders: [5, 40], review: 30 }).problem, /después del último recordatorio/);
    assert.match(normalizeFollowUpAlertDays({ reminders: [0, 5], review: 30 }).problem, /entre 1 y 90/);
    assert.match(normalizeFollowUpAlertDays({ reminders: [1, 2, 3, 4, 5, 6, 7], review: 30 }).problem, /seis recordatorios/);
    const custom = { reminders: [3], review: 7 };
    assert.equal(dueFollowUpAlert(lead(), [], day('2026-10-04'), custom).step, 3);
    assert.equal(dueFollowUpAlert(lead(), [], day('2026-10-08'), custom).kind, 'REVIEW');
});

test('el aviso dice quién, cuántos días y qué cotización, en una línea', () => {
    const base = { company: 'Café Altura', contactName: 'Laura' };
    assert.equal(followUpAlertMessage(base, { kind: 'REMINDER', days: 10 }, 'COT-0042'), 'Café Altura lleva 10 días sin responder la COT-0042. Haz seguimiento.');
    assert.equal(followUpAlertMessage({ contactName: 'Laura' }, { kind: 'REMINDER', days: 5 }, null), 'Laura lleva 5 días sin responder la propuesta. Haz seguimiento.');
    assert.equal(followUpAlertMessage(base, { kind: 'REVIEW', days: 30 }, 'COT-0042'), 'Café Altura lleva 30 días sin responder la COT-0042: revisa si sigue o se cierra.');
});
