import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseJsonResponse } from '../src/services/aiService.js';
import {
  validateAndCleanSourceExtraction,
  visionExtractionSchema,
  mergeSourceMetricsIntoAccumulator,
  finalizeNormalizedMetrics,
  preserveApprovedReportData,
  reconcileNarrativeSections,
  validateSectionNarratives,
  generateFallbackNarrative
} from '../src/services/reportVisionService.js';
import { getBrainStudioLogoSVG } from '../src/utils/reportStyling.js';
import { generateSummaryHTML, generateAnalysisHTML } from '../src/utils/htmlExport.js';
import { adaptDatasetForChart, hasReadableChartData } from '../src/lib/reportChartData.js';

test('report pipeline regressions', async (t) => {
  await t.test('parses JSON wrapped in Markdown', () => {
    assert.deepEqual(parseJsonResponse('```json\n{"spend":2500}\n```'), { spend: 2500 });
  });

  await t.test('repairs an otherwise complete response truncated inside an excessive decimal', () => {
    const raw = '```json\n{"metrics":{"spend":{"value":2500.000000000000000000000000';
    assert.deepEqual(parseJsonResponse(raw), { metrics: { spend: { value: 2500 } } });
  });

  await t.test('rounds readable dataset values and rejects unsafe precision', () => {
    const cleaned = validateAndCleanSourceExtraction({
      dataset: [
        { label: 'Día 1', value: 2500.0000000000004 },
        { label: 'Día 2', value: '1.234,56789' },
        { label: 'Inválido', value: '9'.repeat(40) }
      ]
    });
    assert.deepEqual(cleaned.dataset, [
      { label: 'Día 1', value: 2500 },
      { label: 'Día 2', value: 1234.5679 }
    ]);
  });

  await t.test('exposes partial-source failures as persisted warnings', () => {
    const report = preserveApprovedReportData({
      spend: { value: 1000 },
      processingSummary: { totalFiles: 2, successfulFiles: 1, failedFiles: 1 },
      warnings: ['Fallo en lectura (captura-2.png): respuesta truncada'],
      demographics: { ageGender: [], cities: [], countries: [] }
    }, { spend: { value: 1200 } });
    assert.equal(report.processingSummary.failedFiles, 1);
    assert.match(report.warnings[0], /captura-2\.png/);
  });

  await t.test('persists chartType and dataset through validation and narrative reconciliation', () => {
    const source = validateAndCleanSourceExtraction({
      chartType: 'LINE_CHART', title: 'Tendencia', sectionCategory: 'ADS', platform: 'PAID_ADS',
      dataset: [{ label: 'Lun', value: 10 }]
    });
    assert.equal(source.chartType, 'LINE_CHART');
    const original = [{ sectionId: 'one', chartType: source.chartType, dataset: source.dataset }];
    const reconciled = reconcileNarrativeSections(original, [{ sectionId: 'one', narrativeComment: 'Lectura.' }]);
    assert.equal(reconciled[0].chartType, 'LINE_CHART');
    assert.deepEqual(reconciled[0].dataset, [{ label: 'Lun', value: 10 }]);
  });

  await t.test('adapts alternate numeric keys to Recharts without inventing points', () => {
    assert.deepEqual(adaptDatasetForChart([
      { label: 'A', impressions: '1.200' },
      { label: 'B', results: 12 },
      { label: 'C', value: null },
      { label: 'D', value: 0 },
      { label: 'E', hombres: 0, mujeres: 0 }
    ], 'LINE_CHART'), [
      { label: 'A', value: 1200 },
      { label: 'B', value: 12 }
    ]);
    assert.equal(hasReadableChartData([{ label: 'C', value: null }]), false);
    assert.deepEqual(adaptDatasetForChart([
      { label: 'Reel', results: '12', impressions: '1.200', reach: 900 }
    ], 'RANKING_TABLE'), [
      { label: 'Reel', value: 12, results: 12, impressions: 1200, reach: 900 }
    ]);
  });

  await t.test('preserves COP end to end when approving metrics', () => {
    const source = validateAndCleanSourceExtraction({ metrics: { spend: { value: '$ 2.500 COP', unit: 'COP' } } });
    let accumulator = mergeSourceMetricsIntoAccumulator(null, source);
    const normalized = finalizeNormalizedMetrics(accumulator);
    const approved = preserveApprovedReportData(normalized, { spend: { ...normalized.spend, value: 2600 } });
    assert.equal(approved.spend.value, 2600);
    assert.equal(approved.spend.unit, 'COP');
  });

  await t.test('deduplicates repeated summary totals while keeping distinct detail totals', () => {
    const summary = validateAndCleanSourceExtraction({ screenType: 'Rendimiento Macro', metrics: { spend: { value: 2500 }, impressions: { value: 10000 } } });
    const duplicate = validateAndCleanSourceExtraction({ screenType: 'Tabla General', metrics: { spend: { value: 2500 }, impressions: { value: 10000 } } });
    let accumulator = mergeSourceMetricsIntoAccumulator(null, summary);
    accumulator = mergeSourceMetricsIntoAccumulator(accumulator, duplicate);
    const final = finalizeNormalizedMetrics(accumulator);
    assert.equal(final.spend.value, 2500);
    assert.equal(final.impressions.value, 10000);
  });

  await t.test('keeps an organic-only report usable with its visual detail', () => {
    const organic = validateAndCleanSourceExtraction({
      sectionCategory: 'ORGANIC', platform: 'ORGANIC_RRSS', chartType: 'BAR_CHART',
      dataset: [{ label: 'Publicaciones', value: 18 }],
      demographics: { ageGender: [{ label: '25-34', hombres: 40, mujeres: 60 }], cities: [], countries: [] },
      topContent: [{ title: 'Reel uno', results: 42 }]
    });
    assert.equal(organic.usable, true);
    assert.equal(organic.sectionCategory, 'ORGANIC');
    assert.equal(organic.dataset.length, 1);
    assert.equal(organic.demographics.ageGender.length, 1);
    assert.equal(organic.topContent.length, 1);
  });

  await t.test('source extraction removes zero-only metrics and chart rows before reporting', () => {
    const source = validateAndCleanSourceExtraction({
      metrics: { clicks: { value: 0 }, ctr: { value: '0.00%' }, impressions: { value: 1200 } },
      dataset: [{ label: 'Clics', value: 0 }, { label: 'Impresiones', value: 1200 }],
      demographics: { ageGender: [{ label: '25-34', hombres: 0, mujeres: 0 }, { label: '35-44', hombres: 3, mujeres: 7 }], cities: [{ label: 'Sin datos', value: 0 }, { label: 'Cartagena', value: 45.4 }], countries: [] }
    });
    assert.equal(source.metrics.clicks.value, null);
    assert.equal(source.metrics.ctr.value, null);
    assert.equal(source.metrics.impressions.value, 1200);
    assert.deepEqual(source.dataset, [{ label: 'Impresiones', value: 1200 }]);
    assert.deepEqual(source.demographics.ageGender, [{ label: '35-44', hombres: 3, mujeres: 7 }]);
    assert.deepEqual(source.demographics.cities, [{ label: 'Cartagena', value: 45.4 }]);
  });

  await t.test('preserves platform, screen type, entity level and result semantics per screenshot', () => {
    const source = validateAndCleanSourceExtraction({
      sectionCategory: 'ADS', platform: 'META_ADS', screenType: 'AD_TABLE', entityLevel: 'AD',
      resultType: 'CONVERSATIONS', period: { start: '2026-06-25', end: '2026-07-30' },
      metrics: { results: { value: 52, label: 'Conversaciones' } }
    });
    assert.equal(source.platform, 'META_ADS');
    assert.equal(source.screenType, 'AD_TABLE');
    assert.equal(source.entityLevel, 'AD');
    assert.equal(source.resultType, 'CONVERSATIONS');
    assert.deepEqual(source.period, { start: '2026-06-25', end: '2026-07-30' });
  });

  await t.test('preserves organic metric names instead of coercing them into paid canonical keys', () => {
    const source = validateAndCleanSourceExtraction({
      sectionCategory: 'ORGANIC', platform: 'FACEBOOK', screenType: 'METRIC_TRENDS',
      metrics: {
        views: { value: 15500, label: 'Visualizaciones', changePct: -17.6 },
        viewers: { value: 7200, label: 'Espectadores', changePct: -26.2 },
        interactions: { value: 57, label: 'Interacciones', changePct: -67.4 },
        profileVisits: { value: 424, label: 'Visitas', changePct: 2.7 },
        follows: { value: 7, label: 'Seguidores', changePct: -46.2 }
      }
    });
    assert.equal(source.metrics.views.value, 15500);
    assert.equal(source.metrics.views.changePct, -17.6);
    assert.equal(source.metrics.profileVisits.value, 424);
    assert.equal(source.metrics.spend.value, null);
  });

  await t.test('repairs organic metrics when vision places them in paid canonical keys', () => {
    const source = validateAndCleanSourceExtraction({
      sectionCategory: 'ORGANIC',
      platform: 'INSTAGRAM',
      screenType: 'CONTENT_SUMMARY',
      metrics: {
        impressions: { value: '20,1 mil', label: 'Visualizaciones', changePct: -33.1 },
        results: { value: 657, label: 'Interacciones con el contenido', changePct: -49.1 },
        reach: { value: '7 mil', label: 'Alcance', changePct: 31.2 },
        clicks: { value: 23, label: 'Clics en el enlace de Instagram', changePct: 228.6 },
        ctr: { value: 102, label: 'Seguidores', changePct: -82.2 }
      }
    });

    assert.equal(source.metrics.views.value, 20100);
    assert.equal(source.metrics.views.changePct, -33.1);
    assert.equal(source.metrics.interactions.value, 657);
    assert.equal(source.metrics.reachOrganic.value, 7000);
    assert.equal(source.metrics.linkClicks.value, 23);
    assert.equal(source.metrics.follows.value, 102);
    assert.equal(source.metrics.impressions.value, null);
    assert.equal(source.metrics.results.value, null);
    assert.equal(source.metrics.clicks.value, null);
    assert.equal(source.metrics.ctr.value, null);
  });

  await t.test('infers Instagram platform from uploaded organic screenshot filename', () => {
    const source = validateAndCleanSourceExtraction({
      originalName: 'RESUMEN ING.png',
      sectionCategory: 'ORGANIC',
      platform: 'UNKNOWN',
      screenType: 'CONTENT_SUMMARY',
      metrics: {
        impressions: { value: '20,1 mil', label: 'Visualizaciones', changePct: -33.1 },
        results: { value: 657, label: 'Interacciones con el contenido', changePct: -49.1 },
        reach: { value: '7 mil', label: 'Alcance', changePct: 31.2 },
        ctr: { value: 102, label: 'Seguidores', changePct: -82.2 }
      }
    });

    assert.equal(source.platform, 'INSTAGRAM');
    assert.equal(source.sectionCategory, 'ORGANIC');
    assert.equal(source.entityLevel, 'ORGANIC');
    assert.equal(source.metrics.views.value, 20100);
    assert.equal(source.metrics.follows.value, 102);
  });

  await t.test('infers Facebook platform from uploaded organic screenshot filename', () => {
    const source = validateAndCleanSourceExtraction({
      originalName: 'CAP X6 FACE.png',
      sectionCategory: 'ORGANIC',
      platform: 'UNKNOWN',
      screenType: 'METRIC_TRENDS',
      metrics: {
        impressions: { value: '8,6 mil', label: 'Visualizaciones', changePct: 106 },
        results: { value: 43, label: 'Interacciones con el contenido', changePct: -12.2 },
        ctr: { value: 3, label: 'Seguidores', changePct: -40 }
      }
    });

    assert.equal(source.platform, 'FACEBOOK');
    assert.equal(source.metrics.views.value, 8600);
    assert.equal(source.metrics.interactions.value, 43);
    assert.equal(source.metrics.follows.value, 3);
  });

  await t.test('fallback narrative explains a chart without calling every value an interaction', async () => {
    const { generateFallbackNarrative } = await import('../src/services/reportVisionService.js');
    const narrative = generateFallbackNarrative({
      spend: { value: null }, reach: { value: 1300 }, impressions: { value: 4899 },
      clicks: { value: 64 }, ctr: { value: null }, results: { value: 241 }
    }, [{
      sectionId: 'instagram-summary', sectionCategory: 'ORGANIC', platform: 'INSTAGRAM',
      screenType: 'CONTENT_SUMMARY', title: 'Resumen de contenido', metricLabel: 'Visualizaciones',
      dataset: [{ label: 'Total', value: 4899 }]
    }]);
    const comment = narrative.sections[0].narrativeComment;
    assert.equal(comment.split('\n\n').length, 2);
    assert.match(comment, /^Instagram:/);
    assert.doesNotMatch(comment, /interacciones directas/i);
    assert.doesNotMatch(comment, /valida de forma concluyente/i);
    assert.equal(Array.isArray(narrative.oportunidadesYAprendizajes), true);
    assert.deepEqual(Object.keys(narrative.oportunidadesYAprendizajes[0]), ['title', 'evidence', 'learning', 'application']);
    assert.equal(Array.isArray(narrative.recomendacionesEstrategicas), true);
    assert.deepEqual(Object.keys(narrative.recomendacionesEstrategicas[0]), ['priority', 'action', 'rationale', 'kpi']);
  });

  await t.test('fallback writes distinct client-specific narratives for every supported screen type', () => {
    const sections = [
      { sectionId: 'fb', platform: 'FACEBOOK', screenType: 'CONTENT_SUMMARY', period: { start: '2026-06-01', end: '2026-06-30' }, metrics: { views: { value: 15891, changePct: -14.2 }, interactions: { value: 26 }, follows: { value: 9 } }, dataset: [{ label: 'Visualizaciones', value: 15891 }, { label: 'Interacciones', value: 26 }] },
      { sectionId: 'ig', platform: 'INSTAGRAM', screenType: 'CONTENT_SUMMARY', metrics: { views: { value: 39609 }, interactions: { value: 844 }, profileVisits: { value: 521 } }, dataset: [{ label: 'Visualizaciones', value: 39609 }, { label: 'Interacciones', value: 844 }] },
      { sectionId: 'trend', platform: 'FACEBOOK', screenType: 'METRIC_TRENDS', dataset: [{ label: '1 jun', value: 120 }, { label: '15 jun', value: 480 }, { label: '30 jun', value: 90 }] },
      { sectionId: 'formats', platform: 'INSTAGRAM', screenType: 'CONTENT_FORMATS', dataset: [{ label: 'Reels', value: 12000 }, { label: 'Historias', value: 4300 }, { label: 'Publicaciones', value: 2100 }] },
      { sectionId: 'demo', platform: 'INSTAGRAM', screenType: 'AUDIENCE_DEMOGRAPHICS', demographics: { ageGender: [{ label: '25-34', hombres: 28, mujeres: 42 }, { label: '35-44', hombres: 15, mujeres: 20 }], cities: [{ label: 'Bogotá', value: 54 }], countries: [{ label: 'Colombia', value: 91 }] } },
      { sectionId: 'ads', platform: 'META_ADS', screenType: 'AD_TABLE', dataset: [{ label: 'Anuncio A', results: 52, spend: 232826, impressions: 23568, reach: 8978 }, { label: 'Anuncio B', results: 16, spend: 54993, impressions: 5200, reach: 4100 }] },
    ];
    const result = generateFallbackNarrative({}, sections, 'New Pueblito Suites');
    const secondParagraphs = result.sections.map(section => section.narrativeComment.split(/\n\s*\n/)[1]);
    for (const section of result.sections) {
      assert.equal(section.narrativeComment.split(/\n\s*\n/).length, 2);
      assert.match(section.narrativeComment, /Para New Pueblito Suites,/);
      assert.doesNotMatch(section.narrativeComment, /Para el negocio|este dato permite identificar|este es el valor más alto visible/i);
      assert.doesNotMatch(section.narrativeComment, /ventas? (confirmadas?|generadas?)|rentabilidad (positiva|lograda|generada)/i);
      assert.ok((section.narrativeComment.match(/\d[\d.,%]*/g) || []).length >= 2, section.sectionId);
    }
    assert.equal(new Set(secondParagraphs).size, sections.length);
  });

  await t.test('narrative validation rejects generic, repeated or numerically empty comments', () => {
    const sections = [
      { sectionId: 'one', dataset: [{ label: 'A', value: 10 }, { label: 'B', value: 20 }] },
      { sectionId: 'two', dataset: [{ label: 'A', value: 30 }, { label: 'B', value: 40 }] },
    ];
    const repeated = 'Facebook: registró actividad durante el periodo.\n\nPara Cliente Demo, conviene revisar el contenido.';
    assert.equal(validateSectionNarratives([{ sectionId: 'one', narrativeComment: repeated }, { sectionId: 'two', narrativeComment: repeated }], sections, 'Cliente Demo').valid, false);
    assert.equal(validateSectionNarratives([{ sectionId: 'one', narrativeComment: 'Facebook: 10 y 20 marcaron el periodo.\n\nPara el negocio, conviene revisar.' }], [sections[0]], 'Cliente Demo').valid, false);
  });
  await t.test('publishable narrative generation repairs broken Gemini JSON before technical fallback', async () => {
    const { generatePublishableNarrative } = await import('../src/services/reportVisionService.js');
    const calls = [];
    const result = await generatePublishableNarrative({}, [{ sectionId: 'one', platform: 'Instagram', dataset: [{ label: 'Vistas', value: 100 }, { label: 'Clics', value: 5 }] }], 'Cliente Demo', {
      generateFullNarrative: async () => { calls.push('full'); return '{"headline":"x","summaryPoints":["a","b","c"],"keyAchievements":"k","actionPlan":[],"logrosYAvances":[],"contenidoTopAnalisis":"","oportunidadesYAprendizajes":[],"recomendacionesEstrategicas":[],"sections":[{"sectionId":"one","narrativeComment":"Instagram: Vistas registró 100 y Clics registró 5.\\n\\nPara Cliente Demo, conviene priorizar el formato con más respuesta."}],"granularNarratives":[]'; },
      repairNarrativeJson: async () => { calls.push('repair'); return { headline: 'x', summaryPoints: ['a','b','c'], keyAchievements: 'k', actionPlan: [], logrosYAvances: [], contenidoTopAnalisis: '', oportunidadesYAprendizajes: [], recomendacionesEstrategicas: [], sections: [{ sectionId: 'one', narrativeComment: 'Instagram: Vistas registró 100 y Clics registró 5.\n\nPara Cliente Demo, conviene priorizar el formato con más respuesta.' }], granularNarratives: [] }; }
    });
    assert.equal(result.status, 'PUBLISHED');
    assert.deepEqual(calls, ['full', 'repair']);
  });

  await t.test('publishable narrative generation regenerates only invalid sections after partial editorial failure', async () => {
    const { generatePublishableNarrative } = await import('../src/services/reportVisionService.js');
    const sections = [
      { sectionId: 'ok', platform: 'Facebook', dataset: [{ label: 'Alcance', value: 200 }, { label: 'Visitas', value: 40 }] },
      { sectionId: 'bad', platform: 'Instagram', dataset: [{ label: 'Reels', value: 300 }, { label: 'Historias', value: 90 }] }
    ];
    const calls = [];
    const base = { headline: 'x', summaryPoints: ['a','b','c'], keyAchievements: 'k', actionPlan: [], logrosYAvances: [], contenidoTopAnalisis: '', oportunidadesYAprendizajes: [], recomendacionesEstrategicas: [], granularNarratives: [] };
    const result = await generatePublishableNarrative({}, sections, 'Cliente Demo', {
      generateFullNarrative: async () => ({ ...base, sections: [
        { sectionId: 'ok', narrativeComment: 'Facebook: Alcance registró 200 y Visitas registró 40.\n\nPara Cliente Demo, conviene sostener la lectura de alcance con visitas.' },
        { sectionId: 'bad', narrativeComment: 'Instagram: registró actividad.\n\nPara el negocio, conviene revisar.' }
      ] }),
      regenerateSections: async (invalid) => { calls.push(invalid.map(s => s.sectionId)); return invalid.map(s => ({ sectionId: s.sectionId, narrativeComment: 'Instagram: Reels registró 300 e Historias registró 90.\n\nPara Cliente Demo, conviene convertir esta diferencia en una prueba de formatos para el próximo calendario.' })); }
    });
    assert.equal(result.status, 'PUBLISHED');
    assert.deepEqual(calls, [['bad']]);
  });

  await t.test('publishable narrative generation returns NARRATIVE_FAILED without exposing technical fallback', async () => {
    const { generatePublishableNarrative } = await import('../src/services/reportVisionService.js');
    const result = await generatePublishableNarrative({}, [{ sectionId: 'one', dataset: [{ label: 'A', value: 10 }, { label: 'B', value: 20 }] }], 'Cliente Demo', {
      generateFullNarrative: async () => { throw new Error('bad json'); },
      repairNarrativeJson: async () => { throw new Error('repair failed'); },
      regenerateSections: async () => { throw new Error('regen failed'); }
    });
    assert.equal(result.status, 'REVIEW');
    assert.equal(result.publishable, false);
    assert.equal(result.narrative, null);
    assert.ok(result.technicalDraft);
  });

  await t.test('processNarrativeResponse correctly decides frontend updates', async () => {
    const { processNarrativeResponse } = await import('../src/lib/reportPresentation.js');

    // Test Case: success true
    const successResult = processNarrativeResponse({ success: true, report: { id: 'rep-1' } });
    assert.equal(successResult.shouldUpdateReport, true);
    assert.equal(successResult.shouldShowSuccess, true);
    assert.equal(successResult.shouldThrowError, false);

    // Test Case: success false with needsRegeneration
    const failedResult = processNarrativeResponse({
      success: false,
      needsRegeneration: true,
      report: { id: 'rep-1', narrative: { generationMode: 'NARRATIVE_FAILED' } }
    });
    assert.equal(failedResult.shouldUpdateReport, true);
    assert.equal(failedResult.shouldShowWarning, true);
    assert.equal(failedResult.shouldThrowError, false);

    // Test Case: real API 500 error
    const errorResult = processNarrativeResponse({ error: 'Server error 500' });
    assert.equal(errorResult.shouldThrowError, true);
    assert.equal(errorResult.shouldUpdateReport, false);
  });

  await t.test('buildNarrativeErrorLog truncates extremely large strings safely', async () => {
    const { buildNarrativeErrorLog } = await import('../src/lib/reportPresentation.js');
    const largeContent = 'A'.repeat(5000);
    const logOutput = buildNarrativeErrorLog(new Error('Test Error'), largeContent, { step: 'generate', reportId: '123' });
    assert.match(logOutput, /\[RECOVERABLE ERROR\]/);
    assert.match(logOutput, /Test Error/);
    assert.match(logOutput, /\[Step: generate\]/);
    assert.match(logOutput, /\[Report ID: 123\]/);
    assert.match(logOutput, /Raw content length: 5000/);
    assert.match(logOutput, /Snippet:.*\[TRUNCATED\]/);
    assert.ok(logOutput.length < 500); // Definitely truncated
  });

  await t.test('generatePublishableNarrative handles timeout cancellation', async () => {
    const { generatePublishableNarrative } = await import('../src/services/reportVisionService.js');
    const timeoutContext = { cancelled: false };

    // Simulate a slow generation that finishes after a timeout cancellation
    const resultPromise = generatePublishableNarrative({}, [], 'Cliente Demo', {
      generateFullNarrative: async () => {
        // Mock a long running promise
        await new Promise(resolve => setTimeout(resolve, 50));
        return { headline: 'x', summaryPoints: ['a', 'b', 'c'] };
      }
    }, timeoutContext);

    // Cancel immediately
    timeoutContext.cancelled = true;

    const finalResult = await resultPromise;
    assert.equal(finalResult.publishable, false);
    assert.equal(finalResult.status, 'REVIEW');
  });

});

