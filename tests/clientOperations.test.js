import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cycleForDate, previousCycle, pieceStage, summarizeCycle, evaluateClientOperation, teamLoad, contractQuota,
  normalizeOperationProfile, cycleSegments,
} from '../src/lib/clientOperations.js';

// Operación de clientes (2 de octubre de 2026): lo que dice la plataforma es lo que se ve. Estas reglas
// reemplazan los porcentajes y estados que el Excel escribía a mano.

test('el ciclo de un mes calendario va del 1 al último día', () => {
  assert.deepEqual(cycleForDate('2026-10-02', 1), { year: 2026, month: 10, start: '2026-10-01', end: '2026-10-31', label: 'Octubre' });
  assert.deepEqual(cycleForDate('2026-02-28', 1), { year: 2026, month: 2, start: '2026-02-01', end: '2026-02-28', label: 'Febrero' });
});

test('con otro día de corte, la parrilla del mes va del corte al día anterior del mes siguiente', () => {
  // Mimas cierra los 15: el 2 de octubre todavía corre la parrilla de septiembre.
  assert.deepEqual(cycleForDate('2026-10-02', 15), { year: 2026, month: 9, start: '2026-09-15', end: '2026-10-14', label: 'Septiembre' });
  assert.deepEqual(cycleForDate('2026-10-15', 15), { year: 2026, month: 10, start: '2026-10-15', end: '2026-11-14', label: 'Octubre' });
  assert.deepEqual(cycleForDate('2027-01-03', 20), { year: 2026, month: 12, start: '2026-12-20', end: '2027-01-19', label: 'Diciembre' });
  assert.equal(cycleForDate('2026-10-02', 40).start, '2026-09-28', 'el corte nunca pasa del 28');
});

test('el ciclo anterior es el del mes previo, aunque cambie el año', () => {
  assert.deepEqual(previousCycle({ year: 2026, month: 1 }, 1), { year: 2025, month: 12, start: '2025-12-01', end: '2025-12-31', label: 'Diciembre' });
  assert.equal(previousCycle({ year: 2026, month: 10 }, 15).start, '2026-09-15');
});

test('la etapa de una pieza sale de lo que tiene, no de lo que alguien escribió', () => {
  assert.equal(pieceStage({ status: 'BORRADOR', copyText: '', captionText: '' }), 0);
  assert.equal(pieceStage({ status: 'BORRADOR', copyText: 'ESCENA 1', captionText: '' }), 1, 'redactada');
  assert.equal(pieceStage({ status: 'EN_REVISION', copyText: 'x', captionText: 'y', hasFinalAsset: true }), 2, 'diseñada');
  assert.equal(pieceStage({ status: 'APROBADO', copyText: 'x', captionText: 'y' }), 3, 'aprobada aunque falte el archivo');
  assert.equal(pieceStage({ status: 'APROBADO', hasActivePublication: true }), 4, 'programada');
  assert.equal(pieceStage({ status: 'PUBLICADO' }), 5);
  assert.equal(pieceStage({ status: 'DEVUELTO', copyText: 'x', hasFinalAsset: true }), 2, 'devuelta conserva lo hecho');
});

test('el resumen del ciclo cuenta etapas acumuladas, atrasos, huecos y días repetidos', () => {
  const items = [
    { id: 'a', date: '2026-10-01', status: 'PUBLICADO' },
    { id: 'b', date: '2026-10-01', status: 'APROBADO', copyText: 'x' },
    { id: 'c', date: '2026-10-08', status: 'BORRADOR', copyText: 'x', hasFinalAsset: true },
    { id: 'd', date: '2026-10-09', status: 'BORRADOR' },
  ];
  const cycle = summarizeCycle({ year: 2026, month: 10, start: '2026-10-01', end: '2026-10-31', label: 'Octubre' }, items, { quota: 12, today: '2026-10-02' });
  assert.equal(cycle.created, 4);
  assert.equal(cycle.quota, 12);
  assert.deepEqual(cycle.reached, { redactada: 3, disenada: 3, aprobada: 2, programada: 1, publicada: 1 });
  assert.equal(cycle.overdueItems, 1, 'la pieza b tenía fecha 1 oct y no salió');
  assert.deepEqual(cycle.longestGap, { days: 7, from: '2026-10-01', to: '2026-10-08' });
  assert.deepEqual(cycle.sameDay, [{ date: '2026-10-01', count: 2 }]);
  assert.equal(cycle.day, 2);
  assert.equal(cycle.length, 31);
  assert.deepEqual(cycle.pieces.map((p) => p.id), ['a', 'b', 'c', 'd']);
});

