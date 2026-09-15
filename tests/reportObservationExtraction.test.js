import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanNumericValue, extractMetricsWithOpenAI, validateAndCleanSourceExtraction, visionExtractionSchema } from '../src/services/reportVisionService.js';
import { sampleAugustExtraction } from './fixtures/reportObservationsAugust.js';

test('reads K/M, signed changes and decimal percentages without changing their magnitude', () => {
  for (const [raw, expected] of [['20.1K', 20100], ['1,2 M', 1200000], ['−42,9%', -42.9], ['0.123%', 0.123], ['1.234.567', 1234567], ['1.234,56 COP', 1234.56], ['0', 0]]) {
    assert.equal(cleanNumericValue(raw), expected, raw);
  }
  assert.equal(cleanNumericValue('01:32'), null, 'A duration needs explicit units, not concatenated digits');
  assert.equal(cleanNumericValue('2 h 17 min'), null);
});

test('preserves every repeated metric and its network/scope instead of taking the last views', () => {
  const clean = validateAndCleanSourceExtraction(sampleAugustExtraction, { sourceId: 'sample' });
  assert.equal(clean.observations.length, 7);
  assert.deepEqual(clean.observations.filter(item => item.key === 'views').map(item => item.value), [9400, 1017, 8418, 8411, 7, 1049]);
  assert.equal(clean.observations.find(item => item.value === 7).scope, 'PAID');
  assert.equal(clean.observations.find(item => item.value === 9400).platform, 'CROSS_PLATFORM');
  assert.equal(clean.metrics.views.value, null, 'ambiguous legacy keys cannot silently select one number');
  const reversed = validateAndCleanSourceExtraction({ ...sampleAugustExtraction, metrics: [...sampleAugustExtraction.metrics].reverse() });
  assert.equal(reversed.metrics.views.value, null);
});

test('retains zero and unknown confidence while applying the agency currency convention', () => {
  const clean = validateAndCleanSourceExtraction({ platform: 'META_ADS', metrics: [
    { key: 'clicks', value: 0, label: 'Clics', unit: 'count', scope: 'PAID', confidence: 0 },
    { key: 'spend', value: 25, label: 'Importe gastado', unit: '$UNKNOWN', scope: 'PAID' }
  ] });
  assert.equal(clean.usable, true);
  assert.equal(clean.metrics.clicks.value, 0);
  assert.equal(clean.metrics.clicks.confidence, 0);
  assert.equal(clean.metrics.spend.unit, 'COP');
  assert.equal(clean.observations.find(item => item.key === 'spend').currencyProvenance, 'AGENCY_DEFAULT');
  assert.equal(clean.metrics.spend.confidence, null);
  assert.equal(clean.confidence, null);
});

test('uses percentage unit when a numeric string has three decimal digits', () => {
  const source = validateAndCleanSourceExtraction({ metrics: [{ key: 'ctr', value: '0.123', unit: '%', changePct: '−0.125' }] });
  assert.equal(source.observations[0].value, 0.123);
  assert.equal(source.observations[0].changePct, -0.125);
});

test('preserves independent panels, their columns and zero cells', () => {
  const withSyntheticZero = structuredClone(sampleAugustExtraction);
  withSyntheticZero.panels[0].dataset[1].value = 0;
  const clean = validateAndCleanSourceExtraction(withSyntheticZero);
  assert.equal(clean.panels.length, 2);
  assert.equal(clean.panels[0].metricKey, 'contentCount');
  assert.equal(clean.panels[0].dataset[1].value, 0);
  assert.equal(clean.panels[1].metricKey, 'views');
});