test('narrative failure update keeps Prisma status in REVIEW and flags regeneration', async () => {
  const { buildNarrativeFailureUpdate } = await import('../src/routes/api/reports.js');
  const update = buildNarrativeFailureUpdate([{ step: 'generate', error: 'broken JSON' }]);
  assert.equal(update.status, 'REVIEW');
  assert.equal(update.narrative.generationMode, 'NARRATIVE_FAILED');
  assert.equal(update.narrative.needsRegeneration, true);
  assert.notEqual(update.status, 'NARRATIVE_FAILED');
});

test('narrative parse errors preserve raw Gemini content', async () => {
  const { parseNarrativeResponse } = await import('../src/services/reportVisionService.js');
  const rawContent = '{ "\n],\n"keyAchievements": "roto" }';
  assert.throws(() => parseNarrativeResponse(rawContent, [], 'Cliente Demo'), (error) => {
    assert.equal(error.rawContent, rawContent);
    return true;
  });
});

test('publishable narrative repair receives rawContent after parse failure', async () => {
  const { generatePublishableNarrative } = await import('../src/services/reportVisionService.js');
  const rawContent = '{ "\n],\n"keyAchievements": "roto" }';
  let repairInput;
  await generatePublishableNarrative({}, [], 'Cliente Demo', {
    generateFullNarrative: async () => rawContent,
    repairNarrativeJson: async (input) => {
      repairInput = input;
      throw new Error('repair failed');
    }
  });
  assert.equal(repairInput.rawContent, rawContent);
});

