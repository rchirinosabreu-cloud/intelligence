import { renderReportPDF } from './pdfRenderer.js';
import { readFileSync } from 'node:fs';
import { formatEvidenceValue, formatEvidenceChangePct } from '../lib/reportEvidenceFormat.js';
import { buildReportPresentation } from '../lib/reportPresentationModel.js';

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

// Trusted, bundled branding: the exported document never fetches a remote logo.
const agencyLogo = `data:image/png;base64,${readFileSync(new URL('../../public/assets/brainstudio-logo-white.png', import.meta.url)).toString('base64')}`;
const agencySignoffHtml = `<footer class="agency-signoff"><img src="${agencyLogo}" alt="BrainStudio · Agencia Creativa"><p>Estrategia, creatividad y seguimiento para tu marca.</p></footer>`;

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

// The cover is a short view of existing account rows, never a new aggregation.
// If more than one context supplies a metric, leave it in the detailed sections.
const coverOverviewHtml = (presentation, report) => {
  const period = periodLabel({ start: report.startDate, end: report.endDate });
  if (period.includes('sin confirmar')) return '';
  const contexts = new Set(['account_content', 'account_audience', 'ACCOUNT_TOTAL', 'account', 'instagram-overview', 'facebook-overview']);
  const groups = ['INSTAGRAM', 'FACEBOOK'].map(platform => {
    const rows = presentation.sections.filter(section => section.platform === platform && section.kind === 'metrics')
      .flatMap(section => section.rows).filter(row => row.scope === 'TOTAL' && row.facts.length
        && row.facts.every(fact => ['ACCOUNT', 'UNKNOWN'].includes(fact.entityLevel || 'UNKNOWN')
          && contexts.has(fact.contextKey) && periodLabel(fact.period) === period && /^count$/i.test(fact.unit)
          && Number.isFinite(fact.value) && fact.status !== 'CONFLICT'));
    const cards = [['views'], ['interactions'], ['follows', 'followers']].flatMap(keys => {
      const candidates = rows.filter(row => keys.includes(row.metricKey));
      if (candidates.length !== 1 || candidates[0].facts.length !== 1) return [];
      const row = candidates[0];
      return [`<article class="cover-metric"><span>${escape(row.label)}</span><strong>${escape(row.valueText)}</strong></article>`];
    });
    return cards.length ? `<section class="cover-network" data-cover-platform="${platform}"><h3>${platformName(platform)}</h3><div class="cover-metrics">${cards.join('')}</div></section>` : '';
  }).join('');
  return groups ? `<section class="cover-overview" aria-label="Resultados del período por red"><h2>Tus redes, de un vistazo</h2>${groups}</section>` : '';
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

const factRow = (fact, catalog, display = {}, section = {}) => {
  const ownPeriod = `${fact.periodProvenance === 'REPORT_DECLARED' ? 'Período seleccionado: ' : ''}${periodLabel(fact.period)}`;
  const entity = fact.entityName ? `${entityLabel(fact.entityLevel)}: ${fact.entityName}` : '';
  const ownContext = fact.contextKey !== section.contextKey ? contextLabel(fact) : '';
  const details = [entity, ownContext, fact.key === 'results' ? display.resultType || fact.resultType : '', periodLabel(fact.period) !== periodLabel(section.period) ? ownPeriod : ''].filter(Boolean);
  const comparison = (fact.comparisonPeriod?.start || fact.comparisonPeriod?.startDate) && (fact.comparisonPeriod?.end || fact.comparisonPeriod?.endDate) ? `<small>Comparado con ${escape(periodLabel(fact.comparisonPeriod))}</small>` : '';
  const precision = fact.precision === 'ROUNDED' ? '<small>Valor aproximado</small>' : fact.precision !== 'EXACT' ? '<small>Precisión sin confirmar</small>' : '';
  return `<tr data-fact-id="${escape(fact.factId)}"><th scope="row">${escape(display.label || fact.label || metricLabel(fact.key))}${details.map((detail) => `<small>${escape(detail)}</small>`).join('')}</th><td data-label="Distribución">${escape(scopeName(fact.scope))}</td><td data-label="Valor"><strong class="metric-value">${escape(display.valueText ?? formatEvidenceValue(fact))}</strong>${precision}</td><td class="change" data-label="Variación">${escape(display.changeText ?? formatEvidenceChangePct(fact.changePct))}${comparison}</td>${catalog ? `<td class="source-ref" data-label="Fuente">${escape(sourceRefs(display.sourceIds || fact.sourceIds, catalog))}</td>` : ''}</tr>`;
};

const editorialCommentHtml = (comment, catalog) => comment ? `<aside class="editorial-comment" data-editorial-comment="${escape(comment.sectionId || comment.title)}"><h4>${escape(comment.title)}</h4><p><strong>Lectura del resultado.</strong> ${escape(comment.observation)}</p><p><strong>Qué significa.</strong> ${escape(comment.interpretation)}</p><p><strong>Próximo paso.</strong> ${escape(comment.action)}</p>${catalog ? `<small>Fuentes ${escape(sourceRefs(comment.sourceIds, catalog))}</small>` : ''}</aside>` : '';

const editorialDataHtml = (section, catalog) => {
  if (section.kind === 'metrics') return `<div class="kpi-grid">${section.rows.map(row => `<article class="kpi" data-kpi-card="${escape(row.id)}"><span>${escape(row.label)}</span><strong>${escape(row.valueText)}</strong><p>${escape(scopeName(row.scope))} · ${escape(row.changeText)}</p>${catalog ? `<small>Fuente ${escape(sourceRefs(row.sourceIds, catalog))}</small>` : ''}</article>`).join('')}</div>`;
  const isAdvertising = ['AD', 'AD_SET', 'ADSET', 'CAMPAIGN'].includes(section.entityLevel) || section.platform === 'META_ADS';
  if (isAdvertising) return '';
  return section.columns.filter(column => section.rows.some(row => typeof row.cells[column.key]?.value === 'number')).map(column => {
    const maximum = Math.max(0, ...section.rows.map(row => row.cells[column.key]?.value || 0));
    return `<figure class="editorial-chart" data-chart-metric="${escape(column.key)}"><figcaption>${escape(column.label)}</figcaption>${section.rows.map(row => {
      const cell = row.cells[column.key];
      return `<div class="chart-row"><span class="chart-label">${escape(row.label)}</span><span class="chart-track" aria-hidden="true"><span style="width:${Math.max(0, maximum && cell?.value != null ? cell.value / maximum * 100 : 0)}%"></span></span><strong>${escape(cell?.text || 'No disponible')}</strong></div>`;
    }).join('')}</figure>`;
  }).join('');
};

const presentationSectionHtml = (section, catalog, editorial) => {
  const selectedPeriod = section.rows.some(row => row.facts?.some(fact => fact.periodProvenance === 'REPORT_DECLARED'));
  const caption = [platformName(section.platform), catalog ? section.contextLabel : '', section.scope && (catalog || section.scope !== 'UNKNOWN') ? scopeName(section.scope) : '', `${catalog && selectedPeriod ? 'Período seleccionado: ' : ''}${periodLabel(section.period)}`, catalog ? `Fuentes ${sourceRefs(section.sourceIds, catalog)}` : ''].filter(Boolean).join(' · ');
  const content = section.kind === 'metrics' ? `<table class="fact-table"><thead><tr><th scope="col">Indicador</th><th scope="col">Distribución</th><th scope="col">Valor</th><th scope="col">Variación</th>${catalog ? '<th scope="col">Fuente</th>' : ''}</tr></thead><tbody>${section.rows.map(row => factRow(row.facts[0], catalog, row, section)).join('')}</tbody></table>` : (() => {
    const columns = section.columns || [];
    const series = columns.length === 1 && section.rows.every(row => row.cells[columns[0].key]?.value == null || row.cells[columns[0].key].value >= 0);
    const maximum = series ? Math.max(0, ...section.rows.map(row => row.cells[columns[0].key]?.value || 0)) : 0;
    const bar = cell => series && typeof cell?.value === 'number' ? `<span class="value-bar-track" aria-hidden="true"><span class="value-bar" style="width:${maximum ? cell.value / maximum * 100 : 0}%"></span></span>` : '';
    return `<table class="panel-table${columns.length > 3 ? ' wide-table' : ''}"><thead><tr><th scope="col">${['AD', 'CAMPAIGN', 'AD_SET', 'ADSET'].includes(section.entityLevel) ? 'Anuncio / campaña' : 'Contenido / categoría'}</th>${columns.map(column => `<th scope="col">${escape(column.label)}</th>`).join('')}</tr></thead><tbody>${section.rows.map(row => `<tr data-row-id="${escape(row.id)}"><th scope="row">${escape(row.label)}${row.resultType ? `<small>${escape(row.resultType)}</small>` : ''}${catalog ? `<small>Fuente ${escape(sourceRefs(row.sourceIds, catalog))}</small>` : ''}</th>${columns.map(column => `<td>${bar(row.cells[column.key])}${escape(row.cells[column.key]?.text || 'No disponible')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  })();
  const editorialData = editorial ? editorialDataHtml(section, catalog) : '';
  const comment = editorial?.sectionComments.find(item => item.sectionId === section.id);
  return `<article class="panel${section.kind === 'table' && section.rows.length <= 12 ? ' panel-contained' : ''}" data-report-section="${escape(section.id)}"${section.panelId ? ` data-panel-id="${escape(section.panelId)}"` : ''}><h3>${escape(section.title)}</h3><p class="caption">${escape(caption)}</p>${editorialData || `<div class="table-wrap">${content}</div>`}${editorialCommentHtml(comment, catalog)}</article>`;
};

const issueGroupsHtml = (issues, catalog) => {
  const descriptions = {
    PERIOD_INHERITED: 'El período seleccionado para el informe se utiliza donde no hay fechas completas visibles en la captura.',
    SCOPE_UNDISCLOSED: 'La fuente no distingue distribución orgánica y pagada. Los indicadores se muestran sin desglose.',
    CONTEXT_SOURCE_SPECIFIC: 'Los indicadores conservan el contexto de su captura; no se concilian automáticamente con otra fuente.',
    PLATFORM_UNKNOWN: 'Hay indicadores cuya plataforma requiere confirmación.',
    PERIOD_UNKNOWN: 'Hay indicadores sin período completo confirmado.',
    CURRENCY_UNKNOWN: 'Moneda no especificada: se conserva el símbolo visible; no se presume una moneda ISO.',
    ENTITY_UNKNOWN: 'La campaña, el conjunto o el anuncio requiere identificación.'
  };
  const grouped = new Map();
  for (const issue of issues) {
    const code = typeof issue === 'string' ? issue : text(issue.code) || text(issue.message || issue.description) || 'REVIEW_PENDING';
    if (!grouped.has(code)) grouped.set(code, { count: 0, blocking: false, sources: new Set(), messages: new Set() });
    const group = grouped.get(code);
    group.count += issue.count || 1; group.blocking ||= Boolean(issue.blocking);
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
:root { --navy:#1f3c58; --steel:#4d6e8c; --slate-blue:#8fa8bf; --pale-blue:#cee1f2; --sky-blue:#a6d4ff; --heading:var(--navy); --chart-color:var(--steel); --card-one:color-mix(in srgb,var(--pale-blue) 35%,var(--paper)); --card-two:color-mix(in srgb,var(--sky-blue) 24%,var(--paper)); --card-three:color-mix(in srgb,var(--slate-blue) 14%,var(--paper)); --comment-fill:color-mix(in srgb,var(--pale-blue) 22%,var(--paper)); --table-fill:color-mix(in srgb,var(--pale-blue) 50%,var(--paper)); }
h1,h2,h3,h4,.editorial-chart figcaption,.cover-metric strong { color:var(--heading); }
.cover-metric,.kpi { background:var(--card-one); } .cover-metric:nth-child(3n+2),.kpi:nth-child(3n+2) { background:var(--card-two); } .cover-metric:nth-child(3n),.kpi:nth-child(3n) { background:var(--card-three); }

.agency-signoff { text-align:center; padding-top:24px; margin-top:32px; border-top:1px solid var(--line); break-inside:avoid; } .agency-signoff img { display:block; width:230px; max-width:80%; height:auto; margin:0 auto; filter:brightness(0); } .agency-signoff p { color:var(--muted); font-size:11px; margin:12px 0 0; }
.editorial-closing { break-after:avoid; }
.editorial-chart,.chart-row { break-inside:avoid; } .priority+h3 { margin-top:4px; }
.kpi-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin:18px 0; } .kpi { border:1px solid var(--line); border-radius:12px; padding:16px; break-inside:avoid; } .kpi>span { display:block; font-size:11px; color:var(--muted); } .kpi>strong { display:block; font-size:25px; line-height:1.25; letter-spacing:-.03em; margin:7px 0; } .kpi p { font-size:10px; margin:0; color:var(--muted); }
.editorial-comment { background:var(--comment-fill); border-radius:10px; padding:16px 18px; margin:16px 0 24px; break-inside:avoid; } h4 { font-size:13px; margin:0 0 8px; } .editorial-comment p { margin:7px 0; } .editorial-chart { margin:20px 0; padding:18px; border:1px solid var(--line); border-radius:12px; } .editorial-chart figcaption { font-weight:600; margin-bottom:16px; } .chart-row { display:grid; grid-template-columns:120px minmax(0,1fr) 84px; align-items:center; gap:12px; margin:12px 0; break-inside:avoid; } .chart-label { font-size:11px; } .chart-row>strong { font-size:11px; text-align:right; font-variant-numeric:tabular-nums; } .chart-track { height:14px; border-radius:0 6px 6px 0; background:var(--soft); } .chart-track>span { display:block; height:100%; border-radius:0 6px 6px 0; background:var(--chart-color); } .editorial-recommendation { border-top:1px solid var(--line); padding:18px 0; break-inside:avoid; } .priority { display:inline-block; color:var(--heading); font-size:10px; font-weight:600; margin-bottom:7px; } .editorial-closing { padding:20px; border-radius:12px; background:var(--card-two); margin:24px 0; break-inside:avoid; }
.client-logo { display:block; max-width:180px; max-height:72px; object-fit:contain; margin:16px 0; padding:8px; border-radius:8px; background:#fff; } .value-bar-track { display:inline-block; vertical-align:middle; width:72px; height:5px; margin-right:12px; border-radius:3px; background:var(--soft); } .value-bar { display:block; height:100%; border-radius:3px; background:var(--chart-color); }
@page { size: A4 portrait; margin: 16mm 16mm 19mm; @bottom-left { content: "Brainstudio · Informe de resultados"; font: 8pt Arial,sans-serif; color:#64748b; } @bottom-right { content: "Página " counter(page) " de " counter(pages); font:8pt Arial,sans-serif; color:#64748b; } }
:root { color-scheme:light dark; --paper:#fff; --ink:#172033; --muted:#536174; --line:#d6e3ee; --soft:#f3f7fb; --accent:#6d28d9; }
* { box-sizing:border-box; } body { margin:0; background:var(--soft); color:var(--ink); font:13px/1.55 Arial,Helvetica,sans-serif; overflow-wrap:anywhere; }
.document { max-width:900px; margin:24px auto; padding:44px 48px; background:var(--paper); }
.brand { font-size:12px; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:var(--heading); }
.cover { margin-bottom:26px; } .cover-top { display:flex; justify-content:space-between; align-items:center; gap:20px; margin-bottom:28px; } .cover .client-logo { margin:0; max-width:150px; max-height:60px; }
.cover h1 { max-width:680px; font-size:48px; line-height:1.04; font-weight:800; letter-spacing:-.04em; margin:0; } .cover-title,.cover .client { display:inline; } .cover .client { color:var(--accent); }
.cover-subtitle { font-size:18px; color:var(--muted); margin:20px 0 28px; } .cover-meta { display:grid; grid-template-columns:1fr 1fr; gap:22px; padding:18px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
.cover-meta p { margin:0; font-size:12px; } .cover-meta span { display:block; color:var(--muted); font-size:11px; margin-bottom:4px; } .cover-meta strong { font-weight:600; } .cover-period { text-align:right; }
.cover-overview { margin:26px 0; } .cover-overview h2 { font-size:18px; margin:0 0 18px; } .cover-network { break-inside:avoid; margin-top:16px; } .cover-network h3 { display:flex; align-items:center; gap:12px; font-size:12px; margin:0 0 9px; } .cover-network h3::after { content:''; height:1px; flex:1; background:var(--line); }
.cover-metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; } .cover-metric { min-width:0; padding:14px 16px; border:1px solid var(--line); border-radius:10px; } .cover-metric span { display:block; color:var(--muted); font-size:11px; } .cover-metric strong { display:block; font-size:25px; line-height:1.15; letter-spacing:-.025em; margin-top:8px; font-variant-numeric:tabular-nums; }
.cover-summary { break-inside:avoid; } .cover-summary h2 { font-size:18px; } .cover-summary h3 { font-size:14px; margin-top:12px; }
h1 { font-size:34px; line-height:1.12; margin:14px 0 12px; letter-spacing:-.035em; } .meta,.caption,small { color:var(--muted); } .meta { margin:4px 0; font-size:12px; }
h2 { font-size:22px; line-height:1.25; margin:0 0 14px; font-weight:650; } h3 { font-size:15px; line-height:1.3; margin:20px 0 7px; } p { margin:8px 0 12px; } ul { padding-left:20px; } li { margin-bottom:8px; }
.section { margin-top:30px; } .platform { padding-top:14px; border-top:1px solid var(--line); } .eyebrow { color:var(--muted); text-transform:uppercase; letter-spacing:.09em; font-size:10px; margin-bottom:8px; }
.notice { padding:14px 16px; background:var(--soft); border:1px solid var(--line); margin-bottom:24px; } .notice strong { display:block; letter-spacing:.06em; margin-bottom:4px; } .notice p:last-child { margin-bottom:0; }
.table-wrap { width:100%; } table { border-collapse:collapse; table-layout:fixed; width:100%; font-size:11px; margin:14px 0 20px; } th,td { border-bottom:1px solid var(--line); padding:10px 7px; text-align:left; vertical-align:top; word-break:normal; overflow-wrap:anywhere; }
thead { display: table-header-group; } thead th { font-size:10px; font-weight:600; background:var(--table-fill); color:var(--heading); } tbody th { font-weight:500; } tbody tr { break-inside: avoid; page-break-inside:avoid; } .fact-table th:first-child { width:32%; } .fact-table th:nth-child(2) { width:13%; } .fact-table th:nth-child(3) { width:20%; } .fact-table th:nth-child(4) { width:25%; } .fact-table th:nth-child(5) { width:10%; }
small { display:block; font-size:9px; line-height:1.4; margin-top:5px; font-weight:400; } .metric-value { font-variant-numeric:tabular-nums; font-size:12px; font-weight:650; } .change { font-variant-numeric:tabular-nums; } .source-ref { font-size:10px; } .caption { font-size:10px; margin:3px 0 7px; }
.panel-table th:first-child { width:45%; } .panel-table.wide-table th:first-child { width:28%; } .panel-table thead th { overflow-wrap:normal; } .panel { margin-top:24px; } .panel-contained { break-inside:avoid; } .source-list { list-style:none; padding:0; font-size:11px; } .source-list li { padding:7px 0; border-bottom:1px solid var(--line); } .source-number { display:inline-block; min-width:28px; font-weight:600; }
.action { padding:14px 0; border-bottom:1px solid var(--line); break-inside:avoid; } .action h3 { margin:0 0 6px; } .action p { margin:0; } .methodology { font-size:11px; } h1,h2,h3,.caption { break-after:avoid; } p { orphans:3; widows:3; }
@media (prefers-color-scheme: dark) { :root { --paper:#111827; --ink:#edf2f7; --muted:#bac5d3; --line:#354153; --soft:#1c2635; --accent:#c4b5fd; --heading:var(--pale-blue); --chart-color:var(--sky-blue); --card-one:color-mix(in srgb,var(--pale-blue) 14%,var(--paper)); --card-two:color-mix(in srgb,var(--sky-blue) 14%,var(--paper)); --card-three:color-mix(in srgb,var(--slate-blue) 16%,var(--paper)); --comment-fill:color-mix(in srgb,var(--pale-blue) 10%,var(--paper)); --table-fill:color-mix(in srgb,var(--pale-blue) 18%,var(--paper)); } .agency-signoff img { filter:none; } }
@media screen and (max-width:600px) { .document { margin:0; padding:24px 14px; } h1 { font-size:27px; } h2 { font-size:20px; } .table-wrap { overflow-x:auto; } .panel-table { min-width:520px; } .fact-table { display:block; font-size:12px; } .fact-table thead { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); } .fact-table tbody { display:block; } .fact-table tr { display:grid; grid-template-columns:1fr 1fr; border-bottom:1px solid var(--line); padding:10px 0; } .fact-table tbody th:first-child { width:auto; grid-column:1/-1; font-size:14px; font-weight:600; } .fact-table td,.fact-table tbody th { border:0; padding:7px; } .fact-table small { font-size:11px; } .fact-table td::before { content:attr(data-label); display:block; font-size:10px; color:var(--muted); margin-bottom:4px; } .metric-value { font-size:15px; } }
@media screen and (max-width:600px) { .kpi-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .kpi { padding:12px; } .kpi>strong { font-size:21px; } .chart-row { grid-template-columns:90px minmax(0,1fr) 65px; gap:8px; } .editorial-chart { padding:12px; } }
@media screen and (max-width:600px) { .cover h1 { font-size:36px; } .cover-top { gap:12px; } .cover .client-logo { max-width:110px; } .cover-subtitle { font-size:16px; } .cover-meta { grid-template-columns:1fr; gap:12px; } .cover-period { text-align:left; } .cover-metrics { grid-template-columns:1fr; gap:8px; } .cover-metric { display:flex; align-items:center; justify-content:space-between; gap:12px; } .cover-metric strong { margin:0; } }
@media print { .agency-signoff img { filter:brightness(0); } :root { color-scheme:light; --card-one:color-mix(in srgb,var(--pale-blue) 35%,var(--paper)); --card-two:color-mix(in srgb,var(--sky-blue) 24%,var(--paper)); --card-three:color-mix(in srgb,var(--slate-blue) 14%,var(--paper)); --comment-fill:color-mix(in srgb,var(--pale-blue) 22%,var(--paper)); --table-fill:color-mix(in srgb,var(--pale-blue) 50%,var(--paper)); --heading:var(--navy); --chart-color:var(--steel); --paper:#fff; --ink:#172033; --muted:#536174; --line:#d6e3ee; --soft:#f3f7fb; --accent:#6d28d9; } body { background:var(--paper); font-size:11px; } .document { max-width:none; margin:0; padding:0; } .platform { break-before:page; border-top:0; padding-top:0; } .platform[data-platform="CROSS_PLATFORM"] { break-before:auto; break-inside:avoid; } h1 { font-size:32px; } table { font-size:10px; } .metric-value { font-size:11px; } .section { margin-top:22px; } .sources { break-before:page; } }
`;

export const buildMetricReportHtml = (report, { preview = false, includeSources = false } = {}) => {
  validateDocument(report, preview);
  const metrics = report.normalizedMetrics;
  const presentation = buildReportPresentation(report);
  const catalog = includeSources ? sourceCatalog(report) : null;
  const narrative = narrativeCurrent(report) ? narrativeFor(report) : null;
  const editorial = narrative?.editorial?.version === 1 ? narrative.editorial : null;
  const warnings = presentation.contextNotes;
  const platforms = [...new Set([...presentation.sections.map(section => platformKey(section.platform)), ...list(narrative?.sections).map((section) => platformKey(section.platform))])];
  const order = ['INSTAGRAM', 'FACEBOOK', 'CROSS_PLATFORM', 'META_ADS', 'UNKNOWN'];
  platforms.sort((a, b) => (order.indexOf(a) < 0 ? order.length : order.indexOf(a)) - (order.indexOf(b) < 0 ? order.length : order.indexOf(b)) || a.localeCompare(b));
  const finalTitle = report.name || report.title || (editorial ? 'Reporte de desempeño digital' : 'Informe de resultados');
  const summary = editorial ? `<h2>Resumen ejecutivo</h2><h3>${escape(editorial.summary.title)}</h3><p>${escape(editorial.summary.text)}</p>` : narrative ? `<h2>${escape(narrative.headline || 'Resumen ejecutivo')}</h2>${list(narrative.summaryPoints).length ? `<ul>${list(narrative.summaryPoints).map((point) => `<li>${escape(point)}</li>`).join('')}</ul>` : ''}` : '<h2>Resumen ejecutivo</h2><p>La narrativa está pendiente de generación o actualización con los datos vigentes.</p>';
  const blockingNotes = warnings.filter(item => item.blocking);
  const issueHtml = preview && blockingNotes.length ? `<aside class="notice"><strong>Revisión pendiente</strong>${blockingNotes.map(item => `<p>${escape(item.message)}</p>`).join('')}</aside>` : '';
  const platformHtml = platforms.map((platform) => {
    const ownSections = presentation.sections.filter(section => platformKey(section.platform) === platform);
    const ownNarrative = list(narrative?.sections).filter((section) => platformKey(section.platform) === platform);
    return `<section class="section platform" data-platform="${escape(platform)}"><div class="eyebrow">${platform === 'META_ADS' ? 'Desempeño de pauta digital' : 'Desempeño en redes sociales'}</div><h2>${escape(platformName(platform))}</h2>${platform === 'CROSS_PLATFORM' ? '<p class="caption">Visualizaciones del contenido de Instagram y su distribución en Facebook.</p>' : platform === 'META_ADS' ? '<p class="caption">Resultados de la inversión publicitaria, por campaña y por anuncio.</p>' : ''}${ownSections.map(section => presentationSectionHtml(section, catalog, editorial)).join('')}${editorial ? '' : ownNarrative.map((section) => `<article><h3>${escape(section.title || 'Lectura del desempeño')}</h3>${list(section.paragraphs).map((paragraph) => `<p>${escape(paragraph)}</p>`).join('')}</article>`).join('')}</section>`;
  }).join('');
  const actions = list(narrative?.actionPlan);
  const actionHtml = editorial ? `<section class="section"><h2>Oportunidades y aprendizajes</h2>${editorial.opportunities.map(item => editorialCommentHtml(item, catalog)).join('')}</section><section class="section"><h2>Recomendaciones estratégicas</h2>${editorial.recommendations.map(item => `<article class="editorial-recommendation"><span class="priority">Prioridad ${escape(item.priority.toLowerCase())}</span><h3>${escape(item.title)}</h3><p><strong>Justificación.</strong> ${escape(item.rationale)}</p><p><strong>Acción propuesta.</strong> ${escape(item.action)}</p><p><strong>Indicador de seguimiento.</strong> ${escape(item.kpi)}</p></article>`).join('')}</section><section class="section"><h2>Plan de acción</h2><p class="caption">Propuestas para el siguiente período, sujetas a coordinación con el cliente.</p><div class="table-wrap"><table class="panel-table"><thead><tr><th>Acción recomendada</th><th>Prioridad</th><th>Cómo comprobar el avance</th></tr></thead><tbody>${editorial.recommendations.map(item => `<tr><th>${escape(item.action)}</th><td>${escape(item.priority)}</td><td>${escape(item.kpi)}</td></tr>`).join('')}</tbody></table></div><aside class="editorial-closing"><h3>${escape(editorial.closing.title)}</h3><p>${escape(editorial.closing.text)}</p></aside></section>` : actions.length ? `<section class="section"><h2>Acciones recomendadas</h2>${actions.map((action, index) => `<article class="action"><h3>${index + 1}. ${escape(typeof action === 'string' ? action : action.action)}</h3>${action.kpi ? `<p><strong>Cómo medir:</strong> ${escape(action.kpi)}</p>` : ''}${action.suggestedAssignee ? `<p><strong>Responsable propuesto:</strong> ${escape(action.suggestedAssignee)}</p>` : ''}</article>`).join('')}</section>` : '';
  const sourcesHtml = includeSources ? `<section class="section sources"><h2>Fuentes y metodología</h2><div class="methodology"><p>Las cifras se presentan según su plataforma, distribución, período y unidad. Un valor ausente se muestra como «No disponible» y un valor abreviado conserva la marca de aproximación (≈).</p><p>Las variaciones pertenecen a cada indicador y a la comparación de su fuente. Los desgloses, los totales y las capturas que corroboran una cifra no se suman entre sí.</p><p>Las visualizaciones, el alcance, las interacciones y los resultados publicitarios describen hechos diferentes. Un resultado de plataforma no demuestra por sí solo una venta.</p></div><ol class="source-list">${[...catalog.values()].map((source) => `<li><span class="source-number">[${source.ref}]</span>${escape(source.name)}</li>`).join('')}</ol>${issueGroupsHtml(warnings, catalog)}${exclusionsHtml(metrics, catalog)}</section>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${escape(finalTitle)} · ${escape(report.client?.name || 'Cliente')}</title><style>${stylesheet}</style></head><body><main class="document">${preview ? '<aside class="notice"><strong>BORRADOR · VISTA PREVIA</strong><p>Documento para revisión. Las observaciones pendientes se muestran antes de la publicación.</p></aside>' : ''}<header class="cover"><div class="cover-top"><div class="brand">Informe de resultados</div>${clientLogoHtml(report)}</div><h1><span class="cover-title">${escape(finalTitle)}</span> <span class="client">${escape(report.client?.name || report.clientName || 'Cliente sin identificar')}</span></h1><p class="cover-subtitle">Estrategia y resultados para tu marca</p><div class="cover-meta"><p class="cover-author"><span>Preparado por</span><strong>BrainStudio · Agencia Creativa</strong></p><p class="cover-period"><span>Período del informe</span><strong>${escape(periodLabel({ start: report.startDate, end: report.endDate }))}</strong></p></div>${includeSources ? `<p class="meta">Versión de datos: ${escape(metrics.dataVersion)}${report.updatedAt ? ` · Actualizado: ${escape(dateLabel(report.updatedAt instanceof Date ? report.updatedAt.toISOString() : report.updatedAt))}` : ''}</p>` : ''}</header>${coverOverviewHtml(presentation, report)}<section class="section cover-summary">${summary}</section>${issueHtml}${platformHtml}${actionHtml}${sourcesHtml}${agencySignoffHtml}</main></body></html>`;
};

export const renderMetricReportPdf = async (report, { preview = false, renderPdf = renderReportPDF } = {}) => {
  const rendered = await renderPdf(buildMetricReportHtml(report, { preview }));
  const body = Buffer.isBuffer(rendered) ? rendered : rendered instanceof Uint8Array ? Buffer.from(rendered) : null;
  if (!body || body.subarray(0, 5).toString('ascii') !== '%PDF-') fail('REPORT_PDF_INVALID', 'No fue posible generar un archivo PDF válido.');
  return body;
};
