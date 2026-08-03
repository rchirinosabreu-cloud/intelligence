import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildReportExtractionPrompt,
  buildReportGenerationConfig,
  parseAndValidateReportExtraction,
  toLegacyReportAnalysis,
} from '../services/reportExtractionService.js';

const validExtraction = {
  schemaVersion: 1,
  currency: 'COP',
  period: { label: 'Julio 2026', start: '2026-07-01', end: '2026-07-30' },
  organic: {
    summaryMetrics: [
      { key: 'views', label: 'Visualizaciones', value: 42500, unit: 'COUNT', changePct: -42.9, sourceId: 'organic-1', confidence: 0.98 },
    ],
    timeSeries: [
      { key: 'instagram_views', label: 'Visualizaciones de Instagram', unit: 'COUNT', sourceId: 'organic-1', points: [{ label: '1 jul', value: 2800 }] },
    ],
    breakdowns: [],
    audiences: [],
    topContent: [],
    insights: [],
    recommendations: [],
  },
  ads: {
    summaryMetrics: [
      { key: 'spend', label: 'Inversión', value: 232826, unit: 'CURRENCY', sourceId: 'ads-1', confidence: 0.99 },
    ],
    timeSeries: [],
    breakdowns: [],
    topAds: [],
    insights: [],
    recommendations: [],
  },
  executiveSummary: [],
  warnings: [],
};

describe('reportExtractionService', () => {
  it('parses a valid extraction wrapped in a markdown JSON block', () => {
    const raw = `\`\`\`json\n${JSON.stringify(validExtraction)}\n\`\`\``;

    assert.deepEqual(parseAndValidateReportExtraction(raw), validExtraction);
  });

  it('accepts an organic-only report without inventing an ads section', () => {
    const organicOnly = { ...validExtraction, ads: null };

    assert.equal(parseAndValidateReportExtraction(JSON.stringify(organicOnly)).ads, null);
  });

  it('rejects chart points with non-numeric values', () => {
    const invalid = structuredClone(validExtraction);
    invalid.organic.timeSeries[0].points[0].value = '2.800';

    assert.throws(() => parseAndValidateReportExtraction(JSON.stringify(invalid)),
      /organic\.timeSeries\[0\]\.points\[0\]\.value must be a finite number/,
    );
  });

  it('rejects USD when the requested account currency is COP', () => {
    const invalid = { ...validExtraction, currency: 'USD' };

    assert.throws(() => parseAndValidateReportExtraction(JSON.stringify(invalid), { currency: 'COP' }),
      /currency must be COP/,
    );
  });

  it('rejects non-numeric breakdown values before they reach a bar chart', () => {
    const invalid = structuredClone(validExtraction);
    invalid.organic.breakdowns = [{
      key: 'formats',
      label: 'Formatos publicados',
      unit: 'COUNT',
      sourceId: 'organic-1',
      items: [{ label: 'Historias', value: '22' }],
    }];

    assert.throws(() => parseAndValidateReportExtraction(JSON.stringify(invalid)),
      /organic\.breakdowns\[0\]\.items\[0\]\.value must be a finite number/,
    );
  });

  it('instructs the model to preserve COP and never fabricate time-series points', () => {
    const prompt = buildReportExtractionPrompt({
      clientName: 'Cliente Demo',
      currency: 'COP',
      organicSources: [{ sourceId: 'organic-1', filename: 'instagram.png' }],
      adsSources: [{ sourceId: 'ads-1', filename: 'meta-ads.png' }],
    });

    assert.match(prompt, /COP/);
    assert.match(prompt, /232\.826/);
    assert.match(prompt, /232826/);
    assert.match(prompt, /No inventes puntos/);
    assert.match(prompt, /organic-1/);
    assert.match(prompt, /ads-1/);
  });

  it('keeps the current report preview working while exposing structured data', () => {
    const analysis = toLegacyReportAnalysis(validExtraction, {
      organic: { 'organic-1': '/api/reports/image-proxy?path=organic.png' },
      ads: { 'ads-1': '/api/reports/image-proxy?path=ads.png' },
    });

    assert.equal(analysis.organic_analysis[0].tipo, 'AVANCE');
    assert.equal(analysis.organic_analysis[0].imagen_url, '/api/reports/image-proxy?path=organic.png');
    assert.equal(analysis.performance_analysis[0].tipo, 'MACRO');
    assert.equal(analysis.performance_analysis[0].imagen_url, '/api/reports/image-proxy?path=ads.png');
    assert.equal(analysis.hoja_de_ruta.length, 0);
  });

  it('places Gemini JSON settings directly in GenerateContentConfig', () => {
    const config = buildReportGenerationConfig();

    assert.equal(config.responseMimeType, 'application/json');
    assert.equal(config.temperature, 0.1);
    assert.equal(config.maxOutputTokens, 16384);
    assert.equal(config.generationConfig, undefined);
  });
});