test('publishable narrative returns non-publishable REVIEW-safe result when repair fails', async () => {
  const { generatePublishableNarrative, buildNarrativeFailureUpdate } = await import('../src/services/reportVisionService.js');
  const result = await generatePublishableNarrative({}, [], 'Cliente Demo', {
    generateFullNarrative: async () => '{ "\n],\n"keyAchievements": "roto" }',
    repairNarrativeJson: async () => { throw new Error('repair failed'); }
  });
  assert.equal(result.publishable, false);
  assert.equal(result.status, 'REVIEW');
  const update = buildNarrativeFailureUpdate(result.attempts);
  assert.equal(update.status, 'REVIEW');
});

test('technical fallback is not published into final sections after narrative failure', async () => {
  const { generatePublishableNarrative, buildNarrativeFailureUpdate } = await import('../src/services/reportVisionService.js');
  const sections = [{ sectionId: 'one', platform: 'Instagram', dataset: [{ label: 'Vistas', value: 100 }, { label: 'Clics', value: 5 }] }];
  const result = await generatePublishableNarrative({}, sections, 'Cliente Demo', {
    generateFullNarrative: async () => '{ "\n],\n"keyAchievements": "roto" }',
    repairNarrativeJson: async () => { throw new Error('repair failed'); }
  });
  const update = buildNarrativeFailureUpdate(result.attempts, result.technicalDraft);
  assert.ok(result.technicalDraft?.sections?.[0]?.narrativeComment);
  assert.equal(update.sections, undefined);
  assert.equal(update.narrative.technicalDraft.sections[0].narrativeComment, result.technicalDraft.sections[0].narrativeComment);
});