test('un hueco de tres días o menos no es hueco', () => {
  const items = [{ date: '2026-10-01', status: 'BORRADOR' }, { date: '2026-10-04', status: 'BORRADOR' }];
  const cycle = summarizeCycle({ year: 2026, month: 10, start: '2026-10-01', end: '2026-10-31', label: 'Octubre' }, items, { quota: 2, today: '2026-10-01' });
  assert.equal(cycle.longestGap, null);
});

const base = (extra = {}) => ({
  contract: { serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-01-01', endDate: '2026-12-31', cutDay: 1, deliverables: [{ format: 'Post', quantity: 12 }], monthlyReport: false },
  cycles: {
    current: { label: 'Octubre', day: 2, length: 31, quota: 12, created: 12, reached: { redactada: 12, disenada: 0, aprobada: 0, programada: 0, publicada: 0 }, overdueItems: 0, longestGap: null, sameDay: [] },
    previous: { label: 'Septiembre', quota: 12, created: 12, reached: { redactada: 12, disenada: 12, aprobada: 12, programada: 12, publicada: 12 }, report: null },
  },
  openTasks: [],
  ...extra,
});
const today = '2026-10-02';

test('un cliente al día sale en verde y sin motivos', () => {
  assert.deepEqual(evaluateClientOperation(base(), { today }), { level: 'green', reasons: [] });
});

test('sin contrato, en stand by o terminado no se mide', () => {
  assert.equal(evaluateClientOperation(base({ contract: null }), { today }).level, 'gray');
  const standBy = evaluateClientOperation(base({ contract: { ...base().contract, status: 'STAND_BY', standBySince: '2026-09-15' } }), { today });
  assert.deepEqual(standBy, { level: 'gray', reasons: [{ level: 'gray', text: 'En stand by desde el 15 sep.' }] });
  assert.equal(evaluateClientOperation(base({ contract: { ...base().contract, status: 'TERMINADO' } }), { today }).level, 'gray');
});

test('el mes anterior sin cerrar es rojo y el informe sin entregar es amarillo', () => {
  const client = base();
  client.cycles.previous.reached.publicada = 10;
  client.contract.monthlyReport = true;
  const result = evaluateClientOperation(client, { today });
  assert.equal(result.level, 'red');
  assert.deepEqual(result.reasons.map((r) => r.text), [
    'Septiembre cerró con 10 de 12 publicadas: faltaron 2 piezas.',
    'Falta entregar el informe de septiembre.',
  ]);
});

test('sin parrilla es amarillo los primeros días y rojo desde el día 5', () => {
  const early = base(); early.cycles.current.created = 0;
  assert.equal(evaluateClientOperation(early, { today }).reasons[0].level, 'yellow');
  const late = base(); late.cycles.current.created = 0; late.cycles.current.day = 5;
  assert.deepEqual(evaluateClientOperation(late, { today }).reasons[0], { level: 'red', text: 'Octubre todavía no tiene parrilla.' });
});

test('piezas atrasadas, ritmo, huecos y días repetidos se explican en una frase', () => {
  const late = base(); Object.assign(late.cycles.current, { overdueItems: 3 });
  assert.equal(evaluateClientOperation(late, { today }).reasons[0].text, '3 piezas con fecha pasada y sin publicar.');
  const slow = base(); Object.assign(slow.cycles.current, { day: 20, length: 30 });
  assert.equal(evaluateClientOperation(slow, { today }).reasons[0].text, 'Van 0 publicadas; a esta fecha deberían ir 8.');
  const gaps = base(); Object.assign(gaps.cycles.current, { longestGap: { days: 6, from: '2026-10-08', to: '2026-10-14' }, sameDay: [{ date: '2026-10-07', count: 2 }] });
  assert.deepEqual(evaluateClientOperation(gaps, { today }).reasons.map((r) => r.text), ['6 días entre publicaciones (del 8 oct al 14 oct).', '2 piezas el mismo día: 7 oct.']);
});

test('el contrato que vence pronto o ya venció se avisa', () => {
  assert.equal(evaluateClientOperation(base({ contract: { ...base().contract, endDate: '2026-10-20' } }), { today }).reasons[0].text, 'El contrato vence el 20 oct.');
  assert.equal(evaluateClientOperation(base({ contract: { ...base().contract, endDate: '2026-07-31' } }), { today }).reasons[0].text, 'El contrato venció el 31 jul: renovarlo o cerrarlo.');
});

test('un cliente de servicios se sigue por sus tareas', () => {
  const services = { contract: { serviceType: 'SERVICIOS', status: 'ACTIVO', startDate: '2026-01-01', endDate: null, deliverables: [] }, cycles: {} };
  assert.equal(evaluateClientOperation({ ...services, openTasks: [] }, { today }).level, 'gray');
  assert.equal(evaluateClientOperation({ ...services, openTasks: [{ overdue: false }] }, { today }).level, 'green');
  assert.deepEqual(evaluateClientOperation({ ...services, openTasks: [{ overdue: true }, { overdue: true }] }, { today }), { level: 'yellow', reasons: [{ level: 'yellow', text: '2 tareas vencidas en Gestión.' }] });
});

test('la barra pinta cada pieza en la etapa más avanzada que alcanzó', () => {
  const segments = cycleSegments({ quota: 12, created: 8, reached: { redactada: 6, disenada: 4, aprobada: 3, programada: 2, publicada: 1 } });
  assert.deepEqual(segments.map((s) => [s.key, s.count]), [['publicada', 1], ['programada', 1], ['aprobada', 1], ['disenada', 1], ['redactada', 2], ['creada', 2], ['faltante', 4]]);
});

test('la carga del equipo cuenta clientes, alertas y piezas por persona', () => {
  const sara = { id: 'sara', name: 'Sara' };
  const rows = teamLoad([
    { client: { ...base(), communityManager: sara }, evaluation: { level: 'red' } },
    { client: { ...base(), communityManager: sara, openTasks: [{ overdue: true }] }, evaluation: { level: 'yellow' } },
    { client: { ...base(), communityManager: null }, evaluation: { level: 'green' } },
  ]);
  assert.equal(rows[0].member, sara);
  assert.deepEqual([rows[0].clients.length, rows[0].red, rows[0].yellow, rows[0].quota, rows[0].overdueTasks], [2, 1, 1, 24, 1]);
  assert.equal(rows[1].member, null);
});

test('la ficha operativa se valida igual en la pantalla y en el servidor', () => {
  const ok = normalizeOperationProfile({
    description: '  Restaurante en Miami. ', instagramUrl: 'https://www.instagram.com/mimas/', agency: 'MIO', complexity: 'ALTA',
    projectManagerId: 'pm', communityManagerId: '',
    contract: { serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-01-15', endDate: '', cutDay: 15, deliverables: [{ format: 'Reel', quantity: '5' }, { format: 'Post', quantity: 0 }], storiesPerWeek: 3, productionDays: 1, monthlyReport: true, notes: '' },
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.value.description, 'Restaurante en Miami.');
  assert.equal(ok.value.communityManagerId, null);
  assert.deepEqual(ok.value.contract.deliverables, [{ format: 'Reel', quantity: 5 }], 'las cantidades en cero se quitan');
  assert.equal(ok.value.contract.endDate, null);
  assert.equal(contractQuota(ok.value.contract), 5);

  const bad = normalizeOperationProfile({ agency: 'OTRA', instagramUrl: 'javascript:alert(1)', contract: { serviceType: 'PARRILLA', status: 'X', startDate: '2026-13-01', endDate: '2026-01-01', cutDay: 0, deliverables: [{ format: 'Reel', quantity: 2 }, { format: 'Reel', quantity: 1 }] } });
  assert.equal(bad.valid, false);
  for (const field of ['agency', 'instagramUrl', 'contract.status', 'contract.startDate', 'contract.deliverables']) assert.ok(bad.errors[field], `falta el error de ${field}`);

  const inverted = normalizeOperationProfile({ contract: { serviceType: 'SERVICIOS', status: 'ACTIVO', startDate: '2026-05-01', endDate: '2026-04-01' } });
  assert.equal(inverted.errors['contract.endDate'], 'El fin no puede ser antes del inicio.');

  assert.equal(normalizeOperationProfile({ contract: null }).valid, true, 'se puede guardar la ficha sin contrato');
});
