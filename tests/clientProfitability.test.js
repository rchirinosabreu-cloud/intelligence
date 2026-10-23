import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { buildClientProfitability, isOperatingExpense, isClientIncome, PROFITABILITY_LIMITS } from '../src/lib/clientProfitability.js';
import { createClientProfitabilityService, lastClosedMonth } from '../src/services/clientProfitabilityService.js';
import { createClientProfitabilityRouter } from '../src/routes/api/clientProfitability.js';

// Rentabilidad por cliente (Rodny, 22 de octubre de 2026): lo facturado del mes frente a lo que cuesta atender la
// cuenta. El costo sale de un solo valor por hora de la agencia —lo que costó operar el mes entre las horas medidas
// del equipo—, así nadie deduce el salario de una persona. Datos inventados.

const H = 3_600_000;
// Sesiones de 2 horas, como se trabaja de verdad: una de más de 8 es un reloj olvidado y no cuenta.
const work = (clientId, total) => Array.from({ length: total / 2 }, () => ({ clientId, ms: 2 * H }));
const clients = [{ id: 'c-aristea', name: 'Aristea', slug: 'aristea' }, { id: 'c-endova', name: 'Endova', slug: 'endova' }, { id: 'c-nuva', name: 'Nuva', slug: 'nuva' }];
const base = {
  year: 2026, month: 9, clients,
  receivables: [{ clientId: 'c-aristea', amount: 3_000_000 }, { clientId: 'c-endova', amount: 1_200_000 }, { clientId: 'c-endova', amount: 300_000 }],
  // 10.000.000 de operación del mes; 500.000 de pauta pagada por Endova va directo a Endova, no al costo hora.
  expenses: [{ amount: 8_000_000, category: 'NOMINA' }, { amount: 1_500_000, category: 'ADMINISTRATIVO' }, { amount: 500_000, category: 'PAUTA', clientId: 'c-endova' }],
  // 100 h medidas: 40 de Aristea, 30 de Endova, 10 de Nuva y 20 internas (reuniones, administración).
  sessions: [...work('c-aristea', 40), ...work('c-endova', 30), ...work('c-nuva', 10), ...work(null, 20)],
  closedTasks: [{ clientId: 'c-aristea', measuredMs: 2 * H }, { clientId: 'c-aristea', measuredMs: 3 * H }, { clientId: 'c-endova', measuredMs: 0 }, { clientId: 'c-endova', measuredMs: 0 }, { clientId: 'c-endova', measuredMs: H }]
};

test('el costo hora es la operación del mes, sin lo directo de un cliente, entre las horas medidas; cada cuenta carga sus horas y su costo directo', () => {
  const out = buildClientProfitability(base);
  assert.equal(out.period.label, 'septiembre de 2026');
  assert.deepEqual(
    { cost: out.agency.costCents, direct: out.agency.directCostCents, shared: out.agency.sharedCostCents, hours: out.agency.hoursMs, hour: out.agency.hourCostCents, internal: out.agency.internalCostCents, billed: out.agency.billedCents },
    { cost: 1_000_000_000, direct: 50_000_000, shared: 950_000_000, hours: 100 * H, hour: 9_500_000, internal: 190_000_000, billed: 450_000_000 }
  );
  const byName = Object.fromEntries(out.clients.map((row) => [row.name, row]));
  assert.deepEqual([byName.Aristea.billedCents, byName.Aristea.laborCostCents, byName.Aristea.costCents, byName.Aristea.marginCents], [300_000_000, 380_000_000, 380_000_000, -80_000_000]);
  assert.equal(byName.Aristea.marginRate, -80_000_000 / 300_000_000);
  assert.equal(byName.Aristea.revenuePerHourCents, 7_500_000);
  assert.deepEqual([byName.Endova.billedCents, byName.Endova.directCostCents, byName.Endova.costCents, byName.Endova.marginCents], [150_000_000, 50_000_000, 335_000_000, -185_000_000]);
  assert.equal(byName.Endova.line, 'Endova: facturado $1.500.000, costo $3.350.000 (30 h y $500.000 directo), margen -$1.850.000 (-123 %).');
  assert.equal(byName.Nuva.billedCents, 0);
  assert.equal(byName.Nuva.marginRate, null, 'sin facturación no hay margen en porcentaje');
  // Lo asignado a cuentas más lo interno es todo el costo: no se pierde ni se inventa dinero.
  const allocated = out.clients.reduce((sum, row) => sum + row.costCents, 0) + out.agency.internalCostCents;
  assert.equal(allocated, out.agency.costCents);
  assert.deepEqual(out.clients.map((row) => row.name), ['Endova', 'Nuva', 'Aristea'], 'primero la que más pierde');
});