test('AI narrative provider uses OpenAI first when OPENAI_API_KEY is configured', async () => {
  const { generateNarrativeWithAIProvider } = await import('../src/services/reportVisionService.js');
  const calls = [];
  const result = await generateNarrativeWithAIProvider({}, [], 'Cliente Demo', {
    openaiGenerator: async () => {
      calls.push('openai');
      return { headline: 'openai', summaryPoints: [], keyAchievements: '', actionPlan: [], logrosYAvances: [], contenidoTopAnalisis: '', oportunidadesYAprendizajes: [], recomendacionesEstrategicas: [], sections: [], granularNarratives: [] };
    },
    geminiGenerator: async () => {
      calls.push('gemini');
      return { headline: 'gemini' };
    },
    env: { OPENAI_API_KEY: 'openai-key', GEMINI_API_KEY: 'gemini-key' }
  });

  assert.equal(result.headline, 'openai');
  assert.deepEqual(calls, ['openai']);
});

test('report creation stores the selected reporting period for narrative generation', async () => {
  const route = await fs.readFile('src/routes/api/reports.js', 'utf8');
  assert.match(route, /validatedNormalizedMetrics\.reportPeriod\s*=\s*\{/);
  assert.match(route, /start:\s*parsedStartDate\.toISOString\(\)\.slice\(0,\s*10\)/);
  assert.match(route, /end:\s*parsedEndDate\.toISOString\(\)\.slice\(0,\s*10\)/);
});

test('AI narrative provider reports the OpenAI failure without silently falling back to Gemini', async () => {
  const { generateNarrativeWithAIProvider } = await import('../src/services/reportVisionService.js');
  const calls = [];
  await assert.rejects(
    () => generateNarrativeWithAIProvider({}, [], 'Cliente Demo', {
      openaiGenerator: async () => {
        calls.push('openai');
        throw new Error('openai unavailable');
      },
      geminiGenerator: async () => calls.push('gemini'),
      env: { OPENAI_API_KEY: 'openai-key', GEMINI_API_KEY: 'gemini-key' }
    }),
    /openai unavailable/
  );
  assert.deepEqual(calls, ['openai']);
});

test('AI narrative provider requires OpenAI configuration even when Gemini is configured', async () => {
  const { generateNarrativeWithAIProvider } = await import('../src/services/reportVisionService.js');
  await assert.rejects(
    () => generateNarrativeWithAIProvider({}, [], 'Cliente Demo', {
      env: { GEMINI_API_KEY: 'gemini-key' }
    }),
    /Missing OPENAI_API_KEY/
  );
});

test('active reports and minutes flows use OpenAI and deterministic HTML', async () => {
  const reportsRoute = await fs.readFile('src/routes/api/reports.js', 'utf8');
  const summary = await fs.readFile('src/components/modules/Minutes/GeneralSummary.jsx', 'utf8');
  const analysis = await fs.readFile('src/components/modules/Minutes/CompleteAnalysis.jsx', 'utf8');
  assert.match(reportsRoute, /extractMetricsWithOpenAI/);
  assert.doesNotMatch(reportsRoute, /extractMetricsWithGemini/);
  assert.match(summary, /frontendApiService\.generateCompletion/);
  assert.match(summary, /generateSummaryHTML/);
  assert.doesNotMatch(summary, /generateGemini/);
  assert.match(analysis, /frontendApiService\.generateCompletion/);
  assert.match(analysis, /generateAnalysisHTML/);
  assert.doesNotMatch(analysis, /generateGemini/);
});

test('OpenAI narrative request omits unsupported temperature parameter', async () => {
  const { generateNarrativeWithOpenAI } = await import('../src/services/reportVisionService.js');
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  let requestBody;

  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        headline: 'Narrativa lista',
        summaryPoints: ['Uno', 'Dos', 'Tres'],
        keyAchievements: 'Lectura validada.',
        actionPlan: [],
        logrosYAvances: [],
        contenidoTopAnalisis: '',
        oportunidadesYAprendizajes: [],
        recomendacionesEstrategicas: [],
        sections: [],
        granularNarratives: []
      })
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  process.env.OPENAI_API_KEY = 'mock-openai-key';

  try {
    const result = await generateNarrativeWithOpenAI({}, [], 'Cliente Demo');
    assert.equal(result.headline, 'Narrativa lista');
    assert.equal(Object.hasOwn(requestBody, 'temperature'), false);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.OPENAI_API_KEY = originalKey;
  }
});

