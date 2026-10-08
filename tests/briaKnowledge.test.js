import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLearning, learningVisible, learningUsable, learningKey } from '../src/lib/briaKnowledge.js';
const admin = { ref: 'a', role: 'ADMIN' };
test('a learning has explicit scope, meaning and valid calendar dates', () => {
  const row = validateLearning({ scope: 'ACCOUNT', entity: 'Endova', topic: 'aprobación final', text: 'La aprobación requiere confirmar responsable.', kind: 'PROPOSAL', validFrom: '2026-10-07' });
  assert.equal(row.kind, 'PROPOSAL');
  assert.equal(row.validFrom, '2026-10-07');
  assert.throws(() => validateLearning({ ...row, validFrom: '2026-02-30' }), /fecha/i);
  assert.throws(() => validateLearning({ ...row, validFrom: '2026-13-01' }), { status: 400 });
  assert.throws(() => validateLearning({ ...row, validUntil: '2026-10-06' }), /vigencia/i);
  assert.equal(learningKey('  APROBACIÓN   final '), 'aprobacion final');
});
test('personal knowledge never leaks to another user, including admins', () => {
  assert.equal(learningVisible({ scope: 'PERSONAL', subjectRef: 'p' }, admin), false);
  assert.equal(learningVisible({ scope: 'PERSONAL', subjectRef: 'a' }, admin), true);
  assert.equal(learningVisible({ scope: 'ACCOUNT', entity: 'c' }, { ref: 'p', role: 'PROJECT_MANAGER', accountIds: [] }), false);
});
test('proposals, expired, future and revoked records cannot become confirmed current facts', () => {
  const base = { kind: 'CONFIRMED', status: 'ACTIVE', validFrom: '2026-10-07', validUntil: '2026-10-31' };
  assert.equal(learningUsable(base, '2026-10-07'), true);
  for (const row of [{ ...base, kind: 'PROPOSAL' }, { ...base, status: 'REVOKED' }, { ...base, validFrom: '2026-11-01' }, { ...base, validUntil: '2026-10-06' }]) assert.equal(learningUsable(row, '2026-10-07'), false);
});
test('credentials are rejected as business learnings', () => {
  assert.throws(() => validateLearning({ scope: 'AGENCY', topic: 'clave', text: 'password=private-secret', kind: 'CONFIRMED', validFrom: '2026-10-07' }), /credenciales/i);
});