test('cada cuenta dice en una frase lo que hay que mirar, sin juicios', () => {
  const byName = Object.fromEntries(buildClientProfitability(base).clients.map((row) => [row.name, row]));
  assert.deepEqual(byName.Aristea.flags, ['PIERDE']);
  assert.ok(byName.Endova.flags.includes('PIERDE') && byName.Endova.flags.includes('POCA_MEDICION'), 'dos de tres tareas cerradas sin tiempo');
  assert.deepEqual(byName.Nuva.flags, ['SIN_FACTURAR']);
  const onlyBilled = buildClientProfitability({ ...base, sessions: work('c-aristea', 10), closedTasks: [] });
  const endova = onlyBilled.clients.find((row) => row.name === 'Endova');
  assert.ok(endova.flags.includes('SIN_HORAS'), 'facturó y nadie midió trabajo: el margen se ve mejor de lo que es');
  for (const row of buildClientProfitability(base).clients) for (const line of row.reading) assert.doesNotMatch(line, /\b(mal|malo|lento|flojo|culpa)\b/i);
});

// Rodny, 23 de octubre de 2026: «hay muchos clientes que dice “no tiene nada facturado”… no está leyendo los
// movimientos». Sin cuenta por cobrar del mes, el ingreso es lo que entró; con ella, lo facturado y nunca los dos.
test('sin cuenta por cobrar del mes se usa lo que entró en Movimientos, y se dice; con ella, el pago no se suma encima', () => {
  const out = buildClientProfitability({
    ...base,
    incomes: [{ clientId: 'c-nuva', amount: 2_000_000 }, { clientId: 'c-aristea', amount: 3_000_000 }],
    unlinkedIncomeCents: 70_000_000
  });
  const byName = Object.fromEntries(out.clients.map((row) => [row.name, row]));
  assert.deepEqual([byName.Nuva.revenueSource, byName.Nuva.revenueCents, byName.Nuva.marginCents], ['INGRESOS', 200_000_000, 200_000_000 - 95_000_000]);
  assert.deepEqual(byName.Nuva.flags, ['INGRESOS'], 'ya no dice que no tiene nada facturado');
  assert.match(byName.Nuva.reading[0], /Sin cuenta por cobrar del mes: se usó lo que entró en Movimientos \(\$2\.000\.000\)/);
  assert.match(byName.Nuva.line, /^Nuva: entró \$2\.000\.000/);
  assert.deepEqual([byName.Aristea.revenueSource, byName.Aristea.revenueCents], ['FACTURADO', 300_000_000], 'el pago de su cuenta por cobrar no se cuenta dos veces');
  assert.equal(out.agency.revenueCents, 300_000_000 + 150_000_000 + 200_000_000);
  assert.equal(out.agency.fromIncome, 1);
  assert.match(out.notes.join(' '), /Para un cliente sin cuenta por cobrar del mes se usó lo que entró/);
  assert.match(out.notes.join(' '), /\$700\.000 de ingresos del mes no están ligados a ningún cliente/);
  assert.equal(isClientIncome({ type: 'INCOME', clientId: 'c1', category: 'SERVICIO' }), true);
  assert.equal(isClientIncome({ type: 'INCOME', clientId: 'c1', category: 'PRESTAMO', section: 'FINANCING' }), false, 'un reintegro de préstamo no es venta');
  assert.equal(isClientIncome({ type: 'INCOME', clientId: null, category: 'SERVICIO' }), false);
});

test('lo que no es operación no entra al costo: préstamos, inversiones, financiación, anulados y proyecciones se filtran antes', () => {
  assert.equal(isOperatingExpense({ type: 'EXPENSE', category: 'NOMINA', section: 'PAYROLL' }), true);
  assert.equal(isOperatingExpense({ type: 'EXPENSE', category: 'PRESTAMO', section: 'FINANCING' }), false);
  assert.equal(isOperatingExpense({ type: 'EXPENSE', category: 'OPERATIVO', section: 'INVESTMENT' }), false);
  assert.equal(isOperatingExpense({ type: 'EXPENSE', category: 'OPERATIVO', section: 'FINANCING' }), false);
  assert.equal(isOperatingExpense({ type: 'INCOME', category: 'SERVICIO' }), false);
});

