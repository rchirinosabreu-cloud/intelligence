const CANONICAL_KEYS = [
  'spend', 'impressions', 'reach', 'clicks', 'ctr', 'results',
  'views', 'viewers', 'interactions', 'linkClicks', 'profileVisits', 'follows',
  'videoViews', 'reachOrganic', 'reachPaid'
];
const FORMAT_SUMMARY_LABELS = new Set([
  'reel', 'reels', 'enlace', 'enlaces', 'historia', 'historias', 'foto', 'fotos',
  'varias fotos', 'otros', 'otro', 'video', 'videos', 'carrusel', 'carruseles'
]);

const normalizeLabel = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export const hasPublishableValue = (value) => value !== null && value !== undefined && value !== ''
  && Number.isFinite(Number(value)) && Number(value) !== 0;

export const filterCanonicalMetrics = (metrics = {}) => Object.fromEntries(
  CANONICAL_KEYS.filter(key => metrics[key] && typeof metrics[key] === 'object' && hasPublishableValue(metrics[key].value))
    .map(key => [key, metrics[key]])
);

export const getReviewMetricEntries = (metrics = {}) => ['spend', 'impressions', 'reach', 'clicks', 'ctr', 'results']
  .filter((key) => hasPublishableValue(metrics[key]?.value))
  .map((key) => [key, metrics[key]]);

export const getOrganicPlatformLabel = (platform) => platform === 'FACEBOOK'
  ? 'Facebook'
  : platform === 'INSTAGRAM' ? 'Instagram' : 'Orgánico';

export const ORGANIC_SUMMARY_KEYS = ['follows', 'views', 'interactions', 'reach'];

export const adaptOrganicSummary = (summary = {}) => {
  const isMetric = (value) => value && typeof value === 'object'
    && value.value !== null && value.value !== undefined && Number.isFinite(Number(value.value));
  const groups = Object.values(summary).filter((value) => value && typeof value === 'object');
  const flat = ORGANIC_SUMMARY_KEYS.some((key) => isMetric(summary[key]));
  const explicitGroups = flat ? [summary] : ['FACEBOOK', 'INSTAGRAM'].map((key) => summary[key]).filter(Boolean);
  const fallbackGroups = flat ? [] : ['CROSS_PLATFORM', 'UNKNOWN', 'COMBINED'].map((key) => summary[key]).filter(Boolean);
  const aliases = { follows: ['follows'], views: ['views'], interactions: ['interactions'], reach: ['reach', 'reachOrganic'] };

  return Object.fromEntries(ORGANIC_SUMMARY_KEYS.flatMap((key) => {
    const read = (group) => aliases[key].map((alias) => group?.[alias]).find(isMetric);
    const explicit = explicitGroups.map(read).filter(Boolean);
    const candidates = explicit.length ? explicit : fallbackGroups.map(read).filter(Boolean);
    if (!candidates.length && !flat && groups.length === 1) {
      const metric = read(groups[0]);
      if (metric) candidates.push(metric);
    }
    if (!candidates.length) return [];
    return [[key, { ...candidates[0], key, value: candidates.reduce((total, metric) => total + Number(metric.value), 0) }]];
  }));
};

export const isDemographicDataset = (dataset) => Array.isArray(dataset) && dataset.some(point =>
  point && (Number.isFinite(Number(point.hombres)) || Number.isFinite(Number(point.mujeres)))
);

export const filterTopContentRows = (rows = []) => rows.filter((row) => {
  if (!row || typeof row !== 'object' || !String(row.title || '').trim()) return false;
  const isFormatSummary = FORMAT_SUMMARY_LABELS.has(normalizeLabel(row.title));
  const hasPublicationEvidence = hasPublishableValue(row.impressions) || hasPublishableValue(row.reach);
  const hasAnyPublishableResult = ['results', 'views', 'impressions', 'interactions', 'reach', 'clicks', 'spend']
    .some((key) => hasPublishableValue(row[key]));
  return hasAnyPublishableResult && (!isFormatSummary || hasPublicationEvidence);
});

export const splitAchievement = (value) => {
  const text = String(value || '').trim();
  const markdown = text.match(/^\*\*(.+?)(?::)?\*\*\s*:?[\s-]*(.*)$/);
  if (markdown) return { title: markdown[1].replace(/:$/, '').trim(), description: markdown[2].trim() };
  const separator = text.indexOf(':');
  if (separator > 0) return { title: text.slice(0, separator).trim(), description: text.slice(separator + 1).trim() };
  return { title: 'Logro destacado', description: text };
};

export const safeClassName = (className) => {
  if (typeof className === 'string') return className;
  return typeof className?.baseVal === 'string' ? className.baseVal : '';
};

export const readLiveControlValue = (liveControl, clonedControl) => String(
  liveControl?.value ?? clonedControl?.value ?? ''
);

export const collectDocumentStyles = (styleSheets = []) => Array.from(styleSheets)
  .map((sheet) => {
    try {
      return Array.from(sheet.cssRules || []).map((rule) => rule.cssText).join('\n');
    } catch {
      return '';
    }
  })
  .filter(Boolean)
  .join('\n');

export const buildReportFileName = (title) => {
  const safeTitle = String(title || 'reporte de desempeño digital')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase()
    .slice(0, 60) || 'reporte_de_desempeno_digital';
  return `${safeTitle}.html`;
};

export const buildNarrativeErrorLog = (error, rawContent, options = {}) => {
  const errMsg = error?.message || String(error || '');
  const rawLength = typeof rawContent === 'string' ? rawContent.length : 0;
  const snippet = rawLength > 150 ? rawContent.slice(0, 150) + '... [TRUNCATED]' : (rawContent || 'N/A');
  const attemptInfo = options.step ? ` [Step: ${options.step}]` : '';
  const reportInfo = options.reportId ? ` [Report ID: ${options.reportId}]` : '';
  const isFatal = options.isFatal ? 'FATAL ERROR' : 'RECOVERABLE ERROR';
  return `[${isFatal}] ${errMsg}${attemptInfo}${reportInfo} | Raw content length: ${rawLength} | Snippet: ${snippet}`;
};

export const processNarrativeResponse = (apiData) => {
  if (!apiData || !apiData.report) {
    return {
      shouldUpdateReport: false,
      shouldShowWarning: false,
      shouldShowSuccess: false,
      shouldThrowError: true,
      errorMsg: apiData?.error || apiData?.message || "Fallo al generar la narrativa"
    };
  }

  const isFailedNarrative = apiData.success === false && (apiData.needsRegeneration === true || apiData.report?.narrative?.generationMode === 'NARRATIVE_FAILED' || apiData.report?.narrative?.needsRegeneration === true);

  if (apiData.success) {
    return {
      shouldUpdateReport: true,
      shouldShowWarning: false,
      shouldShowSuccess: true,
      shouldThrowError: false,
      report: apiData.report
    };
  }

  if (isFailedNarrative) {
    return {
      shouldUpdateReport: true,
      shouldShowWarning: true,
      shouldShowSuccess: false,
      shouldThrowError: false,
      report: apiData.report,
      warningMsg: "Narrativa pendiente de regeneración"
    };
  }

  return {
    shouldUpdateReport: false,
    shouldShowWarning: false,
    shouldShowSuccess: false,
    shouldThrowError: true,
    errorMsg: apiData.error || apiData.message || "Fallo al generar la narrativa"
  };
};
