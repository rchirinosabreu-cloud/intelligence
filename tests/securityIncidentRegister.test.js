import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOVERNANCE_FORMS, INCIDENT_TYPES, INCIDENT_TYPE_LABELS, INCIDENT_REPORT_LIMITS,
  incidentNoticeRequired, validateRecord, validateIncidentReport
} from '../src/lib/aiGovernance.js';

// Registro único de incidentes de seguridad (12 de octubre de 2026): no todo incidente es de IA
// ni afecta a un cliente. Un teléfono perdido sin datos de clientes o un intento de phishing en
// el que nadie cayó tienen que poder registrarse con honestidad.

const NOW = new Date('2026-10-02T15:00:00Z');
const base = (data = {}, status = 'OPEN') => ({
  name: 'Teléfono perdido', status,
  data: { description: 'Se perdió un teléfono del equipo.', ownerId: 'u-admin', severity: 'LOW', detectedAt: '2026-09-28T09:00', impact: 'Ninguno conocido.', incidentType: 'DEVICE_LOSS', affectsClient: 'NO', ...data }
});

test('el formulario pregunta el tipo y si afecta a un cliente, con las opciones acordadas', () => {
  const fields = Object.fromEntries(GOVERNANCE_FORMS.incidents.fields.map((f) => [f.key, f]));
  assert.deepEqual(INCIDENT_TYPES, ['AI_USE', 'DEVICE_LOSS', 'SOCIAL_ENGINEERING', 'UNAUTHORIZED_ACCESS', 'MISDIRECTED_SEND', 'SERVICE_OUTAGE', 'MALWARE', 'OTHER']);
  assert.deepEqual(INCIDENT_TYPES.map((t) => INCIDENT_TYPE_LABELS[t]), ['Uso de IA', 'Pérdida o robo de equipo', 'Ingeniería social', 'Acceso indebido', 'Envío a destinatario equivocado', 'Caída de servicio', 'Malware', 'Otro']);
  assert.equal(fields.incidentType.label, 'Tipo');
  assert.equal(fields.incidentType.required, true);
  assert.deepEqual(fields.incidentType.options, INCIDENT_TYPES);
  assert.equal(fields.affectsClient.label, '¿Afecta a un cliente?');
  assert.equal(fields.affectsClient.required, true);
  assert.deepEqual(fields.affectsClient.options, ['SI', 'NO']);
  // El correo y el aviso al cliente solo existen cuando afecta a un cliente.
  for (const key of ['recipientEmail', 'notifiedAt', 'notificationEvidence']) assert.deepEqual(fields[key].onlyIf, ['affectsClient', 'SI'], key);
  assert.equal(fields.recipientEmail.required, false);
});

test('un incidente sin cliente se registra sin correo contractual y no tiene plazo de aviso', () => {
  const { data } = validateRecord('incidents', base(), { now: NOW });
  assert.equal(data.affectsClient, 'NO');
  assert.equal(incidentNoticeRequired(data), false);
});

test('el correo, el aviso y su evidencia no se guardan si no afecta a un cliente', () => {
  const { data } = validateRecord('incidents', base({ recipientEmail: 'x@empresa.co', notifiedAt: '2026-09-28T10:00', notificationEvidence: 'Correo' }), { now: NOW });
  assert.equal(data.recipientEmail, undefined);
  assert.equal(data.notifiedAt, undefined);
  assert.equal(data.notificationEvidence, undefined);
});

test('si afecta a un cliente, el correo contractual es obligatorio', () => {
  assert.throws(() => validateRecord('incidents', base({ affectsClient: 'SI' }), { now: NOW }), /Correo contractual/);
  const { data } = validateRecord('incidents', base({ affectsClient: 'SI', recipientEmail: 'cliente@empresa.co' }), { now: NOW });
  assert.equal(incidentNoticeRequired(data), true);
});

test('el tipo y la respuesta sobre el cliente son obligatorios en un registro nuevo', () => {
  assert.throws(() => validateRecord('incidents', base({ incidentType: '' }), { now: NOW }), /Tipo/);
  assert.throws(() => validateRecord('incidents', base({ incidentType: 'PHISHING' }), { now: NOW }), /Tipo/);
  assert.throws(() => validateRecord('incidents', base({ affectsClient: '' }), { now: NOW }), /Afecta a un cliente/);
  assert.throws(() => validateRecord('incidents', base({ affectsClient: 'NO_SE' }), { now: NOW }), /Afecta a un cliente/);
});

