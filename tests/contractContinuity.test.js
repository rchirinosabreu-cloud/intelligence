import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clientOperationalNotices } from '../src/lib/clientOperationalNotices.js';
import { contractCycleAlerts } from '../src/lib/contractCycleAlerts.js';
import { unbackedWork, unbackedWorkNoticeText } from '../src/lib/unbackedWork.js';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('no renovar no le quita a Dirección ni a Administración la decisión de suspender por cartera', () => {
  const panel = /function Suspension\(\{ client, onOpen \}\) \{([\s\S]*?)const monthLabel/.exec(source('src/components/modules/Clients/operations/ClientOperationPage.jsx'))[1];
  assert.doesNotMatch(panel, /renewalDecision/);
});

test('un fallo al guardar la decisión deja el error real del servidor en la consola', () => {
  assert.match(source('src/components/modules/Clients/operations/ContractContinuityDecision.jsx'), /catch \(error\) \{\s+console\.error\([^)]*error\.response\?\.data \|\| error\);\s+setFailure\(error\.message\);/);
});

const contract = { id: 'contract-a', status: 'ACTIVO', startDate: '2026-01-19', endDate: '2026-11-18', cutDay: 1, monthlyReport: true };
const client = { id: 'client-a', name: 'Cliente ficticio', slug: 'cliente-ficticio', contracts: [contract] };

test('tras finalizar sin renovar, el trabajo restante pide resolver entregas, no otra renovación', () => {
  const finding = unbackedWork({ contract: { ...contract, renewalDecision: 'NO_RENOVAR' }, work: { openTasks: 2, plans: ['noviembre'] } }, '2026-11-19');
  assert.ok(finding);
  assert.match(unbackedWorkNoticeText('Cuenta', finding), /pendientes/);
  assert.doesNotMatch(unbackedWorkNoticeText('Cuenta', finding), /renueva|autoriza seguir/);
});

test('no renovar retira continuidad y renovación, pero conserva cierre e informe', () => {
  const decided = { ...contract, renewalDecision: 'NO_RENOVAR' };
  const notices = clientOperationalNotices({ ...client, contracts: [decided] }, '2026-11-16', { isPm: true, riskOn: '2026-11-10' });
  assert.deepEqual(notices.map(n => n.kind), ['OPERACION_CICLO']);
  assert.match(notices[0].message, /informe sigue pendiente/);
  assert.deepEqual(contractCycleAlerts(decided, '2026-11-16').map(n => n.step), ['REVISION', 'INFORME', 'FACTURACION']);
});

test('la decisión no oculta una suspensión aplicada ni la revisión del cierre', () => {
  const notices = clientOperationalNotices({ ...client, contracts: [{ ...contract, renewalDecision: 'NO_RENOVAR' }] }, '2026-11-18', {
    isPm: true, suspension: { id: 'suspension', fromCycle: '2026-12', liftedAt: null },
  });
  assert.deepEqual(notices.map(n => n.kind), ['OPERACION_SUSPENSION', 'OPERACION_CICLO']);
});

test('una renovación nueva no hereda la decisión del contrato anterior', () => {
  const next = { ...contract, id: 'contract-b', startDate: '2026-11-19', endDate: '2026-12-18' };
  const notices = clientOperationalNotices({ ...client, contracts: [{ ...contract, renewalDecision: 'NO_RENOVAR' }, next] }, '2026-12-06', { isPm: true, riskOn: '2026-12-10' });
  assert.ok(notices.some(n => n.kind === 'OPERACION_RENOVACION'));
  assert.ok(notices.some(n => n.kind === 'OPERACION_CONTINUIDAD'));
});

test('la respuesta de la banda identifica el contrato y su revisión completa', () => {
  const updatedAt = new Date('2026-11-06T15:00:00Z');
  const notices = clientOperationalNotices({ ...client, contracts: [{ ...contract, updatedAt }] }, '2026-11-06', { isPm: true, riskOn: '2026-11-10' });
  for (const notice of notices.filter(n => ['OPERACION_RENOVACION', 'OPERACION_CONTINUIDAD'].includes(n.kind))) {
    assert.deepEqual(notice.continuity, { contractId: contract.id, endDate: contract.endDate, expectedUpdatedAt: updatedAt.toISOString() });
  }
});
