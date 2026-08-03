import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterCanonicalMetrics,
  filterTopContentRows,
  isDemographicDataset,
  splitAchievement,
  safeClassName,
  buildReportFileName
} from '../src/lib/reportPresentation.js';

test('report presentation regressions', async (t) => {
  await t.test('general results contain canonical metrics only', () => {
    assert.deepEqual(Object.keys(filterCanonicalMetrics({
      spend: { value: 1 }, warnings: ['x'], processingSummary: {}, demographics: {}
    })), ['spend']);
  });

  await t.test('demographic points are recognized without a generic value key', () => {
    assert.equal(isDemographicDataset([{ label: '25-34', hombres: 40, mujeres: 60 }]), true);
  });

  await t.test('format distribution labels are excluded from ad publications', () => {
    const rows = filterTopContentRows([
      { title: 'REEL - ELEGIR COLEGIO', results: 3, impressions: 1105, reach: 869 },
      { title: 'Reels', results: 36 },
      { title: 'Enlaces', results: 10 },
      { title: 'Historias', results: 6 },
      { title: 'Foto', results: 3 },
      { title: 'Varias fotos', results: 1 },
      { title: 'Otros', results: 1 }
    ]);
    assert.deepEqual(rows.map(row => row.title), ['REEL - ELEGIR COLEGIO']);
  });

  await t.test('achievement markdown becomes a title and supporting copy', () => {
    assert.deepEqual(splitAchievement('**Alcance total robusto:** Se alcanzaron 8.978 usuarios.'), {
      title: 'Alcance total robusto',
      description: 'Se alcanzaron 8.978 usuarios.'
    });
  });

  await t.test('HTML export safely reads SVG className objects and absent titles', () => {
    assert.equal(safeClassName({ baseVal: 'recharts-layer' }), 'recharts-layer');
    assert.equal(safeClassName(undefined), '');
    assert.equal(buildReportFileName(undefined), 'reporte_de_desempeno_digital.html');
  });
});
