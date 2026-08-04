const METRIC_KEYS = [
  'spend', 'impressions', 'reach', 'clicks', 'ctr', 'results',
  'views', 'viewers', 'interactions', 'linkClicks', 'profileVisits', 'follows',
  'videoViews', 'reachOrganic', 'reachPaid',
];

const hasValue = (metric) => metric && Number.isFinite(Number(metric.value));

const cleanMetrics = (metrics = {}) => Object.fromEntries(
  METRIC_KEYS
    .filter((key) => hasValue(metrics[key]))
    .map((key) => [key, { ...metrics[key], value: Number(metrics[key].value) }])
);

const metricSignature = (metrics = {}) => ['spend', 'impressions', 'reach', 'results']
  .map((key) => `${key}:${hasValue(metrics[key]) ? Number(metrics[key].value) : ''}`)
  .join('|');

const sourcePriority = (source) => {
  if (source.screenType === 'CONTENT_SUMMARY') return 3;
  if (source.entityLevel === 'AD_SET' || source.entityLevel === 'CAMPAIGN') return 2;
  return 1;
};

const buildOrganicSummary = (sources) => {
  const summary = {};
  for (const source of sources) {
    for (const key of ['follows', 'views', 'interactions', 'reach']) {
      const metric = source.metrics?.[key] || (key === 'reach' ? source.metrics?.reachOrganic : null);
      if (!hasValue(metric)) continue;
      if (!summary[key]) summary[key] = new Map();
      const platform = ['FACEBOOK', 'INSTAGRAM'].includes(source.platform) ? source.platform : 'ORGANIC';
      const current = summary[key].get(platform);
      if (!current || sourcePriority(source) > current._priority) {
        summary[key].set(platform, { ...metric, sourceId: source.sourceId, _priority: sourcePriority(source) });
      }
    }
  }
  return Object.fromEntries(Object.entries(summary).map(([key, metricsByPlatform]) => {
    const metrics = [...metricsByPlatform.values()];
    const { _priority, ...first } = metrics[0];
    return [key, { ...first, key, value: metrics.reduce((total, metric) => total + Number(metric.value), 0) }];
  }));
};

const buildAdsSummary = (sources) => {
  const uniqueSources = [];
  const signatures = new Set();
  [...sources].sort((a, b) => sourcePriority(b) - sourcePriority(a)).forEach((source) => {
    const signature = metricSignature(source.metrics);
    if (signatures.has(signature)) return;
    signatures.add(signature);
    uniqueSources.push(source);
  });

  const summary = {};
  for (const key of ['spend', 'impressions', 'clicks', 'results']) {
    const values = uniqueSources.map((source) => source.metrics?.[key]).filter(hasValue);
    if (values.length) summary[key] = { ...values[0], value: values.reduce((sum, item) => sum + Number(item.value), 0) };
  }
  const reachValues = uniqueSources.map((source) => source.metrics?.reach).filter(hasValue);
  if (reachValues.length) {
    const largest = reachValues.reduce((best, item) => Number(item.value) > Number(best.value) ? item : best);
    summary.reach = { ...largest, value: Number(largest.value) };
  }
  if (summary.clicks && summary.impressions?.value > 0) {
    summary.ctr = {
      key: 'ctr', label: 'CTR promedio', unit: '%',
      value: Number(((summary.clicks.value / summary.impressions.value) * 100).toFixed(4)),
    };
  }
  return summary;
};

export const buildScopedReportData = (sources = []) => {
  const normalized = sources.map((source) => ({ ...source, metrics: cleanMetrics(source.metrics) }));
  const organic = normalized.filter((source) => source.sectionCategory === 'ORGANIC');
  const ads = normalized.filter((source) => source.sectionCategory === 'ADS');
  return {
    sources: normalized,
    organic,
    ads,
    organicSummary: buildOrganicSummary(organic),
    adsSummary: buildAdsSummary(ads),
  };
};

export const normalizeAdsTableRows = (rows = []) => rows
  .filter((row) => row && !/^resultados?\s+de\s+\d+\s+anuncios?/i.test(String(row.title || '').trim()))
  .map((row) => ({ ...row, rowType: 'ENTITY' }));

export const orderReportSections = (sections = []) => [...sections].sort((left, right) => {
  const rank = (section) => section.sectionCategory === 'ORGANIC' ? 0 : section.sectionCategory === 'ADS' ? 1 : 2;
  return rank(left) - rank(right);
});