test('AI narrative prompts include the official selected report period and reject zero metrics', async () => {
  const { generateNarrativeWithOpenAI } = await import('../src/services/reportVisionService.js');
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  let promptText = '';

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    promptText = body.input[0].content[0].text;
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        headline: 'Narrativa lista',
        summaryPoints: ['Uno', 'Dos', 'Tres'],
        keyAchievements: 'Lectura validada.',
        actionPlan: [],
        logrosYAvances: [],
        contenidoTopAnalisis: '',
        oportunidadesYAprendizajes: [],
        recomendacionesEstrategicas: [],
        sections: [],
        granularNarratives: []
      })
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  process.env.OPENAI_API_KEY = 'mock-openai-key';

  try {
    await generateNarrativeWithOpenAI({ reportPeriod: { start: '2026-07-01', end: '2026-07-31' } }, [], 'Cliente Demo');
    assert.match(promptText, /PERIODO OFICIAL DEL INFORME:\s*2026-07-01 a 2026-07-31/);
    assert.match(promptText, /no menciones estadisticas con valor 0/i);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.OPENAI_API_KEY = originalKey;
  }
});

test('vision extraction prompt requires organic headline metrics by platform', async () => {
  const service = await fs.readFile('src/services/reportVisionService.js', 'utf8');
  assert.match(service, /For organic Facebook\/Instagram screenshots, extract visible headline cards/i);
  assert.match(service, /Visualizaciones\s*->\s*views/);
  assert.match(service, /Seguidores\s*->\s*follows/);
  assert.match(service, /Clics en el enlace\s*->\s*linkClicks/);
});

