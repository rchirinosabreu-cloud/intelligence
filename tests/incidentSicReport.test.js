import test from 'node:test';
import assert from 'node:assert/strict';
import { GOVERNANCE_FORMS, sicReportStatus, validateRecord } from '../src/lib/aiGovernance.js';

// Reporte de incidentes a la SIC (27 de septiembre de 2026): si un incidente compromete datos
// personales, se reporta dentro de los 15 días hábiles siguientes a su detección.

const incident = (data = {}, status = 'OPEN') => ({
    name: 'Fuga por herramienta no autorizada',
    status,
    data: {
        description: 'Se pegó una base de clientes en una cuenta gratuita.', ownerId: 'u-admin', severity: 'HIGH',
        detectedAt: '2026-09-28T09:00', impact: 'Confidencialidad de datos de contacto.', recipientEmail: 'cliente@empresa.co', ...data
    }
});
const NOW = new Date('2026-10-02T15:00:00Z');

test('el formulario de incidentes pregunta por datos personales y por el reporte a la SIC', () => {
    const keys = GOVERNANCE_FORMS.incidents.fields.map((f) => f.key);
    for (const key of ['personalData', 'sicReportedAt', 'sicReportEvidence']) assert.ok(keys.includes(key), `falta ${key}`);
    assert.deepEqual(GOVERNANCE_FORMS.incidents.fields.find((f) => f.key === 'personalData').options, ['SI', 'NO']);
});

test('con datos personales, el reporte a la SIC vence a los 15 hábiles de la detección', () => {
    const { data } = validateRecord('incidents', incident({ personalData: 'SI' }), { now: NOW });
    const status = sicReportStatus(data, NOW);
    assert.equal(status.required, true);
    assert.equal(status.dueOn, '2026-10-20', 'salta el festivo del 12 de octubre');
    assert.equal(status.daysLeft, 11, 'del viernes 2 al martes 20 de octubre, sin el festivo del 12');
    assert.equal(status.overdue, false);

    const late = sicReportStatus(data, new Date('2026-10-22T15:00:00Z'));
    assert.equal(late.overdue, true);
});

test('sin datos personales o sin responder la pregunta no hay plazo SIC', () => {
    assert.equal(sicReportStatus(validateRecord('incidents', incident({ personalData: 'NO' }), { now: NOW }).data, NOW).required, false);
    assert.equal(sicReportStatus(validateRecord('incidents', incident(), { now: NOW }).data, NOW).required, false);
});

test('un reporte hecho no vence y se sabe si fue tardío', () => {
    const { data } = validateRecord('incidents', incident({ personalData: 'SI', sicReportedAt: '2026-10-01T10:00', sicReportEvidence: 'Radicado 26-123456' }), { now: NOW });
    const status = sicReportStatus(data, new Date('2026-11-30T15:00:00Z'));
    assert.equal(status.overdue, false);
    assert.equal(status.reportedLate, false);
});

test('cerrar un incidente exige decir si hubo datos personales y, si los hubo, el radicado de la SIC', () => {
    const closing = { personalData: 'SI', notifiedAt: '2026-09-28T12:00', notificationEvidence: 'Correo 28/09', containment: 'x', recovery: 'x', rootCause: 'x', remediation: 'x', finalReportEvidence: 'x', lessons: 'x' };
    assert.throws(() => validateRecord('incidents', incident({ ...closing, personalData: undefined }, 'CLOSED'), { now: NOW }), /datos personales/i);
    assert.throws(() => validateRecord('incidents', incident(closing, 'CLOSED'), { now: NOW }), /SIC/);
    assert.ok(validateRecord('incidents', incident({ ...closing, sicReportedAt: '2026-10-01T10:00', sicReportEvidence: 'Radicado 26-123456' }, 'CLOSED'), { now: NOW }));
    assert.ok(validateRecord('incidents', incident({ ...closing, personalData: 'NO' }, 'CLOSED'), { now: NOW }));
    assert.throws(() => validateRecord('incidents', incident({ personalData: 'SI', sicReportedAt: '2026-09-27T10:00', sicReportEvidence: 'x' }), { now: NOW }), /SIC/);
});
