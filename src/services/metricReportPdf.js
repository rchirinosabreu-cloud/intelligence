import { renderReportPDF } from './pdfRenderer.js';
import { formatEvidenceValue, formatEvidenceChangePct } from '../lib/reportEvidenceFormat.js';

export { formatEvidenceValue, formatEvidenceChangePct } from '../lib/reportEvidenceFormat.js';

const list = (value) => Array.isArray(value) ? value : [];
const text = (value) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const escape = (value) => text(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const platformLabels = { INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', CROSS_PLATFORM: 'Facebook + Instagram', META_ADS: 'Pauta Meta', UNKNOWN: 'Plataforma sin confirmar' };
const platformKey = (value) => value === 'PAID_ADS' ? 'META_ADS' : (text(value) || 'UNKNOWN');
const platformName = (value) => platformLabels[platformKey(value)] || `Plataforma: ${text(value)}`;
const scopeName = (value) => ({ TOTAL: 'Total', ORGANIC: 'Orgánico', PAID: 'Pagado', UNKNOWN: 'Sin desglose' })[value] || text(value) || 'Sin desglose';
const metricLabels = { views: 'Visualizaciones', viewers: 'Espectadores', reach: 'Alcance', impressions: 'Impresiones', interactions: 'Interacciones con el contenido', linkClicks: 'Clics en el enlace', clicks: 'Clics', profileVisits: 'Visitas al perfil', follows: 'Seguidores del período', followers: 'Seguidores', spend: 'Importe gastado', results: 'Resultados', costPerResult: 'Costo por resultado', ctr: 'CTR', cpc: 'CPC', cpm: 'CPM', videoViews: 'Reproducciones de video', videoViews3s: 'Reproducciones de 3 segundos', watchTime: 'Tiempo de reproducción' };
const metricLabel = (key) => metricLabels[key] || text(key) || 'Valor observado';
const entityLabel = (value) => ({ ACCOUNT: 'Cuenta', CAMPAIGN: 'Campaña', AD_SET: 'Conjunto de anuncios', ADSET: 'Conjunto de anuncios', AD: 'Anuncio', CONTENT: 'Contenido', UNKNOWN: 'Nivel sin confirmar' })[value] || text(value);
const contextLabel = (fact) => {
  if (fact.contextLabel) return text(fact.contextLabel);
  const context = text(fact.contextKey);
  if (!context) return '';
  if (/^SOURCE_SPECIFIC:/.test(context)) return 'Contexto exclusivo de la captura';
  return ({ 'instagram-crossposting': 'Tarjeta combinada de Instagram', 'cross-platform-breakdown': 'Desglose de la tarjeta combinada', 'instagram-overview': 'Resumen de Instagram', 'facebook-overview': 'Resumen de Facebook', 'content-overview': 'Resumen de contenido', account: 'Resumen de la cuenta' })[context] || `Contexto: ${context}`;
};

const clientLogoHtml = report => {
  const src = report.normalizedMetrics?.branding?.logoDataUrl;
  if (typeof src !== 'string' || src.length > 1450000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src)) return '';
  return `<img class="client-logo" src="${src}" alt="Logo de ${escape(report.client?.name || 'cliente')}">`;
};

const dateLabel = (value) => {
  // Report/capture ranges are calendar dates; preserve their day without a UTC shift.
  const input = value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(input);
  if (!match) return 'Fecha sin confirmar';
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'Fecha sin confirmar';
  const monthName = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' }).format(date);
  return `${day} ${monthName} ${year}`;
};
const periodLabel = (period) => {
  const start = period?.start ?? period?.startDate;
  const end = period?.end ?? period?.endDate;
  return start && end ? `${dateLabel(start)} - ${dateLabel(end)}` : 'Período sin confirmar';
};

const narrativeFor = (report) => report?.evidenceNarrative ?? report?.narrative;
const narrativeCurrent = (report) => {
  const narrative = narrativeFor(report);
  const version = report?.normalizedMetrics?.dataVersion;
  return narrative && narrative.generationMode === 'EVIDENCE_AI' && !narrative.needsRegeneration && !narrative.stale && !['FAILED', 'STALE', 'ERROR'].includes(narrative.status)
    && Number.isInteger(version) && narrative.dataVersion === version;
};
const fail = (code, message) => { const error = new Error(message); error.code = code; error.status = 409; throw error; };

const validateDocument = (report, preview) => {
  const metrics = report?.normalizedMetrics;
  if (metrics?.schemaVersion !== 2 || !Array.isArray(metrics.facts)) fail('REPORT_EVIDENCE_REQUIRED', 'Este reporte requiere una ingesta con evidencia por cifra antes de exportar.');
  if (preview) return;
  if (report.status !== 'PUBLISHED') fail('REPORT_NOT_PUBLISHED', 'El reporte debe estar publicado para descargar el PDF final.');
  const excludedSources = new Set(list(metrics.excludedSources).filter((source) => text(source.reason).trim()).map((source) => source.sourceId));
  if (list(metrics.sourceFailures).some((source) => !excludedSources.has(source.sourceId))) fail('REPORT_FAILED_SOURCES', 'Hay fuentes pendientes de lectura o exclusión explícita.');
  if (list(metrics.issues).some((issue) => issue?.blocking) || metrics.facts.some((fact) => fact?.status === 'CONFLICT')) fail('REPORT_UNRESOLVED_EVIDENCE', 'El reporte tiene cifras o validaciones pendientes.');
  if (!metrics.facts.some((fact) => typeof fact?.value === 'number' && Number.isFinite(fact.value))) fail('REPORT_EMPTY_EVIDENCE', 'El reporte no contiene cifras con evidencia para publicar.');
  if (!narrativeFor(report) || !narrativeCurrent(report)) fail('REPORT_NARRATIVE_STALE', 'La narrativa no está vigente: debe generarse con la versión actual de los datos.');
};

const sourceCatalog = (report) => {
  const catalog = new Map();
  const extractionNames = new Map(list(report.normalizedMetrics?.sourceExtractions).map((source) => [source.sourceId, source.originalName]));
  for (const source of list(report.sources)) {
    const id = source?.sourceId || source?.id;
    if (id) catalog.set(id, { name: source.originalName || source.extractionData?.originalName || extractionNames.get(id) || source.fileName || source.name || id, source });
  }
  for (const source of [...list(report.normalizedMetrics?.sourceExtractions), ...list(report.normalizedMetrics?.sourceFailures), ...list(report.normalizedMetrics?.excludedSources)]) {
    const id = source?.sourceId || source?.id;
    if (id && !catalog.has(id)) catalog.set(id, { name: source.originalName || extractionNames.get(id) || source.fileName || source.name || id, source });
  }
  for (const fact of list(report.normalizedMetrics?.facts)) {
    for (const id of list(fact.sourceIds)) if (!catalog.has(id)) catalog.set(id, { name: id });
  }
  for (const panel of list(report.normalizedMetrics?.panels)) {
    for (const id of [...list(panel.sourceIds), panel.sourceId].filter(Boolean)) if (!catalog.has(id)) catalog.set(id, { name: id });
  }
  return new Map([...catalog].map(([id, item], index) => [id, { ...item, ref: index + 1 }]));
};
const sourceRefs = (ids, catalog) => list(ids).map((id) => catalog.has(id) ? `[${catalog.get(id).ref}]` : '').filter(Boolean).join(' ') || 'Sin fuente asociada';

const factRow = (fact, catalog) => {
  const ownPeriod = `${fact.periodProvenance === 'REPORT_DECLARED' ? 'Período seleccionado: ' : ''}${periodLabel(fact.period)}`;
  const entity = fact.entityLevel ? `${entityLabel(fact.entityLevel)}${fact.entityName ? `: ${fact.entityName}` : ''}` : fact.entityName;
  const details = [entity, contextLabel(fact), fact.resultType, ownPeriod].filter(Boolean);
  const comparison = (fact.comparisonPeriod?.start || fact.comparisonPeriod?.startDate) && (fact.comparisonPeriod?.end || fact.comparisonPeriod?.endDate) ? `<small>Comparado con ${escape(periodLabel(fact.comparisonPeriod))}</small>` : '';
  const precision = fact.precision === 'ROUNDED' ? '<small>Valor aproximado</small>' : fact.precision !== 'EXACT' ? '<small>Precisión sin confirmar</small>' : '';
  return `<tr data-fact-id="${escape(fact.factId)}"><th scope="row">${escape(fact.label || metricLabel(fact.key))}${details.map((detail) => `<small>${escape(detail)}</small>`).join('')}</th><td data-label="Distribución">${escape(scopeName(fact.scope))}</td><td data-label="Valor"><strong class="metric-value">${escape(formatEvidenceValue(fact))}</strong>${precision}</td><td class="change" data-label="Variación de la fuente">${escape(formatEvidenceChangePct(fact.changePct))}${comparison}</td><td class="source-ref" data-label="Fuente">${escape(sourceRefs(fact.sourceIds, catalog))}</td></tr>`;
};

const panelHtml = (panel, catalog) => {
  const rows = list(panel.dataset).filter((row) => row && typeof row === 'object');
  if (!rows.length) return '';
  // Retain every visible metric column. A missing value never falls back to
  // impressions/reach/results, and the renderer never derives or sums totals.
  const ignoredKeys = new Set(['label', 'name', 'id', 'sourceIds', 'sourceId', 'observationIds', 'evidence']);
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => !ignoredKeys.has(key))))];
  const columns = keys.length ? keys : ['value'];
  const header = (key) => key === 'value' ? (panel.metricLabel || metricLabel(panel.metricKey)) : metricLabel(key);
  const cellValue = (row, key) => {
    const value = row[key];
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return JSON.stringify(value);
    return formatEvidenceValue({ value, unit: columns.length === 1 || key === 'value' ? panel.unit : undefined, precision: row.precision });
  };
  const numericSeries = columns.length === 1 && rows.every(row => row[columns[0]] == null || (typeof row[columns[0]] === 'number' && Number.isFinite(row[columns[0]]) && row[columns[0]] >= 0));
  const maximum = numericSeries ? Math.max(0, ...rows.map(row => row[columns[0]] || 0)) : 0;
  const bar = (row, key) => numericSeries && typeof row[key] === 'number'
    ? `<span class="value-bar-track" aria-hidden="true"><span class="value-bar" style="width:${maximum ? Math.max(0, Math.min(100, row[key] / maximum * 100)) : 0}%"></span></span>` : '';
  return `<article class="panel${rows.length <= 12 ? ' panel-contained' : ''}" data-panel-id="${escape(panel.panelId)}"><h3>${escape(panel.title || metricLabel(panel.metricKey))}</h3><p class="caption">${escape(platformName(panel.platform))} · ${escape(scopeName(panel.scope))} · ${escape(periodLabel(panel.period))} · Fuente ${escape(sourceRefs([...list(panel.sourceIds), panel.sourceId].filter(Boolean), catalog))}</p><div class="table-wrap"><table class="panel-table"><thead><tr><th scope="col">Contenido / categoría</th>${columns.map((key) => `<th scope="col">${escape(header(key))}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr><th scope="row">${escape(row.label ?? row.name ?? 'Sin etiqueta')}</th>${columns.map((key) => `<td>${bar(row, key)}${escape(cellValue(row, key))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></article>`;
};

const issueGroupsHtml = (issues, catalog) => {
  const descriptions = {
    PERIOD_INHERITED: 'El período seleccionado para el informe se utiliza donde no hay fechas completas visibles en la captura.',
    SCOPE_UNDISCLOSED: 'La fuente no distingue distribución orgánica y pagada. Los indicadores se muestran sin desglose.',
    CONTEXT_SOURCE_SPECIFIC: 'Los indicadores conservan el contexto de su captura; no se concilian automáticamente con otra fuente.',
    PLATFORM_UNKNOWN: 'Hay indicadores cuya plataforma requiere confirmación.',
    PERIOD_UNKNOWN: 'Hay indicadores sin período completo confirmado.',
    CURRENCY_UNKNOWN: 'El símbolo monetario no identifica la moneda ISO; requiere confirmación.',
    ENTITY_UNKNOWN: 'La campaña, el conjunto o el anuncio requiere identificación.'
  };
  const grouped = new Map();
  for (const issue of issues) {
    const code = typeof issue === 'string' ? issue : text(issue.code) || text(issue.message || issue.description) || 'REVIEW_PENDING';
    if (!grouped.has(code)) grouped.set(code, { count: 0, blocking: false, sources: new Set(), messages: new Set() });
    const group = grouped.get(code);
    group.count += 1; group.blocking ||= Boolean(issue.blocking);
    for (const id of [...list(issue.sourceIds), issue.sourceId].filter(Boolean)) group.sources.add(id);
    group.messages.add(typeof issue === 'string' ? issue : issue.message || issue.description || issue.code || 'Revisión pendiente');
  }
  return grouped.size ? `<h3>Observaciones de las fuentes</h3><ul class="methodology">${[...grouped].map(([code, group]) => `<li data-issue-code="${escape(code)}">${escape(descriptions[code] || [...group.messages].join(' '))}${group.blocking ? ' <strong>(Pendiente de resolver)</strong>' : ''}<small>${group.count} ${group.count === 1 ? 'observación' : 'observaciones'}${group.sources.size ? ` · Fuentes ${escape(sourceRefs([...group.sources], catalog))}` : ''}</small></li>`).join('')}</ul>` : '';
};

const exclusionsHtml = (metrics, catalog) => {
  const sources = list(metrics.excludedSources);
  const sourceObservations = list(metrics.sourceExtractions).flatMap((source) => list(source.observations).map((observation) => ({ ...observation, sourceId: observation.sourceId || source.sourceId })));
  const sourcePanels = list(metrics.sourceExtractions).flatMap((source) => list(source.panels).map((panel) => ({ ...panel, sourceId: panel.sourceId || source.sourceId })));
  const uniqueBy = (items, key) => [...new Map(items.map((item) => [`${item.sourceId}:${item[key] || JSON.stringify(item)}`, item])).values()];
  const observations = uniqueBy([...sourceObservations, ...list(metrics.observations)].filter((observation) => observation.excluded), 'observationId');
  const panels = uniqueBy([...sourcePanels, ...list(metrics.panels)].filter((panel) => panel.excluded), 'panelId');
  if (!sources.length && !observations.length && !panels.length) return '';
  return `<h3>Exclusiones del alcance</h3><ul class="methodology">${sources.map((source) => `<li><strong>${escape(catalog.get(source.sourceId)?.name || source.originalName || source.sourceId)}</strong>: ${escape(source.reason || 'Motivo no registrado')}</li>`).join('')}${observations.map((observation) => `<li>${escape(observation.label || metricLabel(observation.key))} · Fuente ${escape(sourceRefs([observation.sourceId], catalog))}: ${escape(observation.review?.reason || 'Motivo no registrado')}</li>`).join('')}${panels.map((panel) => `<li>${escape(panel.title || metricLabel(panel.metricKey))} · Fuente ${escape(sourceRefs([panel.sourceId], catalog))}: ${escape(panel.review?.reason || 'Motivo no registrado')}</li>`).join('')}</ul>`;
};

const stylesheet = `
.client-logo { display:block; max-width:180px; max-height:72px; object-fit:contain; margin:16px 0; padding:8px; border-radius:8px; background:#fff; } .value-bar-track { display:inline-block; vertical-align:middle; width:72px; height:5px; margin-right:12px; border-radius:3px; background:var(--soft); } .value-bar { display:block; height:100%; border-radius:3px; background:var(--accent); }
@page { size: A4 portrait; margin: 16mm 16mm 19mm; @bottom-left { content: "Brainstudio · Informe de resultados"; font: 8pt Arial,sans-serif; color:#64748b; } @bottom-right { content: "Página " counter(page) " de " counter(pages); font:8pt Arial,sans-serif; color:#64748b; } }
:root { color-scheme:light dark; --paper:#fff; --ink:#172033; --muted:#536174; --line:#dce1e8; --soft:#f3f5f8; --accent:#6d28d9; }
* { box-sizing:border-box; } body { margin:0; background:var(--soft); color:var(--ink); font:13px/1.55 Arial,Helvetica,sans-serif; overflow-wrap:anywhere; }
.document { max-width:900px; margin:24px auto; padding:44px 48px; background:var(--paper); }
.brand { font-size:12px; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:var(--accent); } .cover { padding-bottom:22px; border-bottom:1px solid var(--line); margin-bottom:28px; }
h1 { font-size:34px; line-height:1.12; margin:14px 0 12px; letter-spacing:-.035em; } .client { font-size:19px; margin:0 0 6px; font-weight:600; } .meta,.caption,small { color:var(--muted); } .meta { margin:4px 0; font-size:12px; }
h2 { font-size:22px; line-height:1.25; margin:0 0 14px; font-weight:650; } h3 { font-size:15px; line-height:1.3; margin:20px 0 7px; } p { margin:8px 0 12px; } ul { padding-left:20px; } li { margin-bottom:8px; }
.section { margin-top:30px; } .platform { padding-top:14px; border-top:1px solid var(--line); } .eyebrow { color:var(--muted); text-transform:uppercase; letter-spacing:.09em; font-size:10px; margin-bottom:8px; }
.notice { padding:14px 16px; background:var(--soft); border:1px solid var(--line); margin-bottom:24px; } .notice strong { display:block; letter-spacing:.06em; margin-bottom:4px; } .notice p:last-child { margin-bottom:0; }
.table-wrap { width:100%; } table { border-collapse:collapse; table-layout:fixed; width:100%; font-size:11px; margin:14px 0 20px; } th,td { border-bottom:1px solid var(--line); padding:10px 7px; text-align:left; vertical-align:top; word-break:normal; overflow-wrap:anywhere; }
thead { display: table-header-group; } thead th { font-size:10px; font-weight:600; background:var(--soft); color:var(--muted); } tbody th { font-weight:500; } tbody tr { break-inside: avoid; page-break-inside:avoid; } .fact-table th:first-child { width:32%; } .fact-table th:nth-child(2) { width:13%; } .fact-table th:nth-child(3) { width:20%; } .fact-table th:nth-child(4) { width:25%; } .fact-table th:nth-child(5) { width:10%; }
small { display:block; font-size:9px; line-height:1.4; margin-top:5px; font-weight:400; } .metric-value { font-variant-numeric:tabular-nums; font-size:12px; font-weight:650; } .change { font-variant-numeric:tabular-nums; } .source-ref { font-size:10px; } .caption { font-size:10px; margin:3px 0 7px; }
.panel-table th:first-child { width:45%; } .panel { margin-top:24px; } .panel-contained { break-inside:avoid; } .source-list { list-style:none; padding:0; font-size:11px; } .source-list li { padding:7px 0; border-bottom:1px solid var(--line); } .source-number { display:inline-block; min-width:28px; font-weight:600; }
.action { padding:14px 0; border-bottom:1px solid var(--line); break-inside:avoid; } .action h3 { margin:0 0 6px; } .action p { margin:0; } .methodology { font-size:11px; } h1,h2,h3,.caption { break-after:avoid; } p { orphans:3; widows:3; }
@media (prefers-color-scheme: dark) { :root { --paper:#111827; --ink:#edf2f7; --muted:#bac5d3; --line:#354153; --soft:#1c2635; --accent:#c4b5fd; } }
@media screen and (max-width:600px) { .document { margin:0; padding:24px 14px; } h1 { font-size:27px; } h2 { font-size:20px; } .table-wrap { overflow-x:auto; } .panel-table { min-width:520px; } .fact-table { display:block; font-size:12px; } .fact-table thead { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); } .fact-table tbody { display:block; } .fact-table tr { display:grid; grid-template-columns:1fr 1fr; border-bottom:1px solid var(--line); padding:10px 0; } .fact-table tbody th:first-child { width:auto; grid-column:1/-1; font-size:14px; font-weight:600; } .fact-table td,.fact-table tbody th { border:0; padding:7px; } .fact-table small { font-size:11px; } .fact-table td::before { content:attr(data-label); display:block; font-size:10px; color:var(--muted); margin-bottom:4px; } .metric-value { font-size:15px; } }
@media print { :root { color-scheme:light; --paper:#fff; --ink:#172033; --muted:#536174; --line:#dce1e8; --soft:#f3f5f8; --accent:#6d28d9; } body { background:var(--paper); font-size:11px; } .document { max-width:none; margin:0; padding:0; } .platform { break-before:page; border-top:0; padding-top:0; } h1 { font-size:32px; } table { font-size:10px; } .metric-value { font-size:11px; } .section { margin-top:22px; } .sources { break-before:page; } }
`;

export const buildMetricReportHtml = (report, { preview = false } = {}) => {
  validateDocument(report, preview);
  const metrics = report.normalizedMetrics;
  const facts = list(metrics.facts);
  const panels = list(metrics.panels).filter((panel) => !panel.excluded);
  const catalog = sourceCatalog(report);
  const narrative = narrativeCurrent(report) ? narrativeFor(report) : null;
  const warnings = list(metrics.issues);
  const platforms = [...new Set([...facts.map((fact) => platformKey(fact.platform)), ...panels.map((panel) => platformKey(panel.platform)), ...list(narrative?.sections).map((section) => platformKey(section.platform))])];
  const order = ['INSTAGRAM', 'FACEBOOK', 'CROSS_PLATFORM', 'META_ADS', 'UNKNOWN'];
  platforms.sort((a, b) => (order.indexOf(a) < 0 ? order.length : order.indexOf(a)) - (order.indexOf(b) < 0 ? order.length : order.indexOf(b)) || a.localeCompare(b));
  const finalTitle = report.name || report.title || 'Informe de resultados';
  const summary = narrative ? `<h2>${escape(narrative.headline || 'Resumen ejecutivo')}</h2>${list(narrative.summaryPoints).length ? `<ul>${list(narrative.summaryPoints).map((point) => `<li>${escape(point)}</li>`).join('')}</ul>` : ''}` : '<h2>Resumen ejecutivo</h2><p>La narrativa está pendiente de generación o actualización con los datos vigentes.</p>';
  const issueHtml = warnings.length ? `<p class="caption">${warnings.length} ${warnings.length === 1 ? 'observación de los datos' : 'observaciones de los datos'} documentadas en Fuentes y metodología.</p>` : '';
  const platformHtml = platforms.map((platform) => {
    const ownFacts = facts.filter((fact) => platformKey(fact.platform) === platform);
    const ownPanels = panels.filter((panel) => platformKey(panel.platform) === platform);
    const ownNarrative = list(narrative?.sections).filter((section) => platformKey(section.platform) === platform);
    return `<section class="section platform" data-platform="${escape(platform)}"><div class="eyebrow">Resultados por plataforma</div><h2>${escape(platformName(platform))}</h2>${platform === 'CROSS_PLATFORM' ? '<p class="caption">Indicadores que la fuente presenta combinados. No se suman nuevamente a los totales de cada red.</p>' : platform === 'META_ADS' ? '<p class="caption">Conservar el nivel de campaña, conjunto o anuncio y los filtros de cada fuente. Los alcances no se suman como personas únicas.</p>' : ''}${ownFacts.length ? `<div class="table-wrap"><table class="fact-table"><thead><tr><th scope="col">Indicador y período</th><th scope="col">Distribución</th><th scope="col">Valor</th><th scope="col">Variación de la fuente</th><th scope="col">Fuente</th></tr></thead><tbody>${ownFacts.map((fact) => factRow(fact, catalog)).join('')}</tbody></table></div>` : ''}${ownPanels.map((panel) => panelHtml(panel, catalog)).join('')}${ownNarrative.map((section) => `<article><h3>${escape(section.title || 'Lectura del desempeño')}</h3>${list(section.paragraphs).map((paragraph) => `<p>${escape(paragraph)}</p>`).join('')}</article>`).join('')}</section>`;
  }).join('');
  const actions = list(narrative?.actionPlan);
  const actionHtml = actions.length ? `<section class="section"><h2>Acciones recomendadas</h2>${actions.map((action, index) => `<article class="action"><h3>${index + 1}. ${escape(typeof action === 'string' ? action : action.action)}</h3>${action.kpi ? `<p><strong>Cómo medir:</strong> ${escape(action.kpi)}</p>` : ''}${action.suggestedAssignee ? `<p><strong>Responsable propuesto:</strong> ${escape(action.suggestedAssignee)}</p>` : ''}</article>`).join('')}</section>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${escape(finalTitle)} · ${escape(report.client?.name || 'Cliente')}</title><style>${stylesheet}</style></head><body><main class="document">${preview ? '<aside class="notice"><strong>BORRADOR · VISTA PREVIA</strong><p>Documento para revisión. Las observaciones pendientes se muestran antes de la publicación.</p></aside>' : ''}<header class="cover"><div class="brand">Brainstudio</div>${clientLogoHtml(report)}<h1>${escape(finalTitle)}</h1><p class="client">${escape(report.client?.name || report.clientName || 'Cliente sin identificar')}</p><p class="meta">Período del informe: ${escape(periodLabel({ start: report.startDate, end: report.endDate }))}</p><p class="meta">Versión de datos: ${escape(metrics.dataVersion)}${report.updatedAt ? ` · Actualizado: ${escape(dateLabel(report.updatedAt instanceof Date ? report.updatedAt.toISOString() : report.updatedAt))}` : ''}</p></header><section class="section">${summary}</section>${issueHtml}${platformHtml}${actionHtml}<section class="section sources"><h2>Fuentes y metodología</h2><div class="methodology"><p>Las cifras se presentan según su plataforma, distribución, período y unidad. Un valor ausente se muestra como «No disponible» y un valor abreviado conserva la marca de aproximación (≈).</p><p>Las variaciones pertenecen a cada indicador y a la comparación de su fuente. Los desgloses, los totales y las capturas que corroboran una cifra no se suman entre sí.</p><p>Las visualizaciones, el alcance, las interacciones y los resultados publicitarios describen hechos diferentes. Un resultado de plataforma no demuestra por sí solo una venta.</p></div><ol class="source-list">${[...catalog.values()].map((source) => `<li><span class="source-number">[${source.ref}]</span>${escape(source.name)}</li>`).join('')}</ol>${issueGroupsHtml(warnings, catalog)}${exclusionsHtml(metrics, catalog)}</section></main></body></html>`;
};

export const renderMetricReportPdf = async (report, { preview = false, renderPdf = renderReportPDF } = {}) => {
  const rendered = await renderPdf(buildMetricReportHtml(report, { preview }));
  const body = Buffer.isBuffer(rendered) ? rendered : rendered instanceof Uint8Array ? Buffer.from(rendered) : null;
  if (!body || body.subarray(0, 5).toString('ascii') !== '%PDF-') fail('REPORT_PDF_INVALID', 'No fue posible generar un archivo PDF válido.');
  return body;
};
