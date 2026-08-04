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
    const platform = source.platform;
    if (!platform || platform === 'META_ADS' || platform === 'ORGANIC_RRSS') continue;
    if (!summary[platform]) summary[platform] = {};
    for (const [key, metric] of Object.entries(cleanMetrics(source.metrics))) {
      const current = summary[platform][key];
      if (!current || sourcePriority(source) > current._priority) {
        summary[platform][key] = { ...metric, _priority: sourcePriority(source), sourceId: source.sourceId };
      }
    }
  }
  return Object.fromEntries(Object.entries(summary).map(([platform, metrics]) => {
    return [platform, Object.fromEntries(Object.entries(metrics).map(([key, metric]) => {
      const { _priority, ...publicMetric } = metric;
      return [key, publicMetric];
    }))];
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