test('sin horas medidas no hay costo hora y se dice; una sesión de reloj olvidado no cuenta', () => {
  const none = buildClientProfitability({ ...base, sessions: [], closedTasks: [] });
  assert.equal(none.agency.hourCostCents, null);
  assert.match(none.notes.join(' '), /no hay horas medidas/i);
  assert.ok(none.clients.every((row) => row.laborCostCents === 0));
  const forgotten = buildClientProfitability({ ...base, sessions: [{ clientId: 'c-aristea', ms: PROFITABILITY_LIMITS.forgottenSessionMs + 1 }, { clientId: 'c-aristea', ms: 2 * H }] });
  assert.equal(forgotten.agency.hoursMs, 2 * H);
  assert.equal(forgotten.agency.forgottenSessions, 1);
});

test('la cobertura de la agencia se dice siempre, porque un costo hora con pocas horas medidas sale inflado', () => {
  const out = buildClientProfitability(base);
  assert.equal(out.agency.coverage, 3 / 5);
  assert.match(out.notes.join(' '), /3 de 5 tareas cerradas/);
});

test('el servicio lee el mes en reloj de Bogotá, deja fuera lo que no es operación y no lee la nómina por persona', async () => {
  const where = {};
  const db = {
    accountsReceivable: { findMany: async (args) => { where.receivables = args.where; return [{ clientId: 'c-aristea', amount: '3000000' }]; } },
    financialRecord: { findMany: async (args) => { where.records = args.where; return [{ type: 'EXPENSE', amount: '1000000', category: 'NOMINA', section: 'PAYROLL', clientId: null }, { type: 'EXPENSE', amount: '5000000', category: 'PRESTAMO', section: 'FINANCING', clientId: null }]; } },
    taskWorkSession: { findMany: async (args) => { where.sessions = args.where; return [{ durationMs: 2 * H, task: { clientId: 'c-aristea' } }, { durationMs: 2 * H, task: { clientId: null } }]; } },
    task: { findMany: async () => [{ clientId: 'c-aristea', workSessions: [{ durationMs: H }, { durationMs: 9 * H }] }] },
    client: { findMany: async () => [{ id: 'c-aristea', name: 'Aristea', slug: 'aristea' }] },
    payrollTransaction: { findMany: async () => { throw new Error('la rentabilidad no lee la nómina por persona'); } }
  };
  const out = await createClientProfitabilityService({ db }).read({ year: 2026, month: 9 });
  assert.equal(where.sessions.startedAt.gte.toISOString(), '2026-09-01T05:00:00.000Z');
  assert.equal(where.sessions.startedAt.lt.toISOString(), '2026-10-01T05:00:00.000Z');
  assert.equal(where.sessions.isOverlapping, false);
  assert.deepEqual([where.records.status, where.records.scenario, where.receivables.kind], ['POSTED', 'ACTUAL', 'CLIENTE']);
  assert.equal(out.agency.costCents, 100_000_000, 'el préstamo no es costo de operación');
  assert.equal(out.clients[0].laborCostCents, 50_000_000, 'la mitad de las horas, la mitad del costo');
  assert.equal(out.clients[0].measuredClosed, 1, 'la sesión de 9 horas no cuenta como medición');
  assert.deepEqual(lastClosedMonth(new Date('2026-01-01T03:00:00Z')), { year: 2025, month: 11 }, 'a las 22:00 del 31 de diciembre en Bogotá todavía es diciembre');
  assert.deepEqual(lastClosedMonth(new Date('2026-10-22T17:00:00Z')), { year: 2026, month: 9 });
});

test('la ruta es solo de administradores, valida el mes y por defecto lee el último mes cerrado', async () => {
  const asked = [];
  const app = express();
  app.use((req, _res, next) => { req.user = { role: req.headers['x-role'] }; next(); });
  app.use('/p', createClientProfitabilityRouter({ service: { read: async (input) => { asked.push(input); return { ok: true }; } }, clock: () => new Date('2026-10-22T17:00:00Z') }));
  const server = await new Promise((resolve) => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  const base = `http://127.0.0.1:${server.address().port}/p`;
  try {
    assert.equal((await fetch(base, { headers: { 'x-role': 'PROJECT_MANAGER' } })).status, 403);
    assert.equal((await fetch(base, { headers: { 'x-role': 'ADMIN' } })).status, 200);
    assert.deepEqual(asked[0], { year: 2026, month: 9 });
    await fetch(`${base}?year=2026&month=8`, { headers: { 'x-role': 'ADMIN' } });
    assert.deepEqual(asked[1], { year: 2026, month: 8 });
    assert.equal((await fetch(`${base}?year=2026&month=13`, { headers: { 'x-role': 'ADMIN' } })).status, 400);
  } finally { server.close(); }
});
