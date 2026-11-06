import test from 'node:test';
import assert from 'node:assert/strict';
import * as declared from '../src/lib/declaredTime.js';

test('la pregunta conserva el descriptor personal exacto entregado por el servidor', () => {
  const events = [];
  globalThis.window = { dispatchEvent: event => events.push(event) };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init.detail; } };
  const descriptor = { memberId: 'ana', revision: 8, completedAt: '2026-11-05T16:00:00Z' };
  try {
    declared.askDeclaredTimeIfNeeded({ id: 'task', title: 'Campaña', needsDeclaredTime: true, declaredTimeParticipant: descriptor });
    assert.deepEqual(events[0].detail.declaredTimeParticipant, descriptor);
  } finally { delete globalThis.window; delete globalThis.CustomEvent; }
});

test('el tiempo declarado personal envía identidad y revisión; el legado conserva su contrato', () => {
  assert.equal(typeof declared.declaredTimePayload, 'function');
  assert.deepEqual(declared.declaredTimePayload({ declaredTimeParticipant: { memberId: 'ana', revision: 8 } }, 30), {
    minutes: 30, participantMemberId: 'ana', expectedRevision: 8
  });
  assert.deepEqual(declared.declaredTimePayload({}, 15), { minutes: 15 });
});
