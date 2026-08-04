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

export const filterCanonicalMetrics = (metrics = {}) => Object.fromEntries(
  CANONICAL_KEYS.filter(key => metrics[key] && typeof metrics[key] === 'object')
    .map(key => [key, metrics[key]])
);

export const getReviewMetricEntries = (metrics = {}) => ['spend', 'impressions', 'reach', 'clicks', 'ctr', 'results']
  .filter((key) => metrics[key]?.value !== null && metrics[key]?.value !== undefined && metrics[key]?.value !== '')
  .map((key) => [key, metrics[key]]);

export const getOrganicPlatformLabel = (platform) => platform === 'FACEBOOK'
  ? 'Facebook'
  : platform === 'INSTAGRAM' ? 'Instagram' : 'Orgánico';

export const isDemographicDataset = (dataset) => Array.isArray(dataset) && dataset.some(point =>
  point && (Number.isFinite(Number(point.hombres)) || Number.isFinite(Number(point.mujeres)))
);

export const filterTopContentRows = (rows = []) => rows.filter((row) => {
  if (!row || typeof row !== 'object' || !String(row.title || '').trim()) return false;
  const isFormatSummary = FORMAT_SUMMARY_LABELS.has(normalizeLabel(row.title));
  const hasPublicationEvidence = row.impressions !== null && row.impressions !== undefined
    || row.reach !== null && row.reach !== undefined;
  return !isFormatSummary || hasPublicationEvidence;
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
