import { parseJsonResponse } from './aiService.js';

const REQUIRED_COLLECTIONS = [
  'summaryMetrics',
  'timeSeries',
  'breakdowns',
  'insights',
  'recommendations',
];

const assertObject = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
};

const assertArray = (value, path) => {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
};

const assertFiniteNumber = (value, path) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
};

const validateMetric = (metric, path) => {
  assertObject(metric, path);
  if (!metric.key || typeof metric.key !== 'string') throw new Error(`${path}.key is required`);
  if (!metric.label || typeof metric.label !== 'string') throw new Error(`${path}.label is required`);
  assertFiniteNumber(metric.value, `${path}.value`);
  if (!metric.unit || typeof metric.unit !== 'string') throw new Error(`${path}.unit is required`);
  if (!metric.sourceId || typeof metric.sourceId !== 'string') throw new Error(`${path}.sourceId is required`);
  if (metric.changePct !== undefined && metric.changePct !== null) {
    assertFiniteNumber(metric.changePct, `${path}.changePct`);
  }
  if (metric.confidence !== undefined) {
    assertFiniteNumber(metric.confidence, `${path}.confidence`);
  }
};

const validateTimeSeries = (series, path) => {
  assertObject(series, path);
  if (!series.key || typeof series.key !== 'string') throw new Error(`${path}.key is required`);
  if (!series.sourceId || typeof series.sourceId !== 'string') throw new Error(`${path}.sourceId is required`);
  assertArray(series.points, `${path}.points`);
  series.points.forEach((point, pointIndex) => {
    const pointPath = `${path}.points[${pointIndex}]`;
    assertObject(point, pointPath);
    if (!point.label || typeof point.label !== 'string') throw new Error(`${pointPath}.label is required`);
    assertFiniteNumber(point.value, `${pointPath}.value`);
  });
};

const validateBreakdown = (breakdown, path) => {
  assertObject(breakdown, path);
  if (!breakdown.key || typeof breakdown.key !== 'string') throw new Error(`${path}.key is required`);
  if (!breakdown.sourceId || typeof breakdown.sourceId !== 'string') throw new Error(`${path}.sourceId is required`);
  assertArray(breakdown.items, `${path}.items`);
  breakdown.items.forEach((item, itemIndex) => {
    const itemPath = `${path}.items[${itemIndex}]`;
    assertObject(item, itemPath);
    if (!item.label || typeof item.label !== 'string') throw new Error(`${itemPath}.label is required`);
    assertFiniteNumber(item.value, `${itemPath}.value`);
  });
};

const validateSection = (section, path, extraCollection) => {
  assertObject(section, path);
  [...REQUIRED_COLLECTIONS, extraCollection].forEach((collection) => {
    assertArray(section[collection], `${path}.${collection}`);
  });
  section.summaryMetrics.forEach((metric, index) => validateMetric(metric, `${path}.summaryMetrics[${index}]`));
  section.timeSeries.forEach((series, index) => validateTimeSeries(series, `${path}.timeSeries[${index}]`));
  section.breakdowns.forEach((breakdown, index) => validateBreakdown(breakdown, `${path}.breakdowns[${index}]`));
};

