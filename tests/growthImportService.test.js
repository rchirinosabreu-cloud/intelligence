import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { parseGrowthWorkbook, stripJsonMarkdownFence } from '../src/services/growthImportService.js';

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