test('reports narrative endpoint gives AI providers enough time to finish long reports', async () => {
  const route = await fs.readFile('src/routes/api/reports.js', 'utf8');
  const timeoutConstMatch = route.match(/const\s+NARRATIVE_GENERATION_TIMEOUT_MS\s*=\s*(\d+)/);
  const timeoutUseMatch = route.match(/generatePublishableNarrative[\s\S]*?,\s*NARRATIVE_GENERATION_TIMEOUT_MS,\s*["']([^"']+)["']/);
  assert.ok(timeoutConstMatch, 'generate-narrative route should define an explicit narrative timeout constant');
  assert.ok(timeoutUseMatch, 'generate-narrative route should use the narrative timeout constant');
  assert.ok(Number(timeoutConstMatch[1]) >= 270000, `narrative timeout is too short: ${timeoutConstMatch[1]}ms`);
  assert.doesNotMatch(timeoutUseMatch[1], /Gemini/i);
});

test('reports frontend waits at least as long as the backend narrative timeout', async () => {
  const frontend = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
  const narrativePostMatch = frontend.match(/\/generate-narrative[\s\S]*?timeout:\s*(\d+)/);
  assert.ok(narrativePostMatch, 'frontend generate-narrative request should configure an explicit timeout');
  assert.ok(Number(narrativePostMatch[1]) >= 270000, `frontend narrative timeout is too short: ${narrativePostMatch[1]}ms`);
  assert.match(frontend, /setReport\(patchResponse\.data\.report\)/);
});

