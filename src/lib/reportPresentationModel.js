import { formatEvidenceValue, formatEvidenceChangePct } from './reportEvidenceFormat.js';

const array = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value : value == null ? '' : String(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const unique = values => [...new Set(values.filter(Boolean))];
const stable = value => JSON.stringify(value);
const id = value => { let hash = 2166136261; for (const character of stable(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619); return (hash >>> 0).toString(36); };
const platformNames = { INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', CROSS_PLATFORM: 'Facebook e Instagram', META_ADS: 'Pauta Meta', UNKNOWN: 'Plataforma por confirmar' };
const scopes = { TOTAL: 'Total', ORGANIC: 'Orgánico', PAID: 'Anuncios', UNKNOWN: 'Sin desglose' };
const metricNames = {
  views: 'Visualizaciones', viewers: 'Espectadores', reach: 'Alcance', impressions: 'Impresiones', interactions: 'Interacciones con el contenido',
  linkClicks: 'Clics en el enlace', clicks: 'Clics', profileVisits: 'Visitas al perfil', follows: 'Nuevos seguidores', followers: 'Seguidores del período', followerTotal: 'Seguidores',
  contentCount: 'Contenido publicado', spend: 'Importe gastado', budget: 'Presupuesto', costPerResult: 'Costo por resultado', results: 'Resultados', ctr: 'CTR', cpc: 'CPC', cpm: 'CPM',
  watchTime: 'Tiempo de reproducción', threeSecondVideoViews: 'Reproducciones de 3 segundos', videoViews3s: 'Reproducciones de 3 segundos', videoViews: 'Reproducciones de video',
  percentage: 'Porcentaje', count: 'Cantidad', value: 'Valor observado', hombres: 'Hombres', mujeres: 'Mujeres'
};
const metricOrder = ['views', 'reach', 'viewers', 'interactions', 'profileVisits', 'linkClicks', 'clicks', 'follows', 'followers', 'followerTotal', 'contentCount', 'watchTime', 'threeSecondVideoViews', 'videoViews3s'];
const tableOrder = ['contentCount', 'views', 'interactions', 'results', 'reach', 'impressions', 'spend', 'costPerResult', 'clicks', 'ctr', 'cpc', 'cpm'];
const orderOf = (key, order) => order.includes(key) ? order.indexOf(key) : order.length;
export const getReportMetricLabel = (key, fallback = '') => metricNames[key] || text(fallback) || text(key) || 'Indicador';

const contextLabel = item => {
  if (item.contextKey === 'facebook_distribution_of_instagram_content') return 'Contenido de Instagram distribuido en Facebook';
  if (item.contextKey === 'instagram_content_with_facebook_distribution') return 'Contenido de Instagram y su distribución en Facebook';
  return item.contextLabel || ({ account_content: 'Contenido de la cuenta', account_audience: 'Audiencia de la cuenta', ACCOUNT_TOTAL: 'Resumen de la cuenta', 'instagram-overview': 'Resumen de Instagram', 'facebook-overview': 'Resumen de Facebook', 'instagram-crossposting': 'Tarjeta combinada de Instagram', advertising: 'Resultados publicitarios' })[item.contextKey] || 'Contexto propio de la captura';
};
const metadata = items => ({
  facts: items, observationIds: unique(items.flatMap(item => array(item.observationIds))), sourceIds: unique(items.flatMap(item => array(item.sourceIds)))
});
const factText = item => item.status === 'CONFLICT' ? 'Por conciliar' : formatEvidenceValue(item);
const resultTypeName = type => ({ CONVERSATIONS: 'Conversaciones', LEADS: 'Clientes potenciales', PURCHASES: 'Compras', LINK_CLICKS: 'Clics en el enlace' })[type] || type || 'Tipo no especificado';
const makeCell = items => ({
  text: unique(items.map(item => item.key === 'results' && unique(items.map(candidate => candidate.resultType)).length > 1 ? `${factText(item)} (${resultTypeName(item.resultType)})` : factText(item))).join(' / '), value: items.length && items.every(item => item.value === items[0].value && item.unit === items[0].unit) ? items[0].value : null,
  ...metadata(items), references: [], changeText: unique(items.map(item => formatEvidenceChangePct(item.changePct))).join(' / ')
});
const sectionTitle = (item, level) => {
  const platform = platformNames[item.platform] || text(item.platform);
  if (level === 'FORMAT') return `${item.key === 'contentCount' ? 'Volumen publicado' : 'Rendimiento por formato'} · ${platform}`;
  if (level === 'AD') return 'Resultados por anuncio';
  if (level === 'CAMPAIGN') return 'Resultados por campaña';
  if (['AD_SET', 'ADSET'].includes(level)) return 'Resultados por conjunto de anuncios';
  if (item.contextKey === 'facebook_distribution_of_instagram_content') return 'Distribución de Instagram en Facebook';
  if (item.platform === 'CROSS_PLATFORM') return 'Resultados combinados de Facebook e Instagram';
  return level === 'ACCOUNT' ? `Resumen de ${platform}` : `Indicadores de ${platform}`;
};

const noteDescriptions = {
  PERIOD_INHERITED: 'Se utiliza el período seleccionado donde la captura no muestra fechas completas.',
  CONTEXT_SOURCE_SPECIFIC: 'Algunas cifras conservan el contexto propio de su captura.',
  SCOPE_UNDISCLOSED: 'Algunas fuentes no muestran un desglose orgánico y pagado.',
  CURRENCY_UNKNOWN: 'Moneda no especificada: se conserva el símbolo visible; no se presume una moneda ISO.',
  PLATFORM_UNKNOWN: 'Hay indicadores cuya plataforma requiere confirmación.'
};

function contextNotes(metrics) {
  const groups = new Map();
  const add = issue => {
    const code = issue.code || text(issue.message || issue);
    if (!groups.has(code)) groups.set(code, { id: `note-${id(code)}`, code, count: 0, blocking: false, sourceIds: [], observationIds: [], messages: [] });
    const group = groups.get(code);
    group.count += issue.count || 1; group.blocking ||= Boolean(issue.blocking);
    group.sourceIds = unique([...group.sourceIds, ...array(issue.sourceIds)]);
    group.observationIds = unique([...group.observationIds, ...array(issue.observationIds)]);
    group.messages = unique([...group.messages, text(issue.message || issue)]);
  };
  for (const issue of array(metrics.issues)) add(issue);
  const unspecified = array(metrics.facts).filter(item => /^\$(?:\s*UNKNOWN)?$/i.test(text(item.unit)));
  if (unspecified.length && !groups.has('CURRENCY_UNKNOWN')) add({ code: 'CURRENCY_UNKNOWN', count: unspecified.length, sourceIds: unique(unspecified.flatMap(item => array(item.sourceIds))) });
  return [...groups.values()].map(({ messages, ...group }) => ({ ...group, message: noteDescriptions[group.code] || messages.join(' '), text: noteDescriptions[group.code] || messages.join(' ') }));
}

/** A view over saved evidence, never a calculator or a replacement for validation. */
export function buildReportPresentation(report = {}) {
  const metrics = report.normalizedMetrics || {};
  const facts = array(metrics.facts);
  const visible = facts.filter(item => finite(item.value) || item.status === 'CONFLICT');
  const detailFacts = facts.filter(item => !visible.includes(item));
  const invalidPanelIds = new Set(array(metrics.issues).filter(issue => issue.code === 'PANEL_METRIC_MISMATCH').flatMap(issue => array(issue.panelIds)));
  const detailPanels = array(metrics.panels).filter(panel => invalidPanelIds.has(panel.panelId));
  const sections = new Map();
  const byObservation = new Map();
  for (const fact of facts) for (const observationId of array(fact.observationIds)) {
    if (!byObservation.has(observationId)) byObservation.set(observationId, []);
    byObservation.get(observationId).push(fact);
  }
  for (const fact of visible) {
    const level = fact.entityLevel || 'UNKNOWN';
    const isTable = ['FORMAT', 'AD', 'CAMPAIGN', 'AD_SET', 'ADSET', 'CONTENT'].includes(level) && Boolean(fact.entityId || fact.entityName);
    const summary = !isTable && ['ACCOUNT', 'UNKNOWN'].includes(level) && ['INSTAGRAM', 'FACEBOOK'].includes(fact.platform)
      && ['account_content', 'account_audience', 'ACCOUNT_TOTAL', 'account', 'instagram-overview', 'facebook-overview'].includes(fact.contextKey);
    const formatSection = level === 'FORMAT' ? fact.key === 'contentCount' ? 'volume' : 'performance' : null;
    const key = stable([fact.platform, summary ? 'account_summary' : fact.contextKey, fact.period, summary ? 'SUMMARY' : level, isTable ? fact.scope : 'metrics', formatSection]);
    if (!sections.has(key)) sections.set(key, { id: `section-${id(key)}`, title: summary ? `Resumen de ${platformNames[fact.platform]}` : sectionTitle(fact, level), kind: isTable ? 'table' : 'metrics',
      platform: fact.platform || 'UNKNOWN', contextKey: fact.contextKey, contextLabel: summary ? 'Actividad de la cuenta en el período' : contextLabel(fact), period: fact.period, scope: isTable ? fact.scope : null, entityLevel: level, sourceIds: [], rows: [], _rows: new Map() });
    const section = sections.get(key);
    const rowKey = isTable ? stable([fact.entityId || fact.entityName, fact.entityId || level === 'FORMAT' ? '' : [...array(fact.sourceIds)].sort()])
      : stable([fact.key, fact.scope, fact.unit, fact.contextKey, fact.entityLevel, fact.entityId, fact.entityName, fact.key === 'results' ? fact.resultType : null]);
    if (!section._rows.has(rowKey)) section._rows.set(rowKey, { id: `row-${id([key, rowKey])}`, label: isTable ? fact.entityName || fact.entityId : `${getReportMetricLabel(fact.key, fact.label)}${['ORGANIC', 'PAID'].includes(fact.scope) ? ` · ${scopes[fact.scope]}` : ''}`,
      metricKey: isTable ? undefined : fact.key, scope: fact.scope, entityLevel: level, period: fact.period, contextLabel: contextLabel(fact), resultType: null, facts: [], observationIds: [], sourceIds: [], cells: isTable ? {} : undefined });
    const row = section._rows.get(rowKey);
    row.facts.push(fact);
    if (fact.key === 'results') { row.resultTypes = unique([...(row.resultTypes || []), fact.resultType]); row.resultType = row.resultTypes.map(resultTypeName).join(' / '); }
  }
  for (const section of sections.values()) {
    section.rows = [...section._rows.values()]; delete section._rows;
    for (const row of section.rows) {
      Object.assign(row, metadata(row.facts));
      if (section.kind === 'metrics') {
        row.valueText = unique(row.facts.map(factText)).join(' / ');
        row.changeText = unique(row.facts.map(item => formatEvidenceChangePct(item.changePct))).join(' / ');
      } else {
        for (const key of unique(row.facts.map(item => item.key))) row.cells[key] = makeCell(row.facts.filter(item => item.key === key));
      }
    }
    section.sourceIds = unique(section.rows.flatMap(row => row.sourceIds));
    if (section.kind === 'table') {
      const keys = unique(section.rows.flatMap(row => Object.keys(row.cells))).sort((a, b) => orderOf(a, tableOrder) - orderOf(b, tableOrder) || a.localeCompare(b));
      section.columns = keys.map(key => ({ key, label: getReportMetricLabel(key) }));
      section.rows.sort((a, b) => a.label.localeCompare(b.label, 'es') || a.id.localeCompare(b.id));
      for (const row of section.rows) for (const key of keys) row.cells[key] ||= { text: 'No disponible', value: null, facts: [], observationIds: [], sourceIds: [], references: [] };
    } else section.rows.sort((a, b) => orderOf(a.metricKey, metricOrder) - orderOf(b.metricKey, metricOrder) || orderOf(a.scope, ['TOTAL', 'ORGANIC', 'PAID', 'UNKNOWN']) - orderOf(b.scope, ['TOTAL', 'ORGANIC', 'PAID', 'UNKNOWN']) || a.label.localeCompare(b.label, 'es'));
  }

  // Panels supplement the facts. Only explicit cell references remove a repeated
  // display; matching numbers or names alone never prove that two cells coincide.
  for (const panel of array(metrics.panels).filter(item => !item.excluded && !invalidPanelIds.has(item.panelId))) {
    const rows = array(panel.dataset).filter(row => row && typeof row === 'object');
    const ignored = new Set(['label', 'name', 'id', 'rowId', 'sourceId', 'sourceIds', 'observationIds', 'evidence', 'precision']);
    let columns = unique(rows.flatMap(row => Object.keys(row).filter(key => !ignored.has(key)))).filter(key => rows.some(row => finite(row[key]) || typeof row[key] === 'string'));
    const linkedAlias = row => {
      const rowLabel = text(row.label ?? row.name);
      const candidates = columns.filter(column => column !== 'value' && row[column] === row.value && array(panel.cellReferences).some(ref =>
        ref.rowLabel === rowLabel && ref.columnKey === column && (byObservation.get(ref.observationId) || []).some(fact =>
          fact.key === column && fact.value === row.value && fact.status !== 'CONFLICT' && array(fact.sourceIds).includes(panel.sourceId))));
      if (candidates.length !== 1) return false;
      const ownRefs = array(panel.cellReferences).filter(ref => ref.rowLabel === rowLabel && ref.columnKey === 'value');
      return ownRefs.every(ref => (byObservation.get(ref.observationId) || []).every(fact => fact.key === candidates[0] && fact.value === row.value));
    };
    const duplicateValue = columns.includes('value') && rows.some(row => finite(row.value)) && rows.filter(row => row.value != null).every(row =>
      finite(row.value) && ((panel.metricKey !== 'value' && columns.includes(panel.metricKey) && row[panel.metricKey] === row.value) || linkedAlias(row)));
    if (duplicateValue) columns = columns.filter(key => key !== 'value');
    if (!columns.length) continue;
    const namedValue = columns.length === 1 && columns[0] === 'value' && !['mixed', 'summary', 'unknown', 'campaign_metrics', undefined].includes(panel.metricKey);
    const panelRows = rows.map((raw, rowIndex) => {
      const label = text(raw.label ?? raw.name) || 'Sin etiqueta';
      const cells = {};
      for (const column of columns) {
        const outputKey = namedValue ? panel.metricKey : column;
        const refs = array(panel.cellReferences).filter(ref => ref.rowLabel === label && (ref.columnKey === column || (duplicateValue && ref.columnKey === 'value' && column === panel.metricKey)));
        const linked = unique(refs.flatMap(ref => byObservation.get(ref.observationId) || []));
        const identical = linked.length && linked.every(item => item.value === raw[column] && item.status !== 'CONFLICT');
        if (identical && linked.every(item => visible.includes(item))) continue;
        const unit = linked[0]?.unit || (column === 'value' || column === panel.metricKey || columns.length === 1 ? panel.unit : undefined);
        cells[outputKey] = { text: typeof raw[column] === 'string' ? raw[column] : formatEvidenceValue({ value: raw[column], unit, precision: raw.precision }), value: finite(raw[column]) ? raw[column] : null,
          ...metadata(linked), sourceIds: unique([panel.sourceId, ...linked.flatMap(item => array(item.sourceIds))]), references: [{ panelId: panel.panelId, rowIndex, rowLabel: label, columnKey: column }] };
      }
      return { id: `row-${id([panel.panelId, rowIndex, label])}`, label, cells, facts: unique(Object.values(cells).flatMap(cell => cell.facts)), observationIds: unique(Object.values(cells).flatMap(cell => cell.observationIds)), sourceIds: unique([panel.sourceId]), _meaningful: Object.values(cells).some(cell => finite(cell.value) || (cell.text && cell.text !== 'No disponible')) };
    });
    if (!panelRows.some(row => row._meaningful)) continue;
    const keys = unique(panelRows.flatMap(row => Object.keys(row.cells)));
    const kept = panelRows.filter(row => Object.keys(row.cells).length).map(({ _meaningful, ...row }) => row);
    const section = { id: `panel-${id(panel.panelId)}`, panelId: panel.panelId, title: panel.title || getReportMetricLabel(panel.metricKey), kind: 'table', platform: panel.platform || 'UNKNOWN', contextKey: panel.contextKey,
      contextLabel: contextLabel(panel), period: panel.period, scope: panel.scope, sourceIds: unique([panel.sourceId]), columns: keys.map(key => ({ key, label: key === 'value' ? panel.metricLabel || getReportMetricLabel(panel.metricKey) : getReportMetricLabel(key) })), rows: kept };
    for (const row of kept) for (const key of keys) row.cells[key] ||= { text: 'No disponible', value: null, facts: [], observationIds: [], sourceIds: [], references: [] };
    sections.set(section.id, section);
  }
  const platformOrder = ['INSTAGRAM', 'FACEBOOK', 'CROSS_PLATFORM', 'META_ADS', 'UNKNOWN'];
  const sorted = [...sections.values()].sort((a, b) => orderOf(a.platform, platformOrder) - orderOf(b.platform, platformOrder)
    || orderOf(a.entityLevel, ['ACCOUNT', 'UNKNOWN', 'FORMAT', 'CAMPAIGN', 'AD_SET', 'ADSET', 'AD']) - orderOf(b.entityLevel, ['ACCOUNT', 'UNKNOWN', 'FORMAT', 'CAMPAIGN', 'AD_SET', 'ADSET', 'AD'])
    || a.title.localeCompare(b.title, 'es') || a.id.localeCompare(b.id));
  return { sections: sorted, contextNotes: contextNotes(metrics), detailFacts, detailPanels };
}