test('normalizes the exact three-second views alias in observations and panels without merging other video metrics', () => {
  const extracted = { metrics: [
    { id: 'three', key: 'threeSecondViews', label: 'Reproducciones de 3 segundos', value: 286, rawValue: '286', unit: 'count', changePct: 0.7, evidence: 'Tarjeta: Reproducciones de 3 segundos' },
    { id: 'all', key: 'videoViews', value: 900 },
    { id: 'people', key: 'viewers', value: 600 }
  ], panels: [{ metricKey: 'threeSecondViews', dataset: [{ label: 'Reproducciones de 3 segundos', value: 286 }] }] };
  const cleaned = validateAndCleanSourceExtraction(extracted, { sourceId: 'alias' });
  assert.deepEqual(cleaned.observations.map(item => item.key), ['threeSecondVideoViews', 'videoViews', 'viewers']);
  assert.equal(cleaned.panels[0].metricKey, 'threeSecondVideoViews');
  assert.equal(cleaned.observations[0].rawValue, '286');
  assert.equal(cleaned.observations[0].changePct, 0.7);
  assert.equal(cleaned.observations[0].evidence, extracted.metrics[0].evidence);
  assert.equal(extracted.metrics[0].key, 'threeSecondViews', 'raw extraction remains immutable');
});

test('schema can express network per observation and several charts per image', () => {
  assert.ok(visionExtractionSchema.properties.metrics.items.properties.platform);
  assert.ok(visionExtractionSchema.properties.metrics.items.properties.rawValue);
  assert.ok(visionExtractionSchema.properties.metrics.items.properties.contextKey);
  assert.ok(visionExtractionSchema.properties.panels.items.properties.metricKey);
});

test('a filename is an operator hint and does not prove the source platform', () => {
  const source = validateAndCleanSourceExtraction({ originalName: 'resumen ing.png', platform: 'UNKNOWN', metrics: [{ key: 'views', value: 100 }] });
  assert.equal(source.platform, 'UNKNOWN');
  assert.equal(source.observations[0].platform, 'UNKNOWN');
});

test('keeps a readable context label next to each technically distinct observation', () => {
  const source = validateAndCleanSourceExtraction({ metrics: [{ key: 'views', value: 1017, platform: 'FACEBOOK', contextKey: 'facebook_distribution_of_instagram_content', contextLabel: 'Contenido de Instagram mostrado en Facebook' }] });
  assert.equal(source.observations[0].contextLabel, 'Contenido de Instagram mostrado en Facebook');
  assert.ok(visionExtractionSchema.properties.metrics.items.properties.contextLabel);
  assert.ok(visionExtractionSchema.properties.panels.items.properties.contextLabel);
});

test('vision accepts complete fenced JSON and passes declaration separately from visible source period', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ output_text: '```json\n' + JSON.stringify(sampleAugustExtraction) + '\n```' }));
  };
  try {
    const result = await extractMetricsWithOpenAI(Buffer.from('test'), 'image/png', { clientName: 'SAMPLE', reportPeriod: { start: '2026-08-01', end: '2026-08-31' }, sourceId: 'sample', declaration: { platform: 'INSTAGRAM', sectionCategory: 'ORGANIC' } });
    assert.equal(result.metrics.length, 7);
    assert.deepEqual(result.period, { start: null, end: null });
    assert.match(body.input[0].content[0].text, /2026-08-01/);
    assert.match(body.input[0].content[0].text, /SAMPLE/);
    assert.match(body.instructions, /8411/);
    assert.match(body.instructions, /9702/);
    assert.match(body.instructions, /icono.*Facebook/i);
    assert.match(body.instructions, /unidad.*count/i);
    assert.match(body.instructions, /Según N contenidos.*no.*conteo publicado/i);
    assert.match(body.instructions, /plataforma principal.*tablero/i);
    assert.match(body.instructions, /CROSS_PLATFORM.*solo.*tarjeta/i);
    assert.match(body.instructions, /followers.*Seguidores del período/i);
    assert.match(body.instructions, /ausencia.*nuevos.*saldo/i);
    assert.match(body.instructions, /guion.*null.*rawValue/i);
    assert.match(body.instructions, /encabezados.*no.*observaciones/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  }
});

