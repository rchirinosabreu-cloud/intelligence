import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { buildGrowthImportPlan, parseGrowthWorkbook, stripJsonMarkdownFence } from '../src/services/growthImportService.js';
import { persistGrowthCyclePlan } from '../src/services/growthCycleService.js';

test('limpia JSON de OpenAI aunque llegue envuelto en markdown', () => {
  assert.deepEqual(stripJsonMarkdownFence('```json\n{"alertas":[]}\n```'), { alertas: [] });
});

test('convierte el plan en semanas y acciones sin inventar responsables', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Semana', 'Frente', 'Acción', 'Responsable', 'Indicador', 'Meta'],
    [1, 'Finanzas', 'Conciliar saldos', 'Dirección', 'Conciliaciones', 1],
    [2, 'Comercial', 'Activar seguimiento', '', 'Oportunidades', 5]
  ]), 'Plan 90 días');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const result = parseGrowthWorkbook(buffer, { filename: 'plan.xlsm' });
  assert.equal(result.weeks.length, 2);
  assert.equal(result.actions.length, 2);
  assert.equal(result.actions[1].ownerName, null);
  assert.equal(result.metrics[0].name, 'Conciliaciones');
  assert.ok(result.sourceHash);
});

test('calcula el cierre del ciclo desde la fecha de inicio indicada', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Semana', 'Acción'],
    [1, 'Definir foco']
  ]), 'Plan 90 días');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const result = buildGrowthImportPlan(buffer, { startDate: '2026-08-24T05:00:00.000Z' });
  assert.equal(result.cycle.endDate, '2026-11-22T05:00:00.000Z');
});

test('activa el ciclo de crecimiento de forma idempotente', async () => {
  const calls = [];
  const tx = {
    growthCycle: { create: async ({ data }) => ({ id: 'cycle-1', ...data }) },
    growthWeek: { create: async ({ data }) => ({ id: `week-${data.number}`, ...data }) },
    growthAction: { createMany: async ({ data }) => calls.push(['actions', data]) },
    growthMetricSnapshot: { createMany: async ({ data }) => calls.push(['metrics', data]) }
  };
  const prismaClient = {
    growthCycle: { findUnique: async () => null },
    $transaction: async (callback) => callback(tx)
  };
  const plan = {
    filename: 'plan.xlsm', sourceHash: 'hash-1',
    cycle: { name: 'Plan 90 dias', startDate: '2026-08-24T05:00:00.000Z', endDate: '2026-11-22T04:59:59.999Z' },
    weeks: [{ number: 1, title: 'Semana 1' }],
    actions: [{ weekNumber: 1, title: 'Definir foco', ownerName: 'Direccion', evidenceRequired: true }],
    metrics: [{ name: 'Caja', value: 0, target: 35000000, unit: 'COP' }]
  };
  const result = await persistGrowthCyclePlan(prismaClient, plan, { actorId: 'user-1' });
  assert.equal(result.created, true);
  assert.equal(result.cycle.status, 'ACTIVE');
  assert.equal(calls[0][1][0].weekId, 'week-1');
  assert.equal(calls[1][1][0].source, 'IMPORT_PROVISIONAL');
});