export const parseAndValidateReportExtraction = (rawText, options = {}) => {
  const extraction = parseJsonResponse(rawText);
  assertObject(extraction, 'report');

  if (extraction.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  if (!extraction.currency || typeof extraction.currency !== 'string') throw new Error('currency is required');
  if (options.currency && extraction.currency !== options.currency) {
    throw new Error(`currency must be ${options.currency}`);
  }

  assertObject(extraction.period, 'period');
  validateSection(extraction.organic, 'organic', 'audiences');
  assertArray(extraction.organic.topContent, 'organic.topContent');

  if (extraction.ads !== null) {
    validateSection(extraction.ads, 'ads', 'topAds');
  }

  assertArray(extraction.executiveSummary, 'executiveSummary');
  assertArray(extraction.warnings, 'warnings');
  return extraction;
};

export const buildReportExtractionPrompt = ({
  clientName,
  currency = 'COP',
  organicSources = [],
  adsSources = [],
}) => {
  const sourceManifest = [
    ...organicSources.map((source) => ({ ...source, section: 'organic' })),
    ...adsSources.map((source) => ({ ...source, section: 'ads' })),
  ];

  return `Eres analista senior de marketing digital y extractor visual de datos.
Lee las capturas del cliente ${clientName} y devuelve ÚNICAMENTE JSON válido.

MONEDA OBLIGATORIA: ${currency}.
En cuentas colombianas, "$232.826" representa 232826 pesos, no USD ni 232.826 decimales.
Devuelve importes como números enteros y conserva "${currency}" en currency.

FUENTES EN EL MISMO ORDEN QUE LAS IMÁGENES:
${JSON.stringify(sourceManifest, null, 2)}

REGLAS DE VERACIDAD:
- Conserva diferencias entre visualizaciones, impresiones, alcance, espectadores, interacciones y resultados.
- Usa el sourceId correspondiente en cada métrica, serie, audiencia, contenido o anuncio.
- No inventes puntos para completar una gráfica. Extrae timeSeries solo cuando la captura muestre fechas y valores legibles.
- No conviertas un mes en Q1/Q2/Q3/Q4. Usa las etiquetas de fecha visibles, por ejemplo "1 jul".
- Si solo se ve un total, colócalo en summaryMetrics y no generes una serie artificial.
- Si un valor no es legible, omítelo y agrega una explicación en warnings; nunca uses cero como reemplazo.
- Si no hay imágenes de pauta, ads debe ser null.
- Las variaciones negativas se conservan como números negativos. La narrativa debe ser positiva, honesta y basada en evidencia.
- No generes HTML, SVG ni URLs.

CONTRATO JSON:
{
  "schemaVersion": 1,
  "currency": "${currency}",
  "period": { "label": "", "start": null, "end": null },
  "organic": {
    "summaryMetrics": [{ "key": "", "label": "", "value": 0, "unit": "COUNT|PERCENT|DURATION|CURRENCY", "changePct": null, "platform": "INSTAGRAM|FACEBOOK|COMBINED", "sourceId": "", "confidence": 0.0 }],
    "timeSeries": [{ "key": "", "label": "", "unit": "COUNT|PERCENT|CURRENCY", "platform": "", "sourceId": "", "points": [{ "label": "1 jul", "value": 0 }] }],
    "breakdowns": [{ "key": "", "label": "", "unit": "COUNT|PERCENT", "sourceId": "", "items": [{ "label": "", "value": 0 }] }],
    "audiences": [],
    "topContent": [],
    "insights": [{ "title": "", "paragraphs": ["", ""], "metricKeys": [""] }],
    "recommendations": [{ "title": "", "description": "", "metricKeys": [""] }]
  },
  "ads": null,
  "executiveSummary": [""],
  "warnings": [{ "sourceId": "", "message": "" }]
}

Cuando existan capturas de pauta, ads debe tener summaryMetrics, timeSeries, breakdowns,
topAds, insights y recommendations con la misma disciplina de sourceId y valores numéricos.`;
};

export const buildReportGenerationConfig = () => ({
  responseMimeType: 'application/json',
  maxOutputTokens: 16384,
  temperature: 0.1,
});

const sectionToLegacyBlocks = (section, imageUrls, type) => {
  if (!section) return [];
  const sourceIds = [...new Set([
    ...section.summaryMetrics.map((metric) => metric.sourceId),
    ...section.timeSeries.map((series) => series.sourceId),
  ].filter(Boolean))];

  return sourceIds.map((sourceId) => {
    const metrics = section.summaryMetrics.filter((metric) => metric.sourceId === sourceId);
    const insightParagraphs = section.insights
      .filter((insight) => !insight.sourceId || insight.sourceId === sourceId)
      .flatMap((insight) => insight.paragraphs || []);
    const metricSummary = metrics
      .map((metric) => `${metric.label}: ${metric.value}${metric.unit === 'PERCENT' ? '%' : ''}`)
      .join(' · ');

    return {
      tipo: type,
      texto_analisis: insightParagraphs.join('\n\n') || metricSummary || 'Datos extraídos para revisión.',
      imagen_url: imageUrls[sourceId],
      sourceId,
    };
  });
};

export const toLegacyReportAnalysis = (reportData, imageUrls = { organic: {}, ads: {} }) => {
  const recommendations = [
    ...(reportData.organic?.recommendations || []),
    ...(reportData.ads?.recommendations || []),
  ];

  return {
    organic_analysis: sectionToLegacyBlocks(reportData.organic, imageUrls.organic || {}, 'AVANCE'),
    performance_analysis: sectionToLegacyBlocks(reportData.ads, imageUrls.ads || {}, 'MACRO'),
    hoja_de_ruta: recommendations.slice(0, 3).map((recommendation, index) => ({
      step: index + 1,
      title: recommendation.title,
      description: recommendation.description,
    })),
  };
};