test('vision rejects a truncated response rather than repairing and accepting a partial screenshot', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = async () => new Response(JSON.stringify({ output_text: '{"metrics":{"spend":{"value":2500.000000000000000000000000' }));
  try {
    await assert.rejects(extractMetricsWithOpenAI(Buffer.from('test')), /incomplet|JSON/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  }
});

test('report extraction uses its evaluated Sol default and preserves response usage', async () => {
  const originalFetch = globalThis.fetch;
  const original = Object.fromEntries(['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_MODEL_VISION', 'OPENAI_MODEL_REPORT_VISION'].map(key => [key, process.env[key]]));
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_MODEL_VISION;
  delete process.env.OPENAI_MODEL_REPORT_VISION;
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: 'response-test', model: 'gpt-6-astra', output_text: '{"metrics":[]}', usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300, input_tokens_details: { cached_tokens: 10 }, output_tokens_details: { reasoning_tokens: 50 } } }));
  };
  try {
    const result = await extractMetricsWithOpenAI(Buffer.from('test'));
    assert.equal(body.model, 'gpt-5.6-sol');
    assert.equal(result.extractionMetadata.usage.totalTokens, 300);
    assert.equal(result.extractionMetadata.usage.cachedInputTokens, 10);
    assert.equal(result.extractionMetadata.responseId, 'response-test');
    assert.equal(validateAndCleanSourceExtraction(result).extractionMetadata.usage.totalTokens, 300);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('report-only override is respected and reports never inherit global or generic vision models', async () => {
  const originalFetch = globalThis.fetch;
  const keys = ['OPENAI_API_KEY', 'OPENAI_MODEL_REPORT_VISION', 'OPENAI_MODEL_VISION', 'OPENAI_MODEL'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_REPORT_VISION = 'report-candidate';
  process.env.OPENAI_MODEL_VISION = 'vision-configured';
  process.env.OPENAI_MODEL = 'generic-configured';
  let selected;
  globalThis.fetch = async (_url, options) => { selected = JSON.parse(options.body).model; return new Response('{"output_text":"{\\"metrics\\":[]}"}'); };
  try {
    await extractMetricsWithOpenAI(Buffer.from('test'));
    assert.equal(selected, 'report-candidate');
    delete process.env.OPENAI_MODEL_REPORT_VISION;
    await extractMetricsWithOpenAI(Buffer.from('test'));
    assert.equal(selected, 'gpt-5.6-sol');
    delete process.env.OPENAI_MODEL_VISION;
    await extractMetricsWithOpenAI(Buffer.from('test'));
    assert.equal(selected, 'gpt-5.6-sol');
    delete process.env.OPENAI_MODEL;
    await extractMetricsWithOpenAI(Buffer.from('test'));
    assert.equal(selected, 'gpt-5.6-sol');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('neutral period followers and explicit null table cells survive cleaning without becoming a stock or zero', () => {
  const source = validateAndCleanSourceExtraction({ metrics: [
    { id: 'followers', key: 'followers', label: 'Seguidores del período', value: 12, rawValue: '12', platform: 'INSTAGRAM', scope: 'TOTAL' },
    { id: 'missing-result', key: 'results', label: 'Resultados', value: null, rawValue: '—', platform: 'META_ADS', scope: 'PAID' },
    { id: 'missing-cost', key: 'costPerResult', label: 'Costo por resultado', value: null, rawValue: '—', platform: 'META_ADS', scope: 'PAID', unit: '$UNKNOWN' }
  ], panels: [{ id: 'ads', metricKey: 'results', dataset: [{ label: 'Sample ad', results: null, costPerResult: null }] }] });
  assert.equal(source.observations[0].key, 'followers');
  assert.equal(source.observations[1].value, null);
  assert.equal(source.observations[1].rawValue, '—');
  assert.equal(source.observations[2].value, null);
  assert.equal(source.panels[0].dataset[0].costPerResult, null);
  assert.ok(visionExtractionSchema.properties.panels.items.properties.dataset.items.properties.costPerResult);
});