test('reports route persists platform-specific organic summaries', async () => {
  const route = await fs.readFile('src/routes/api/reports.js', 'utf8');
  assert.match(route, /validatedNormalizedMetrics\.organicSummaryByPlatform\s*=\s*scopedReportData\.organicSummaryByPlatform/);
});

test('reports route never writes NARRATIVE_FAILED as Prisma status', async () => {
  const route = await fs.readFile('src/routes/api/reports.js', 'utf8');
  assert.doesNotMatch(route, /status:\s*'NARRATIVE_FAILED'/);
  assert.match(route, /generationMode:\s*'NARRATIVE_FAILED'/);
  assert.match(route, /status:\s*'REVIEW'/);
});

test('minutes HTML logo includes a self-contained fallback without throwing', () => {
  const logo = getBrainStudioLogoSVG();
  assert.match(logo, /data:image\/svg\+xml/);
  assert.match(logo, /BrainStudio/);
});

test('minutes reports use the BrainStudio palette and never render undefined fields', () => {
  const summary = generateSummaryHTML({
    meeting_topics: ['Tema comercial'],
    action_items: ['Tarea: Enviar propuesta - Prioridad: Alta - Responsable: Camila'],
  }, 'Reunión comercial');
  const analysis = generateAnalysisHTML({
    opportunities: ['Título: Crecimiento digital - Descripción: Activar un canal medible'],
    recommendations: [{ title: 'Instrumentar métricas', description: 'Definir KPIs semanales', priority: 'Alta' }],
  }, 'Reunión comercial');

  assert.match(summary, /#0D97A6/);
  assert.match(summary, /#12A6A6/);
  assert.match(summary, /Enviar propuesta/);
  assert.match(summary, /Camila/);
  assert.match(analysis, /Crecimiento digital/);
  assert.match(analysis, /Instrumentar métricas/);
  assert.doesNotMatch(`${summary}${analysis}`, />undefined</i);
  assert.equal((summary.match(/alt="BrainStudio"/g) || []).length, 1);
});