test('un incidente anterior al cambio sigue funcionando: con correo se entiende que afecta a un cliente y que fue de IA', () => {
  const legacy = { name: 'Fuga', status: 'OPEN', data: { description: 'x', ownerId: 'u', severity: 'HIGH', detectedAt: '2026-09-28T09:00', impact: 'x', recipientEmail: 'cliente@empresa.co' } };
  const { data } = validateRecord('incidents', legacy, { now: NOW });
  assert.equal(data.affectsClient, 'SI');
  assert.equal(data.incidentType, 'AI_USE');
  assert.equal(incidentNoticeRequired(data), true);
  // Una fila guardada antes del cambio (sin los campos nuevos) sigue exigiendo el aviso.
  assert.equal(incidentNoticeRequired({ recipientEmail: 'cliente@empresa.co' }), true);
  assert.equal(incidentNoticeRequired({}), true, 'sin datos, se asume el caso más exigente');
  // Lo que reportó el equipo con «No sé» también se trata como posible aviso hasta que administración decida.
  assert.equal(incidentNoticeRequired({ affectsClient: 'NO_SE' }), true);
});

test('cerrar un incidente sin cliente no exige el aviso; con cliente sí', () => {
  const closing = { containment: 'x', recovery: 'x', rootCause: 'x', remediation: 'x', finalReportEvidence: 'x', lessons: 'x', personalData: 'NO' };
  assert.ok(validateRecord('incidents', base(closing, 'CLOSED'), { now: NOW }));
  assert.throws(() => validateRecord('incidents', base({ ...closing, affectsClient: 'SI', recipientEmail: 'c@empresa.co' }, 'CLOSED'), { now: NOW }), /Aviso enviado/);
  assert.ok(validateRecord('incidents', base({ ...closing, affectsClient: 'SI', recipientEmail: 'c@empresa.co', notifiedAt: '2026-09-28T12:00', notificationEvidence: 'Correo 28/09' }, 'CLOSED'), { now: NOW }));
});

test('los datos de quien reportó no se pueden escribir desde el formulario de administración', () => {
  for (const key of ['reportedById', 'reportedByName', 'reportedAt', 'reportSource']) {
    assert.throws(() => validateRecord('incidents', base({ [key]: 'forjado' }), { now: NOW }), /no permitido/);
  }
});

test('el reporte del equipo pide lo mínimo y no acepta nada más', () => {
  const ok = validateIncidentReport({ description: '  Me escribieron fingiendo ser el banco.  ', affectsClient: 'NO_SE' }, { now: NOW });
  assert.deepEqual(ok, { description: 'Me escribieron fingiendo ser el banco.', occurredAt: null, affectsClient: 'NO_SE', clientId: null });
  const full = validateIncidentReport({ description: 'Perdí el portátil', occurredAt: '2026-10-01T18:30', affectsClient: 'SI', clientId: 'c-1' }, { now: NOW });
  assert.equal(full.occurredAt, '2026-10-01T23:30:00.000Z');
  assert.equal(full.clientId, 'c-1');
  assert.throws(() => validateIncidentReport({ affectsClient: 'NO' }, { now: NOW }), /Cuéntanos qué pasó/);
  assert.throws(() => validateIncidentReport({ description: '   ', affectsClient: 'NO' }, { now: NOW }), /Cuéntanos qué pasó/);
  assert.throws(() => validateIncidentReport({ description: 'x'.repeat(INCIDENT_REPORT_LIMITS.description + 1), affectsClient: 'NO' }, { now: NOW }), /caracteres/);
  assert.throws(() => validateIncidentReport({ description: 'x', affectsClient: 'TAL_VEZ' }, { now: NOW }), /cliente/);
  assert.throws(() => validateIncidentReport({ description: 'x' }, { now: NOW }), /cliente/);
  assert.throws(() => validateIncidentReport({ description: 'x', affectsClient: 'NO', occurredAt: '2026-10-03T10:00' }, { now: NOW }), /futur/);
  assert.throws(() => validateIncidentReport({ description: 'x', affectsClient: 'NO', severity: 'LOW' }, { now: NOW }), /no permitido/);
  assert.throws(() => validateIncidentReport({ description: 'x', affectsClient: 'NO', detectedAt: '2026-09-01T10:00' }, { now: NOW }), /no permitido/);
  assert.throws(() => validateIncidentReport({ description: 'x', affectsClient: 'NO', clientId: 42 }, { now: NOW }), /cliente/);
  assert.throws(() => validateIncidentReport(null, { now: NOW }), /Datos/);
});
