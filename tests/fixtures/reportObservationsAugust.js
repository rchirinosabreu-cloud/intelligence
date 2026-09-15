// Composite fixture built from the readable SAMPLE August screenshots. The values
// are transcribed, while their arrangement in one payload exercises preservation.
// This is not the output of a live vision model.
const metric = (id, value, overrides = {}) => ({
  id, key: 'views', label: 'Visualizaciones', value, rawValue: String(value),
  platform: 'INSTAGRAM', scope: 'TOTAL', unit: 'count', precision: 'EXACT',
  contextKey: 'instagram_content', period: { start: null, end: null },
  confidence: 0.98, evidence: `Resumen Instagram: ${value}`, ...overrides
});

export const sampleAugustExtraction = {
  platform: 'INSTAGRAM', sectionCategory: 'ORGANIC', screenType: 'CONTENT_SUMMARY',
  confidence: 0.94, period: { start: null, end: null },
  metrics: [
    metric('combined', 9400, { rawValue: '9,4 mil', precision: 'ROUNDED', platform: 'CROSS_PLATFORM', contextKey: 'instagram_content_with_facebook_distribution' }),
    metric('facebook', 1017, { platform: 'FACEBOOK', contextKey: 'instagram_content_with_facebook_distribution', parentObservationId: 'combined' }),
    metric('instagram', 8418, { parentObservationId: 'combined' }),
    metric('organic', 8411, { scope: 'ORGANIC', parentObservationId: 'instagram' }),
    metric('paid', 7, { scope: 'PAID', parentObservationId: 'instagram' }),
    metric('facebook-summary', 1049, { platform: 'FACEBOOK', contextKey: 'facebook_content' }),
    metric('zero-clicks', 0, { key: 'linkClicks', label: 'Clics en el enlace de Instagram', changePct: -100 })
  ],
  panels: [
    { id: 'formats-count', title: 'Contenido publicado', chartType: 'BAR_CHART', metricKey: 'contentCount', platform: 'FACEBOOK', scope: 'UNKNOWN', unit: 'count', contextKey: 'facebook_content', dataset: [{ label: 'Reels', value: 5 }, { label: 'Historias', value: 5 }, { label: 'Fotos', value: 2 }] },
    { id: 'formats-views', title: 'Visualizaciones por formato', chartType: 'BAR_CHART', metricKey: 'views', platform: 'FACEBOOK', scope: 'TOTAL', unit: 'count', contextKey: 'facebook_content', dataset: [{ label: 'Reels', value: 933 }, { label: 'Foto', value: 109 }, { label: 'Varias fotos', value: 7 }] }
  ]
};
