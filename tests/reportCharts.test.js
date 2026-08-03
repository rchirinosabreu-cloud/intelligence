import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
import {
  formatReportMetric,
  getRenderableTimeSeries,
} from '../src/utils/reportMetrics.js';

test('formats report currency as Colombian pesos without USD decimals', () => {
  assert.equal(formatReportMetric({ value: 232826, unit: 'CURRENCY' }, 'COP'), '$ 232.826');
});

test('formats percentages and compact counts for client-facing cards', () => {
  assert.equal(formatReportMetric({ value: 82.9, unit: 'PERCENT' }, 'COP'), '82,9%');
  assert.equal(formatReportMetric({ value: 42500, unit: 'COUNT' }, 'COP'), '42,5 mil');
});

test('only renders time series with at least two real numeric points', () => {
  const series = [
    { key: 'valid', points: [{ label: '1 jul', value: 10 }, { label: '2 jul', value: 20 }] },
    { key: 'single-total', points: [{ label: 'Total', value: 30 }] },
    { key: 'invalid', points: [{ label: '1 jul', value: '10' }, { label: '2 jul', value: 20 }] },
  ];

  assert.deepEqual(getRenderableTimeSeries(series).map((item) => item.key), ['valid']);
});

test('structured report renderer compiles and uses Recharts rather than screenshot charts', async () => {
  const file = 'src/components/modules/Reports/StructuredReportSection.jsx';
  const source = await readFile(file, 'utf8');

  assert.match(source, /from 'recharts'/);
  assert.match(source, /ResponsiveContainer/);
  assert.match(source, /LineChart/);
  assert.match(source, /BarChart/);
  await transformWithEsbuild(source, file, { loader: 'jsx', jsx: 'automatic' });
});
