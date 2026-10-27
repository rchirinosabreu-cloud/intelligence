import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DECISION_GAP_MS, FOLLOW_UP_CHANNELS, NOTICE_LEVELS, REVIEW_OUTCOMES, SNOOZE_OPTIONS, followUpNoticeText, pickCurrentNotice, snoozeUntil
} from '../src/lib/importantNotices.js';

// El segundo nivel de avisos (Rodny, 26 de octubre de 2026): una banda abajo, de borde a borde, con un aviso a la vez.
// «Si hay otra notificación, aparecerá cinco minutos después de haber tomado una decisión con la anterior, no saldrán
// al tiempo.» Verde para el seguimiento; salmón solo para lo más importante.

const at = (iso) => new Date(iso);
const notice = (patch = {}) => ({
    id: 'n1', level: 'SEGUIMIENTO', createdAt: at('2026-10-26T14:00:00Z'), snoozedUntil: null, decidedAt: null, resolvedAt: null, ...patch
});

test('dos niveles: seguimiento en verde e importante en salmón', () => {
    assert.deepEqual(Object.keys(NOTICE_LEVELS), ['IMPORTANTE', 'SEGUIMIENTO']);
    assert.equal(NOTICE_LEVELS.SEGUIMIENTO.color, 'green');
    assert.equal(NOTICE_LEVELS.IMPORTANTE.color, 'coral');
});

test('sale uno solo: primero lo importante y, a igual nivel, el más antiguo', () => {
    const now = at('2026-10-26T15:00:00Z');
    const list = [
        notice({ id: 'viejo', createdAt: at('2026-10-26T13:00:00Z') }),
        notice({ id: 'nuevo', createdAt: at('2026-10-26T14:30:00Z') }),
        notice({ id: 'revision', level: 'IMPORTANTE', createdAt: at('2026-10-26T14:50:00Z') })
    ];
    assert.equal(pickCurrentNotice(list, null, now).notice.id, 'revision');
    assert.equal(pickCurrentNotice(list.slice(0, 2), null, now).notice.id, 'viejo');
    assert.deepEqual(pickCurrentNotice([], null, now), { notice: null, nextAt: null });
});

test('después de decidir, el siguiente espera cinco minutos', () => {
    assert.equal(DECISION_GAP_MS, 5 * 60 * 1000);
    const decided = at('2026-10-26T15:00:00Z');
    const waiting = pickCurrentNotice([notice()], decided, at('2026-10-26T15:03:00Z'));
    assert.equal(waiting.notice, null);
    assert.equal(waiting.nextAt.toISOString(), '2026-10-26T15:05:00.000Z');
    assert.equal(pickCurrentNotice([notice()], decided, at('2026-10-26T15:05:00Z')).notice.id, 'n1');
});

test('un aviso pospuesto vuelve a su hora, y esa hora es la próxima vez que hay que mirar', () => {
    const now = at('2026-10-26T15:00:00Z');
    const snoozed = notice({ snoozedUntil: at('2026-10-26T15:10:00Z') });
    const result = pickCurrentNotice([snoozed], null, now);
    assert.equal(result.notice, null);
    assert.equal(result.nextAt.toISOString(), '2026-10-26T15:10:00.000Z');
    assert.equal(pickCurrentNotice([snoozed], null, at('2026-10-26T15:10:00Z')).notice.id, 'n1');
    // Lo resuelto no vuelve nunca.
    assert.equal(pickCurrentNotice([notice({ resolvedAt: now })], null, now).notice, null);
});

test('«Recordarme»: en 10 minutos, en 1 hora o mañana a las 8:00 de Bogotá', () => {
    assert.deepEqual(SNOOZE_OPTIONS.map((option) => option.label), ['En 10 minutos', 'En 1 hora', 'Mañana a las 8:00']);
    const now = at('2026-10-26T22:30:00Z'); // 5:30 p. m. en Bogotá
    assert.equal(snoozeUntil('10m', now).toISOString(), '2026-10-26T22:40:00.000Z');
    assert.equal(snoozeUntil('1h', now).toISOString(), '2026-10-26T23:30:00.000Z');
    assert.equal(snoozeUntil('tomorrow', now).toISOString(), '2026-10-27T13:00:00.000Z');
    // A las 11 p. m. de Bogotá ya es otro día en UTC: «mañana» sigue siendo el día siguiente de Bogotá.
    assert.equal(snoozeUntil('tomorrow', at('2026-10-27T04:00:00Z')).toISOString(), '2026-10-27T13:00:00.000Z');
    assert.equal(snoozeUntil('nunca', now), null);
});

test('«¿Cómo hiciste el seguimiento?»: cada opción es una gestión con el cliente del CRM', () => {
    assert.deepEqual(FOLLOW_UP_CHANNELS.map((channel) => [channel.value, channel.label]), [
        ['WHATSAPP', 'WhatsApp'], ['LLAMADA', 'Llamada'], ['CORREO', 'Correo'], ['REUNION', 'Reunión'], ['RESPUESTA_CLIENTE', 'El cliente respondió']
    ]);
});

test('el aviso dice quién, cuántos días y qué cotización, sin la orden del final', () => {
    const lead = { company: 'Café Altura' };
    assert.deepEqual(followUpNoticeText(lead, { kind: 'REMINDER', days: 10 }, 'COT-0042'), {
        kind: 'CRM_FOLLOW_UP', level: 'SEGUIMIENTO', label: 'Seguimiento comercial', message: 'Café Altura lleva 10 días sin responder la COT-0042'
    });
    assert.deepEqual(followUpNoticeText({ contactName: 'Laura' }, { kind: 'REVIEW', days: 30 }, null), {
        kind: 'CRM_REVIEW', level: 'IMPORTANTE', label: 'Revisión · 30 días', message: 'Laura lleva 30 días sin responder: ¿sigue o no?'
    });
});

test('«No sigue» ofrece las dos etapas de cierre del CRM: perdida o descartada', () => {
    assert.deepEqual(REVIEW_OUTCOMES.map((outcome) => [outcome.value, outcome.label]), [['PERDIDO', 'Perdida'], ['DESCARTADO', 'Descartada']]);
});
