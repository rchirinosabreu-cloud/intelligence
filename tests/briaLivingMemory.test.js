import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseBria, sourceVisible, publicEvidence, reconcileSignals, changeSignalState } from '../src/lib/briaLivingMemory.js';
import { runAssistant } from '../src/lib/briaAssistant.js';

const admin = { id: 'a', role: 'ADMIN', modulePermissions: { bria: true } };
const pm = { id: 'p', role: 'PROJECT_MANAGER', modulePermissions: { bria: true } };
test('Bria requires activation and an eligible role, even when another permission is set', () => {
  assert.equal(canUseBria(admin), true);
  assert.equal(canUseBria({ ...pm, modulePermissions: {} }), false);
  assert.equal(canUseBria({ ...admin, modulePermissions: { bria: false } }), false);
  assert.equal(canUseBria({ ...admin, role: 'EDITOR' }), false);
  assert.equal(canUseBria({ ...admin, isActive: false }), false);
});
test('unknown permissions are restricted to research admin; explicit grants never expose secrets', () => {
  const row = { id: 'drive:x', status: 'indexed', audience: 'research_admin' };
  assert.equal(sourceVisible(row, admin), true);
  assert.equal(sourceVisible(row, pm), false);
  assert.equal(sourceVisible({ ...row, allowedUserIds: ['p'] }, pm), true);
  assert.equal(sourceVisible({ ...row, status: 'private_review_required' }, admin), false);
  assert.equal(sourceVisible(row, { ...admin, modulePermissions: {} }), false);
});
test('evidence is historical unless verified for an explicit period; paths and permission internals never leave the server', () => {
  const row = { id: 'x', title: 'Brief', date: '2026-10-07', body: 'texto', path: 'C:/secret', digest: 'abc', allowedUserIds: ['a'], status: 'indexed' };
  const publicRow = publicEvidence(row);
  assert.equal(publicRow.authority, 'Referencia documental; vigencia por confirmar');
  assert.equal(publicRow.path, undefined);
  assert.equal(publicRow.allowedUserIds, undefined);
  assert.equal(publicEvidence({ ...row, confirmed: true, validFrom: '2026-10-01', validTo: '2026-10-31' }, '2026-10-07').authority, 'Confirmada para este periodo');
  assert.match(publicEvidence({ ...row, confirmed: true, validFrom: '2026-09-01', validTo: '2026-09-30' }, '2026-10-07').authority, /confirmar/);
});
test('resolving a signal persists across identical scans and changed evidence reopens it', () => {
  const fact = { id: 'f', title: 'Validar alcance', evidenceVersion: 'v1', sourceIds: ['x'], status: 'OPEN' };
  const first = reconcileSignals([], [fact]);
  const closed = changeSignalState(first, 'f', 'RESOLVED');
  assert.equal(reconcileSignals(closed, [fact])[0].status, 'RESOLVED');
  assert.equal(reconcileSignals(closed, [{ ...fact, evidenceVersion: 'v2' }])[0].status, 'OPEN');
  const archived = changeSignalState(closed, 'f', 'ARCHIVED');
  assert.equal(reconcileSignals(archived, [{ ...fact, evidenceVersion: 'v2' }])[0].status, 'ARCHIVED');
  assert.throws(() => changeSignalState(first, 'f', 'PUBLISHED'), /Estado/);
});
test('a partial scan never resolves a signal outside its scope', () => {
  const old = [{ id: 'outside', status: 'OPEN', evidenceVersion: '1' }];
  assert.equal(reconcileSignals(old, [])[0].status, 'OPEN');
});
test('revocation during a model response prevents the requested tool from reading anything', async () => {
  let revoked = false;
  let reads = 0;
  await assert.rejects(() => runAssistant({
    user: admin, person: { name: 'Persona' }, question: 'consulta', today: '2026-10-07',
    ai: { generate: async () => { revoked = true; return { functionCalls: [{ id: 'c', name: 'read', args: {} }] }; } },
    tools: [{ name: 'read', allowed: () => true, run: async () => { reads += 1; return { data: {} }; } }],
    context: { revalidate: async () => { if (revoked) throw Object.assign(new Error('Revocada'), { status: 401 }); } }
  }), { status: 401 });
  assert.equal(reads, 0);
});
