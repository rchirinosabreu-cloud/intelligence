import test from 'node:test';
import assert from 'node:assert/strict';
const domain = await import('../src/lib/aiGovernance.js').catch(() => ({}));
const now = new Date('2026-09-23T15:00:00Z');

test('un mes de aviso respeta fin de mes y la hora de Bogotá', () => {
  assert.equal(typeof domain.addNoticeMonth, 'function');
  assert.equal(domain.addNoticeMonth('2026-01-31T10:00').toISOString(), '2026-02-28T15:00:00.000Z');
});
test('fechas imposibles y zona ambigua no se aceptan', () => {
  assert.equal(typeof domain.parseGovernanceDate, 'function');
  assert.throws(() => domain.parseGovernanceDate('2026-02-30T10:00'));
  assert.throws(() => domain.parseGovernanceDate('yesterday'));
});
test('el plazo de incidente usa el primer instante conocido, no la fecha de registro', () => {
  assert.equal(typeof domain.incidentDeadline, 'function');
  assert.equal(domain.incidentDeadline({ occurredAt: '2026-09-22T09:00', detectedAt: '2026-09-23T09:00' }).toISOString(), '2026-09-23T14:00:00.000Z');
  assert.equal(domain.incidentDeadline({ detectedAt: '2026-09-23T09:00' }).toISOString(), '2026-09-24T14:00:00.000Z');
});
test('no se cierra un incidente sin comunicación, remediación y aprendizaje', () => {
  assert.equal(typeof domain.validateRecord, 'function');
  assert.throws(() => domain.validateRecord('incidents', { name: 'Exposición', status: 'CLOSED', data: { ownerId: 'u', description: 'Datos expuestos', detectedAt: '2026-09-22T09:00', severity: 'HIGH', impact: 'Confidencialidad', recipientEmail: 'contacto@example.invalid' } }, { now }), /notific|contención|recuperación/i);
});
test('un sistema aprobado exige condiciones documentadas del proveedor', () => {
  assert.equal(typeof domain.validateRecord, 'function');
  assert.throws(() => domain.validateRecord('systems', { name: 'Prueba', status: 'APPROVED', data: { provider: 'openai', model: 'modelo', purpose: 'Revisión', ownerId: 'u', systemType: 'GENERATIVE' } }, { now }), /datos|región|retención|evidencia/i);
});
test('campos desconocidos y claves de prototipo se rechazan', () => {
  assert.equal(typeof domain.validateRecord, 'function');
  assert.throws(() => domain.validateRecord('systems', { name: 'Prueba', data: { unexpected: 'x' } }, { now }));
  assert.throws(() => domain.validateRecord('__proto__', {}, { now }));
});
test('el riesgo residual no se inventa ni admite valores fuera de escala', () => {
  assert.equal(typeof domain.riskScore, 'function');
  assert.equal(domain.riskScore({ probability: 3, impact: 4 }), 12);
  assert.throws(() => domain.riskScore({ probability: 0, impact: 4 }));
  assert.throws(() => domain.riskScore({ probability: '3x', impact: 4 }));
});

const system = { id: 's', version: 2, status: 'APPROVED', data: { provider: 'openai', model: 'model-test' } };
const risk = { id: 'r', version: 1, status: 'MITIGATED', systemId: 's', clientId: 'c', data: { residualProbability: 1, residualImpact: 2 } };
const authorization = { id: 'a', clientId: 'c', systemId: 's', riskId: 'r', status: 'APPROVED', data: { useCase: 'parrillas.review', dataClasses: ['CONFIDENTIAL'], systemVersion: 2, riskVersion: 1, noticeAt: '2026-08-01T10:00', approvedAt: '2026-08-10T10:00', startsAt: '2026-09-01T10:00', expiresAt: '2026-12-01T10:00', evidenceRef: 'Expediente privado A', noticeEvidenceRef: 'Correo archivado B' } };
const context = { clientId: 'c', provider: 'openai', model: 'model-test', useCase: 'parrillas.review', dataClasses: ['CONFIDENTIAL'] };

test('horas desbordadas y booleanos no se normalizan silenciosamente', () => {
  assert.throws(() => domain.parseGovernanceDate('2026-09-23T24:00'));
  assert.throws(() => domain.riskScore({ probability: true, impact: 1 }));
});
test('solo permite alcance, versiones y vigencia exactos', () => {
  assert.equal(typeof domain.authorizationDecision, 'function');
  assert.equal(domain.authorizationDecision({ authorization, system, risk, context, now }).allowed, true);
});
for (const [name, alter] of [
  ['sin autorización', args => ({ ...args, authorization: null })],
  ['cliente distinto', args => ({ ...args, context: { ...context, clientId: 'otro' } })],
  ['modelo distinto', args => ({ ...args, context: { ...context, model: 'otro' } })],
  ['datos no autorizados', args => ({ ...args, context: { ...context, dataClasses: ['RESTRICTED'] } })],
  ['revocada', args => ({ ...args, authorization: { ...authorization, status: 'REVOKED' } })],
  ['vencida', args => ({ ...args, now: new Date('2027-01-01') })],
  ['sin mes de aviso', args => ({ ...args, authorization: { ...authorization, data: { ...authorization.data, noticeAt: '2026-08-31T10:00' } } })],
  ['proveedor cambiado', args => ({ ...args, system: { ...system, version: 3 } })],
  ['riesgo cambiado', args => ({ ...args, risk: { ...risk, version: 2 } })],
  ['sistema suspendido', args => ({ ...args, system: { ...system, status: 'SUSPENDED' } })]
]) test(`bloquea ${name}`, () => {
  assert.equal(typeof domain.authorizationDecision, 'function');
  assert.equal(domain.authorizationDecision(alter({ authorization, system, risk, context, now })).allowed, false);
});
