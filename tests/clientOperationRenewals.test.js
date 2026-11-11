import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientOperationsService } from '../src/services/clientOperationsService.js';

const contract = (id, startDate, quantity, extra = {}) => ({ id, serviceType: 'PARRILLA', status: 'ACTIVO', startDate, endDate: null, cutDay: 1,
  deliverables: [{ format: 'Post', quantity }], monthlyReport: false, storiesPerWeek: 0, productionDays: 0, createdAt: new Date(`${startDate}T12:00:00Z`), ...extra });
const pieces = (month, quantity) => Array.from({ length: quantity }, (_, index) => ({ id: `piece-${month}-${index}`, status: 'PUBLICADO',
  publishDate: new Date(`2026-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}T12:00:00Z`), format: 'Post', objective: 'Contenido de prueba', copyText: 'Texto', captionText: '', _count: { finalAssets: 1 }, publications: [] }));

function fixture(contracts, { today = '2026-11-05', beforeTransaction = null } = {}) {
  const row = { id: 'client-renewal-test', slug: 'client-renewal-test', name: 'Cuenta de prueba', isArchived: false, contracts: structuredClone(contracts),
    observations: [], monthlyReports: [], monthlyCloses: [], externalPlanSnapshots: [], nativeTasks: [], workAuthorizations: [],
    contentPlans: [7, 8, 9, 10, 11, 12].map(month => ({ id: `plan-${month}`, year: 2026, month, contentItems: pieces(month, month >= 11 ? 4 : 10) })) };
  const writes = [];
  const read = args => {
    const result = structuredClone(row);
    // El doble sí representa take/select: una prueba no debe devolver contratos que la consulta no pidió.
    const selection = args.select?.contracts;
    if (selection) {
      result.contracts.sort((a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt - a.createdAt);
      if (selection.take) result.contracts = result.contracts.slice(0, selection.take);
      if (selection.select) result.contracts = result.contracts.map(item => Object.fromEntries(Object.keys(selection.select).map(key => [key, item[key]])));
    }
    return result;
  };
  const db = {
    client: { findMany: async args => [read(args)], findFirst: async args => read(args), update: async args => { writes.push(['client', args]); return row; } },
    user: { findMany: async () => [] },
    clientContract: {
      update: async args => { writes.push(['contract', args]); Object.assign(row.contracts.find(item => item.id === args.where.id), args.data); return args.data; },
      create: async args => { writes.push(['renewal', args]); const created = { id: 'new-renewal', ...args.data, createdAt: new Date(`${today}T12:00:00Z`) }; row.contracts.push(created); return created; },
    },
    clientMonthlyClose: { create: async args => { writes.push(['close', args]); row.monthlyCloses.push({ id: 'close-test', ...args.data, closedAt: new Date(`${today}T17:00:00Z`) }); return args.data; } },
    $transaction: async run => { beforeTransaction?.(row); return run(db); },
  };
  return { row, writes, service: createClientOperationsService({ db, now: () => new Date(`${today}T17:00:00Z`) }) };
}

test('renovar de doce a cuatro conserva el mes anterior con sus doce contenidos', async () => {
  const { service, writes } = fixture([contract('old', '2026-01-01', 12, { endDate: '2026-10-31' }), contract('new', '2026-11-01', 4)]);
  const detail = await service.getOperation('client-renewal-test');
  assert.equal(detail.contract.id, 'new');
  assert.equal(detail.cycles.current.quota, 4);
  assert.equal(detail.cycles.previous?.quota, 12);
  assert.equal(detail.cycles.previous.contractId, 'old');
  assert.equal(detail.cycles.previous.reached.publicada, 10);
  assert.deepEqual(detail.history.map(month => [month.label, month.quota]), [['Octubre', 12], ['Septiembre', 12], ['Agosto', 12]]);
  assert.ok(detail.evaluation.reasons.some(reason => /Octubre.*10 de 12/.test(reason.text)));
  const [summary] = await service.listOperations();
  assert.equal(summary.cycles.previous.quota, 12);
  assert.equal(summary.cycles.previous.pieces, undefined);
  assert.equal(writes.length, 0);
});

test('cada mes conserva el requisito de informe del contrato que le correspondía', async () => {
  const { service, writes } = fixture([contract('old', '2026-01-01', 12, { monthlyReport: true }), contract('new', '2026-11-01', 4, { monthlyReport: false })]);
  const detail = await service.getOperation('client-renewal-test');
  assert.equal(detail.cycles.current.monthlyReport, false);
  assert.equal(detail.cycles.previous.monthlyReport, true);
  assert.ok(detail.evaluation.reasons.some(reason => reason.code === 'REPORT_PENDING'), 'el informe del periodo anterior sigue pendiente aunque la renovación lo retire');
  await service.confirmMonthlyClose({ clientId: 'client-renewal-test', year: 2026, month: 10 });
  assert.deepEqual(writes.find(([kind]) => kind === 'close')[1].data.snapshot, { quota: 12, published: 10, missing: 2, overdue: 0, report: 'PENDIENTE' });
});

test('un informe añadido en la renovación no se exige al cerrar el periodo anterior', async () => {
  const { service, writes } = fixture([contract('old', '2026-01-01', 12), contract('new', '2026-11-01', 4, { monthlyReport: true })]);
  const detail = await service.getOperation('client-renewal-test');
  assert.equal(detail.evaluation.reasons.some(reason => reason.code === 'REPORT_PENDING'), false, 'el informe nuevo no crea una obligación retroactiva');
  await service.confirmMonthlyClose({ clientId: 'client-renewal-test', year: 2026, month: 10 });
  assert.equal(writes.find(([kind]) => kind === 'close')[1].data.snapshot.report, null);
});

test('una renovación futura no adelanta su cupo ni su corte', async () => {
  const { service } = fixture([contract('old', '2026-01-01', 12, { endDate: '2026-11-14' }), contract('future', '2026-11-15', 4, { cutDay: 15 })]);
  const detail = await service.getOperation('client-renewal-test');
  assert.equal(detail.contract.id, 'old');
  assert.deepEqual([detail.cycles.current.start, detail.cycles.current.end, detail.cycles.current.quota], ['2026-11-01', '2026-11-30', 12]);
  assert.equal(detail.cycles.previous.quota, 12);
});

test('editar la ficha modifica el contrato mostrado y conserva la renovación futura', async () => {
  const old = contract('old', '2026-01-01', 12);
  const future = contract('future', '2026-11-15', 4, { cutDay: 15 });
  const { service, writes, row } = fixture([old, future]);
  const result = await service.saveProfile({ clientId: row.id, input: { contract: { ...old, notes: 'Corrección del registro actual' } } });
  assert.equal(writes.find(([kind]) => kind === 'contract')[1].where.id, 'old');
  assert.deepEqual(row.contracts.find(item => item.id === 'future'), future);
  assert.equal(result.contract.id, 'old');
});

test('si el contrato seleccionado cambia antes de guardar, no se sobreescribe otro', async () => {
  const old = contract('old', '2026-01-01', 12);
  const { service, writes, row } = fixture([old], { beforeTransaction: stored => stored.contracts.push(contract('concurrent', '2026-11-01', 4)) });
  await assert.rejects(service.saveProfile({ clientId: row.id, input: { contract: old } }), error => error.status === 409 && error.code === 'CLIENT_CONTRACT_CHANGED');
  assert.deepEqual(writes, []);
});

test('registrar una renovación futura no la convierte en el alcance actual', async () => {
  const old = contract('old', '2026-01-01', 12);
  const { service, row } = fixture([old]);
  const result = await service.saveProfile({ clientId: row.id, input: { renew: true, contract: { ...old, startDate: '2027-01-01', deliverables: [{ format: 'Post', quantity: 4 }] } } });
  assert.equal(result.contract.id, 'old');
  assert.equal(result.cycles.current.quota, 12);
  assert.equal(row.contracts.find(item => item.id === 'new-renewal').deliverables[0].quantity, 4);
});

test('con solo un contrato futuro se conserva su ficha, sin medir meses anteriores al inicio', async () => {
  const { service } = fixture([contract('future', '2026-11-15', 4, { cutDay: 15 })]);
  const detail = await service.getOperation('client-renewal-test');
  assert.equal(detail.contract.id, 'future');
  assert.deepEqual(detail.cycles, {});
  assert.deepEqual(detail.history, []);
  assert.deepEqual(await service.listOverduePlans(), []);
});

test('el corte histórico inequívoco es el del contrato de ese periodo', async () => {
  const { service } = fixture([contract('old', '2026-01-11', 12, { cutDay: 11, endDate: '2026-10-10' }), contract('new', '2026-10-11', 4, { cutDay: 11 })]);
  const detail = await service.getOperation('client-renewal-test');
  assert.deepEqual(detail.history.map(month => [month.label, month.start, month.end, month.quota]), [
    ['Septiembre–octubre', '2026-09-11', '2026-10-10', 12], ['Agosto–septiembre', '2026-08-11', '2026-09-10', 12], ['Julio–agosto', '2026-07-11', '2026-08-10', 12],
  ]);
});

test('un cambio de corte no reescribe los meses anteriores al cambio', async () => {
  const { service } = fixture([contract('old', '2026-01-01', 12, { endDate: '2026-11-14' }), contract('new', '2026-11-15', 4, { cutDay: 15 })], { today: '2026-12-18' });
  const detail = await service.getOperation('client-renewal-test');
  assert.deepEqual(detail.history.map(month => [month.label, month.start, month.end, month.quota]), [
    // Limitación conservada: dos ciclos posibles en noviembre comparten la misma parrilla mensual.
    // No se reparte ni prorratea esa parrilla; noviembre mantiene el criterio previo del contrato más reciente.
    ['Noviembre–diciembre', '2026-11-15', '2026-12-14', 4], ['Octubre', '2026-10-01', '2026-10-31', 12], ['Septiembre', '2026-09-01', '2026-09-30', 12],
  ]);
});

test('un mes sin contrato entre dos acuerdos no crea deuda de piezas ni borra el anterior', async () => {
  const { service } = fixture([contract('old', '2026-01-01', 12, { endDate: '2026-09-30' }), contract('new', '2026-11-01', 4)]);
  const detail = await service.getOperation('client-renewal-test');
  assert.deepEqual(detail.history.map(month => [month.label, month.quota]), [['Septiembre', 12], ['Agosto', 12]]);
  assert.equal(detail.cycles.previous.label, 'Septiembre');
});

test('el primer periodo tras un hueco no desaparece por un contrato que ya había terminado', async () => {
  const { service } = fixture([contract('old', '2026-01-01', 12, { endDate: '2026-09-30' }), contract('new', '2026-11-15', 4)], { today: '2026-12-18' });
  const detail = await service.getOperation('client-renewal-test');
  assert.deepEqual(detail.history.map(month => [month.label, month.contractId, month.quota]), [['Noviembre', 'new', 4], ['Septiembre', 'old', 12]]);
});

test('una renovación futura con otro corte tampoco aparece como periodo histórico', async () => {
  const { service } = fixture([contract('old', '2026-11-01', 12), contract('future', '2026-11-10', 4, { cutDay: 15 })]);
  const detail = await service.getOperation('client-renewal-test');
  assert.equal(detail.contract.id, 'old');
  assert.deepEqual(detail.history, []);
  assert.equal(detail.cycles.previous, null);
});
