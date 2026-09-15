/** Pure evidence reconciliation shared by the API, report UI and PDF renderer.
 * A fact is a compatible observation, never an automatic sum of screenshots.
 */
import { REPORT_DEFAULT_CURRENCY, resolveReportCurrency } from './reportCurrency.js';

const PLATFORMS = new Set(['FACEBOOK', 'INSTAGRAM', 'CROSS_PLATFORM', 'META_ADS', 'UNKNOWN']);
const SCOPES = new Set(['TOTAL', 'ORGANIC', 'PAID', 'UNKNOWN']);
const PRECISIONS = new Set(['EXACT', 'ROUNDED', 'UNKNOWN']);
const MONETARY_KEYS = new Set(['spend', 'costPerResult', 'cpc', 'cpm', 'revenue', 'budget']);
const NON_ADDITIVE_KEYS = new Set(['reach', 'viewers', 'uniqueViewers', 'ctr', 'cpc', 'cpm', 'costPerResult', 'frequency', 'engagementRate', 'follows', 'followers']);
const text = (value) => typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
const upper = (value) => text(value).toUpperCase();
const COUNT_UNITS = new Set(['count', 'counts', 'number', 'integer', 'views', 'view', 'viewers', 'viewer', 'clicks', 'click', 'visits', 'visit', 'followers', 'follower', 'followertotal', 'reach', 'interactions', 'interaction', 'impressions', 'impression']);
const unitOf = value => COUNT_UNITS.has(text(value).toLowerCase()) ? 'count' : upper(value) === '$UNKNOWN' ? '$' : text(value) || 'UNKNOWN';
const contextOf = (value, sourceId) => !text(value) || upper(value) === 'UNKNOWN' ? `SOURCE_SPECIFIC:${sourceId}` : text(value);
const isIsoCurrency = unit => /^[A-Z]{3}$/.test(unit);
const hasCurrencySymbol = unit => /[$€£¥₹₩₽]/.test(unit);
const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
const unique = (values) => [...new Set(values)].sort();
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
// Two independent 32-bit hashes; deterministic in browsers and Node, no crypto dependency.
const hash = (value) => {
  const input = typeof value === 'string' ? value : canonical(value);
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < input.length; i++) {
    a = Math.imul(a ^ input.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ input.charCodeAt(i);
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
};
const sortStable = (items) => [...items].sort((a, b) => canonical(a).localeCompare(canonical(b), 'en'));
const platformOf = (value) => {
  const candidate = upper(value);
  if (candidate === 'MIXED') return 'CROSS_PLATFORM';
  return PLATFORMS.has(candidate) ? candidate : 'UNKNOWN';
};
const scopeOf = (value) => {
  const candidate = upper(value);
  if (candidate === 'MIXED') return 'TOTAL';
  if (candidate === 'ADS') return 'PAID';
  return SCOPES.has(candidate) ? candidate : 'UNKNOWN';
};
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const periodOf = (value) => ({ start: isDate(value?.start) ? value.start : null, end: isDate(value?.end) ? value.end : null });
const fullPeriod = (value) => value.start !== null && value.end !== null && value.start <= value.end;

function numericValue(value, unit = '') {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let input = value.trim().replace(/[−–]/g, '-');
  if (!input || /^[-—–]$/.test(input)) return null;
  const suffix = input.match(/\s*(mil(?:lones?)?|mill[oó]n|[kKmM])\s*$/i)?.[1]?.toLowerCase();
  const multiplier = suffix ? (suffix === 'k' || suffix === 'mil' ? 1000 : 1000000) : 1;
  if (suffix) input = input.replace(/\s*(mil(?:lones?)?|mill[oó]n|[kKmM])\s*$/i, '');
  const percent = unit === '%' || input.includes('%');
  input = input.replace(/(?:COP|USD|EUR|GBP|MXN|ARS|CLP|PEN|BRL|CAD|AUD)/gi, '').replace(/[$€£%\s]/g, '');
  if (!/^[+-]?\d+(?:[.,]\d+)*$/.test(input)) return null;
  if (input.includes('.') && input.includes(',')) {
    const decimal = input.lastIndexOf('.') > input.lastIndexOf(',') ? '.' : ',';
    input = input.split(decimal === '.' ? ',' : '.').join('').replace(decimal, '.');
  } else if (input.includes(',')) {
    input = !suffix && !percent && /^[+-]?\d{1,3}(,\d{3})+$/.test(input) ? input.replace(/,/g, '') : input.replace(',', '.');
  } else if (input.includes('.') && !suffix && !percent && /^[+-]?[1-9]\d{0,2}(\.\d{3})+$/.test(input)) {
    input = input.replace(/\./g, '');
  }
  const number = Number(input) * multiplier;
  return Number.isFinite(number) ? number : null;
}

function roundingStep(rawValue) {
  const match = text(rawValue).match(/([\d.,]+)\s*(mil(?:lones?)?|mill[oó]n|[kKmM])\s*$/i);
  if (!match) return null;
  const suffix = match[2].toLowerCase();
  const multiplier = suffix === 'mil' || suffix === 'k' ? 1000 : 1000000;
  const decimals = match[1].split(/[.,]/)[1]?.length || 0;
  return multiplier / (10 ** decimals);
}

function parseExtraction(extracted) {
  if (typeof extracted !== 'string') return extracted && typeof extracted === 'object' ? extracted : {};
  try {
    return JSON.parse(extracted.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } catch {
    throw new Error('La extracción no contiene JSON válido.');
  }
}

function formatIdentity(item, data, origin) {
  if (upper(data.screenType) !== 'CONTENT_FORMATS') return null;
  if (item.entityId || !['', 'UNKNOWN', 'ACCOUNT', 'FORMAT'].includes(upper(item.entityLevel))) return null;
  const itemId = text(item.observationId || item.id);
  const key = text(item.key || item.metricKey);
  const value = numericValue(item.value, item.unit);
  if (!itemId || value === null) return null;
  for (const panel of Array.isArray(data.panels) ? data.panels : []) {
    if (text(panel.metricKey || panel.key) !== key) continue;
    const linked = (panel.observationIds || []).some(id => text(id) === itemId || `${origin}:${text(id)}` === itemId || text(id) === `${origin}:${itemId}`);
    if (!linked) continue;
    const row = (Array.isArray(panel.dataset) ? panel.dataset : []).find(row => text(row.label) === text(item.label)
      && numericValue(row[key] ?? row.value, panel.unit) === value);
    if (row) return { entityLevel: 'FORMAT', entityName: text(row.label), entityId: null, entityProvenance: 'PANEL_ROW' };
  }
  return null;
}

/** All originals survive, including duplicates, missing values and exclusions. */
export function normalizeReportObservations(extracted, { sourceId, reportPeriod, currency } = {}) {
  const data = parseExtraction(extracted);
  const items = Array.isArray(data) ? data : Array.isArray(data.observations) ? data.observations
    : Array.isArray(data.metrics) ? data.metrics
      : Object.entries(data.metrics || {}).map(([key, item]) => typeof item === 'object' && item !== null ? { ...item, key } : { key, value: item });
  const origin = text(sourceId || data.sourceId || data.id) || 'unassigned-source';
  const declaredPeriod = periodOf(reportPeriod);
  const ids = new Map();
  const normalized = items.filter(item => item && typeof item === 'object').map((item) => {
    const rawValue = item.rawValue ?? item.value ?? null;
    const key = text(item.key || item.metricKey) || 'unknown';
    const declaredUnit = unitOf(item.unit);
    const visibleSymbols = unique(text(rawValue).match(/[$€£¥₹₩₽]/g) || []);
    const sourceUnit = MONETARY_KEYS.has(key) && declaredUnit === 'UNKNOWN' && visibleSymbols.length === 1 ? visibleSymbols[0] : declaredUnit;
    const currencyFields = resolveReportCurrency({ ...item, key, unit: sourceUnit }, currency);
    const { unit } = currencyFields;
    const visiblePeriod = periodOf(item.period || data.period);
    const inherited = !visiblePeriod.start && !visiblePeriod.end && fullPeriod(declaredPeriod);
    const confidence = numericValue(item.confidence ?? data.confidence);
    const value = item.value === null ? null : numericValue(item.value ?? rawValue, unit);
    const format = formatIdentity(item, data, origin);
    const result = {
      observationId: '', key, label: text(item.label || item.key || item.metricKey) || 'Sin etiqueta',
      value, rawValue: clone(rawValue), ...currencyFields,
      platform: platformOf(item.platform ?? data.platform), scope: scopeOf(item.scope),
      precision: roundingStep(rawValue) ? 'ROUNDED' : PRECISIONS.has(upper(item.precision)) ? upper(item.precision) : value === null ? 'UNKNOWN' : 'EXACT',
      contextKey: contextOf(item.contextKey || data.contextKey, origin),
      contextLabel: text(item.contextLabel || data.contextLabel) || null,
      contextProvenance: contextOf(item.contextKey || data.contextKey, origin).startsWith('SOURCE_SPECIFIC:') ? 'SOURCE_SPECIFIC' : (item.contextProvenance || 'SOURCE_VISIBLE'),
      period: inherited ? declaredPeriod : visiblePeriod,
      periodProvenance: inherited ? 'REPORT_DECLARED' : item.periodProvenance || (fullPeriod(visiblePeriod) ? 'SOURCE_VISIBLE' : 'UNKNOWN'),
      comparisonPeriod: periodOf(item.comparisonPeriod || data.comparisonPeriod), changePct: numericValue(item.changePct, '%'),
      entityLevel: format?.entityLevel || (upper(item.entityLevel || data.entityLevel) === 'CONTENT_FORMAT' ? 'FORMAT' : upper(item.entityLevel || data.entityLevel)) || 'UNKNOWN',
      entityId: format ? null : text(item.entityId || data.entityId) || null,
      entityName: format?.entityName || text(item.entityName || data.entityName) || null,
      ...(format || item.entityProvenance ? { entityProvenance: format?.entityProvenance || item.entityProvenance } : {}),
      parentEntityId: text(item.parentEntityId || data.parentEntityId) || null,
      resultType: text(item.resultType).toUpperCase() === 'UNKNOWN' ? null : text(item.resultType) || null,
      relation: item.relation || item.parentObservationId ? {
        type: upper(item.relation?.type) || 'COMPONENT_OF',
        parentObservationId: text(item.relation?.parentObservationId || item.parentObservationId) || null,
        exhaustive: item.relation?.exhaustive === true,
      } : null,
      breakdownComplete: item.breakdownComplete === true,
      sourceId: origin, evidence: clone(item.evidence ?? null),
      confidence: confidence !== null && confidence >= 0 && confidence <= 1 ? confidence : null,
      excluded: item.excluded === true,
      ...(Object.hasOwn(item, 'originalRawValue') ? { originalRawValue: clone(item.originalRawValue) } : {}),
      ...(item.review ? { review: clone(item.review) } : {}),
    };
    const suppliedId = text(item.observationId || item.id);
    result.observationId = suppliedId ? (suppliedId.startsWith(`${origin}:`) ? suppliedId : `${origin}:${suppliedId}`) : `${origin}:obs-${hash(result)}`;
    if (suppliedId) ids.set(suppliedId, result.observationId);
    return result;
  });
  return normalized.map(item => ({ ...item, relation: item.relation ? {
    ...item.relation,
    parentObservationId: ids.get(item.relation.parentObservationId) || (item.relation.parentObservationId && !item.relation.parentObservationId.includes(':') ? `${origin}:${item.relation.parentObservationId}` : item.relation.parentObservationId),
  } : null }));
}

const factSignature = (item) => canonical({
  key: item.key, unit: item.unit, platform: item.platform, scope: item.scope, contextKey: item.contextKey,
  period: item.period, comparisonPeriod: item.comparisonPeriod, entityLevel: item.entityLevel,
  entityId: item.entityId, entityName: item.entityId ? null : item.entityName, parentEntityId: item.parentEntityId,
  resultType: ['results', 'costPerResult'].includes(item.key) ? item.resultType || item.label : null,
});

// Resolve only the known crossposting context through explicit, compatible
// relationships. The original observation is retained unchanged in the report.
function reconcileContexts(observations) {
  const combined = 'instagram_content_with_facebook_distribution';
  const byId = new Map(observations.map(item => [item.observationId, item]));
  const resolved = new Map();
  const hasCycle = (item) => {
    const seen = new Set();
    for (let current = item; current; current = byId.get(current.relation?.parentObservationId)) {
      if (seen.has(current.observationId)) return true;
      seen.add(current.observationId);
    }
    return false;
  };
  const resolve = (item, visiting = new Set()) => {
    if (resolved.has(item.observationId)) return resolved.get(item.observationId);
    if (visiting.has(item.observationId) || item.contextKey !== combined || hasCycle(item)) return item.contextKey;
    const parent = byId.get(item.relation?.parentObservationId);
    if (!parent || !['COMPONENT_OF', 'CORROBORATES'].includes(item.relation.type)
      || item.key !== parent.key || item.unit !== parent.unit || canonical(item.period) !== canonical(parent.period)
      || !['ACCOUNT', 'UNKNOWN'].includes(item.entityLevel) || !['ACCOUNT', 'UNKNOWN'].includes(parent.entityLevel)
      || (item.entityName && parent.entityName && item.entityName !== parent.entityName)
      || item.entityId !== parent.entityId || item.parentEntityId !== parent.parentEntityId) return item.contextKey;
    const parentContext = resolve(parent, new Set([...visiting, item.observationId]));
    const platformContext = item.platform === 'INSTAGRAM' ? 'account_content'
      : item.platform === 'FACEBOOK' ? 'facebook_distribution_of_instagram_content' : null;
    let context = item.contextKey;
    if (parent.platform === 'CROSS_PLATFORM' && parentContext === combined && item.relation.type === 'COMPONENT_OF') {
      if (item.platform === 'INSTAGRAM') context = 'account_content';
      if (item.platform === 'FACEBOOK') context = 'facebook_distribution_of_instagram_content';
    } else if (parent.platform === item.platform && parentContext === platformContext
      && (parent.scope === item.scope || (item.relation.type === 'COMPONENT_OF' && parent.scope === 'TOTAL' && ['ORGANIC', 'PAID'].includes(item.scope)))) {
      context = parentContext;
    }
    resolved.set(item.observationId, context);
    return context;
  };
  return observations.map(item => {
    const contextKey = resolve(item);
    if (contextKey === item.contextKey) return item;
    return { ...item, contextKey, sourceContextKey: item.contextKey, contextProvenance: 'EXPLICIT_RELATION',
      contextLabel: contextKey === 'account_content' ? 'Contenido de Instagram' : 'Contenido de Instagram distribuido en Facebook' };
  });
}
const compatibleValue = (left, right) => {
  if (left.value === right.value) return true;
  const leftStep = left.precision === 'ROUNDED' ? roundingStep(left.rawValue) : 0;
  const rightStep = right.precision === 'ROUNDED' ? roundingStep(right.rawValue) : 0;
  if (!leftStep && !rightStep) return false;
  return Math.abs(left.value - right.value) <= ((leftStep || 0) + (rightStep || 0)) / 2 + 1e-9;
};
const makeIssue = (code, message, items, blocking) => {
  const observationIds = unique(items.map(item => item.observationId).filter(Boolean));
  const sourceIds = unique(items.flatMap(item => item.sourceIds || [item.sourceId]).filter(Boolean));
  const panelIds = unique(items.map(item => item.panelId).filter(Boolean));
  return { id: `issue-${hash({ code, observationIds, sourceIds, panelIds })}`, code, message, observationIds, sourceIds, ...(panelIds.length ? { panelIds } : {}), blocking };
};

function groupRepeatedIssues(issues) {
  const messages = {
    PERIOD_INHERITED: 'Las cifras indicadas usan el período seleccionado para el informe; sus capturas no muestran fechas completas.',
    SCOPE_UNDISCLOSED: 'Las cifras indicadas no muestran desglose orgánico o de anuncios y se conservan sin desglose.',
    CURRENCY_UNKNOWN: 'Los importes conservan el símbolo visible sin asignar una moneda ISO; no se convierten ni se suman entre monedas sin identificar.',
  };
  const grouped = new Map();
  const result = [];
  for (const issue of issues) {
    if (!messages[issue.code]) { result.push(issue); continue; }
    if (!grouped.has(issue.code)) grouped.set(issue.code, []);
    grouped.get(issue.code).push(issue);
  }
  for (const [code, entries] of grouped) {
    const observationIds = unique(entries.flatMap(item => item.observationIds || []));
    const sourceIds = unique(entries.flatMap(item => item.sourceIds || []));
    const panelIds = unique(entries.flatMap(item => item.panelIds || []));
    const blocking = entries.some(item => item.blocking);
    const message = code === 'CURRENCY_UNKNOWN' && blocking ? 'Hay importes sin moneda ni símbolo identificable; confirma su unidad antes de publicar.' : messages[code];
    result.push({ id: `issue-${hash({ code, observationIds, sourceIds, panelIds })}`, code, message, observationIds, sourceIds,
      ...(panelIds.length ? { panelIds } : {}), blocking });
  }
  return result;
}

function consolidate(items, issues) {
  const present = items.filter(item => item.value !== null);
  const precisionRank = (item) => item.precision === 'EXACT' ? 0 : item.precision === 'ROUNDED' ? roundingStep(item.rawValue) || Number.MAX_VALUE : Number.MAX_VALUE;
  const ordered = sortStable(present).sort((a, b) => precisionRank(a) - precisionRank(b));
  const chosen = ordered[0] || items[0];
  const conflict = present.some((left, index) => present.slice(index + 1).some(right => !compatibleValue(left, right)));
  const changes = unique(present.filter(item => item.changePct !== null).map(item => item.changePct));
  if (conflict) issues.push(makeIssue('VALUE_CONFLICT', `Las fuentes muestran valores incompatibles para ${chosen.label}; conserva ambas lecturas y revisa el contexto.`, items, true));
  if (changes.length > 1) issues.push(makeIssue('CHANGE_CONFLICT', `Las variaciones de ${chosen.label} no coinciden para el mismo período de comparación.`, items, true));
  const sourceIds = unique(items.map(item => item.sourceId));
  const observationIds = unique(items.map(item => item.observationId));
  const { observationId, sourceId, excluded, review, relation, evidence, ...base } = chosen;
  return {
    ...base, factId: `fact-${hash(factSignature(chosen))}`,
    value: conflict ? null : chosen.value, changePct: changes.length === 1 ? Number(changes[0]) : null,
    status: conflict ? 'CONFLICT' : !present.length ? 'MISSING' : sourceIds.length > 1 ? 'CORROBORATED' : 'OBSERVED',
    sourceIds, observationIds,
    ...(items.some(item => item.sourceContextKey) ? { contextResolution: { method: 'EXPLICIT_RELATION',
      observationIds: unique(items.filter(item => item.sourceContextKey).map(item => item.observationId)) } } : {}),
    confidence: present.some(item => item.confidence !== null) ? Math.min(...present.filter(item => item.confidence !== null).map(item => item.confidence)) : null,
    evidence: sortStable(items.map(item => ({ sourceId: item.sourceId, observationId: item.observationId, evidence: clone(item.evidence) }))),
  };
}

function validateObservation(item, reportPeriod, issues) {
  const push = (code, message, blocking) => issues.push(makeIssue(code, message, [item], blocking));
  if (item.value === null) return;
  if (/^(recommendations|recommendationCount|recommendationsCount|notificationCount)$/i.test(item.key)) push('UI_METADATA_AS_METRIC', `${item.label} es un contador de la interfaz; revisa su exclusión antes de presentarlo como desempeño.`, true);
  const evidenceText = typeof item.evidence === 'string' ? item.evidence : item.evidence?.text || item.evidence?.quote || '';
  const sampleCount = evidenceText.match(/seg[uú]n\s+([\d.,]+)\s+contenidos/i)?.[1];
  if (item.key === 'contentCount' && sampleCount && numericValue(sampleCount) === item.value) push('SOURCE_SAMPLE_AS_CONTENT_COUNT', 'La cifra de «Según N contenidos» identifica una base consultada; no confirma cuántos contenidos se publicaron durante el período.', true);
  const rawNumber = numericValue(item.rawValue, item.unit);
  if (rawNumber !== null && Math.abs(rawNumber - item.value) > 1e-7) push('RAW_VALUE_MISMATCH', `El valor procesado de ${item.label} difiere de la cifra escrita en la fuente.`, true);
  if (item.platform === 'UNKNOWN') push('PLATFORM_UNKNOWN', `Falta identificar la plataforma de ${item.label}.`, true);
  if (item.scope === 'UNKNOWN') push('SCOPE_UNDISCLOSED', `${item.label} no muestra desglose orgánico o de anuncios.`, false);
  if (item.contextProvenance === 'SOURCE_SPECIFIC') push('CONTEXT_SOURCE_SPECIFIC', `${item.label} conserva el contexto de su captura; no se concilia automáticamente con otras fuentes.`, false);
  if (!fullPeriod(item.period)) push('PERIOD_UNKNOWN', `Falta un período completo para ${item.label}.`, true);
  else if (fullPeriod(reportPeriod) && canonical(item.period) !== canonical(reportPeriod)) push('PERIOD_MISMATCH', `El período visible de ${item.label} difiere del período solicitado.`, true);
  if (item.periodProvenance === 'REPORT_DECLARED') push('PERIOD_INHERITED', `El período de ${item.label} procede del informe solicitado y no de una fecha visible en esta captura.`, false);
  if (MONETARY_KEYS.has(item.key) && !isIsoCurrency(item.unit)) push('CURRENCY_UNKNOWN', `La moneda de ${item.label} no tiene un código ISO identificado.`, !hasCurrencySymbol(item.unit));
  if (['CAMPAIGN', 'AD_SET', 'AD'].includes(item.entityLevel) && !item.entityId && !item.entityName) push('ENTITY_UNKNOWN', `Falta identificar la entidad de ${item.label}.`, true);
}

function validateBreakdowns(observations, issues) {
  const byId = new Map(observations.map(item => [item.observationId, item]));
  const groups = new Map();
  for (const item of observations) {
    if (item.relation?.type !== 'COMPONENT_OF' || !item.relation.parentObservationId) continue;
    const parentId = item.relation.parentObservationId;
    if (!groups.has(parentId)) groups.set(parentId, []);
    groups.get(parentId).push(item);
  }
  for (const [parentId, children] of groups) {
    const parent = byId.get(parentId);
    if (!parent) {
      issues.push(makeIssue('RELATION_PARENT_MISSING', 'El desglose referencia una observación total que no está disponible.', children, false));
      continue;
    }
    const complete = parent.breakdownComplete || children.every(item => item.relation.exhaustive);
    if (NON_ADDITIVE_KEYS.has(parent.key) || parent.unit === '%') continue;
    if (MONETARY_KEYS.has(parent.key) && !isIsoCurrency(parent.unit)) continue;
    const explicitPlatformBreakdown = parent.platform === 'CROSS_PLATFORM' && children.length === 2
      && unique(children.map(item => item.platform)).join(',') === 'FACEBOOK,INSTAGRAM';
    const compatible = children.every(item => item.key === parent.key && item.unit === parent.unit && canonical(item.period) === canonical(parent.period) && (item.contextKey === parent.contextKey || explicitPlatformBreakdown));
    if (!compatible || children.some(item => item.value === null) || parent.value === null) {
      issues.push(makeIssue('BREAKDOWN_INCOMPLETE', `No se puede verificar el desglose de ${parent.label} con las unidades, contextos y valores disponibles.`, [parent, ...children], false));
      continue;
    }
    // Duplicate images do not create more components; retain only each identical identity.
    const components = [...new Map(children.map(item => [factSignature(item), item])).values()];
    const sum = components.reduce((total, item) => total + item.value, 0);
    const tolerance = (parent.precision === 'ROUNDED' ? roundingStep(parent.rawValue) || 0 : 0) / 2
      + components.reduce((total, item) => total + (item.precision === 'ROUNDED' ? roundingStep(item.rawValue) || 0 : 0) / 2, 0);
    if (complete && Math.abs(sum - parent.value) > tolerance + 1e-7) issues.push(makeIssue('BREAKDOWN_MISMATCH', `El desglose explícito de ${parent.label} suma ${sum} y el total fuente muestra ${parent.rawValue ?? parent.value}.`, [parent, ...children], true));
    else if (!complete && sum > parent.value + tolerance + 1e-7) issues.push(makeIssue('PARTIAL_BREAKDOWN_EXCEEDS_TOTAL', `Los componentes explícitos de ${parent.label} suman ${sum}, más que su total fuente ${parent.rawValue ?? parent.value}.`, [parent, ...children], true));
  }
}

const SUMMARY_METRIC_LABELS = new Map([
  ['visualizaciones', 'views'], ['espectadores', 'viewers'], ['alcance', 'reach'], ['impresiones', 'impressions'],
  ['interacciones', 'interactions'], ['interacciones con el contenido', 'interactions'],
  ['clics en el enlace', 'linkClicks'], ['visitas al perfil', 'profileVisits'],
  ['importe gastado', 'spend'], ['costo por resultado', 'costPerResult'], ['resultados', 'results'],
]);
const SUMMARY_METRIC_KEYS = new Set(SUMMARY_METRIC_LABELS.values());

function validateSummaryMetric(panel, issues) {
  if (!['SUMMARY', 'SUMMARY_CARDS'].includes(upper(panel.chartType)) || !SUMMARY_METRIC_KEYS.has(panel.metricKey)) return;
  for (const row of panel.dataset) {
    const label = text(row?.label ?? row?.name);
    const rowMetric = SUMMARY_METRIC_LABELS.get(label.toLowerCase());
    if (!rowMetric || rowMetric === panel.metricKey) continue;
    if (![row.value, row[panel.metricKey], row[rowMetric]].some(value => numericValue(value, panel.unit) !== null)) continue;
    issues.push(makeIssue('PANEL_METRIC_MISMATCH', `La fila ${label} corresponde a un indicador distinto de la métrica ${panel.metricKey} declarada por el panel. Revisa su identidad antes de publicar.`, [panel], true));
  }
}

function normalizePanelReferences(panel, sourceObservations, issues) {
  const qualify = id => text(id).includes(':') ? text(id) : `${panel.sourceId}:${text(id)}`;
  const byId = new Map(sourceObservations.map(item => [item.observationId, item]));
  panel.observationIds = unique((Array.isArray(panel.observationIds) ? panel.observationIds : []).map(qualify));
  const allowedIds = new Set(panel.observationIds);
  const invalid = message => issues.push(makeIssue('PANEL_REFERENCE_INVALID', message, [panel], true));
  if (panel.observationIds.some(id => !byId.has(id))) invalid('El panel referencia una observación que no pertenece a esta fuente.');
  const rows = panel.dataset;
  const hasLabel = (observation, label) => text(observation.label) === label || text(observation.entityName) === label;
  const matchingColumn = (observation, column) => observation.key === (column === 'value' ? panel.metricKey : column);
  const explicit = Array.isArray(panel.cellReferences);
  const references = explicit ? panel.cellReferences.map(ref => ({
    rowLabel: text(ref?.rowLabel), columnKey: text(ref?.columnKey), observationId: qualify(ref?.observationId)
  })) : rows.flatMap(row => {
    const label = text(row.label);
    if (rows.filter(candidate => text(candidate.label) === label).length !== 1) return [];
    return Object.keys(row).filter(column => column !== 'label').flatMap(column => {
      const candidates = sourceObservations.filter(item => allowedIds.has(item.observationId) && hasLabel(item, label) && matchingColumn(item, column));
      return candidates.length === 1 ? [{ rowLabel: label, columnKey: column, observationId: candidates[0].observationId }] : [];
    });
  });
  const seen = new Set();
  for (const ref of references) {
    const observation = byId.get(ref.observationId);
    const matches = rows.filter(row => text(row.label) === ref.rowLabel);
    const cellId = canonical({ rowLabel: ref.rowLabel, columnKey: ref.columnKey });
    if (!observation || observation.excluded || !allowedIds.has(ref.observationId) || matches.length !== 1 || !Object.hasOwn(matches[0], ref.columnKey)
      || !hasLabel(observation, ref.rowLabel) || !matchingColumn(observation, ref.columnKey) || seen.has(cellId)) {
      invalid('La referencia de una celda no identifica una fila, columna y observación únicas del mismo panel.');
      continue;
    }
    seen.add(cellId);
    const platformCompatible = panel.platform === observation.platform || (panel.platform === 'CROSS_PLATFORM' && ['FACEBOOK', 'INSTAGRAM'].includes(observation.platform));
    const scopeCompatible = panel.scope === observation.scope || panel.scope === 'UNKNOWN' || observation.scope === 'UNKNOWN' || (panel.scope === 'TOTAL' && ['ORGANIC', 'PAID'].includes(observation.scope));
    const unitComparable = ref.columnKey === 'value' || panel.metricKey === observation.key;
    const unitCompatible = !unitComparable || panel.unit === observation.unit || panel.unit === 'UNKNOWN' || observation.unit === 'UNKNOWN';
    const periodCompatible = !fullPeriod(panel.period) || !fullPeriod(observation.period) || canonical(panel.period) === canonical(observation.period);
    const contextComparable = panel.platform !== 'CROSS_PLATFORM' && !panel.contextKey.startsWith('SOURCE_SPECIFIC:') && !observation.contextKey.startsWith('SOURCE_SPECIFIC:');
    const contextCompatible = !contextComparable || panel.contextKey === observation.contextKey;
    if (!platformCompatible || !scopeCompatible || !unitCompatible || !periodCompatible || !contextCompatible) {
      issues.push(makeIssue('PANEL_CONTEXT_MISMATCH', `El contexto de la celda ${ref.rowLabel} contradice la plataforma, distribución, unidad o período de su observación vinculada.`, [panel, observation], true));
    }
    const value = numericValue(matches[0][ref.columnKey], observation.unit);
    if (value !== observation.value) issues.push(makeIssue('PANEL_OBSERVATION_MISMATCH', `La celda ${ref.rowLabel} del panel muestra un valor distinto de su observación vigente; revisa ambas cifras antes de publicar.`, [panel, observation], true));
  }
  panel.cellReferences = references;
  return panel;
}

export function buildEvidenceReport(sources = [], { reportPeriod, currency } = {}) {
  const declaredPeriod = periodOf(reportPeriod);
  const issues = [];
  const observations = [];
  const panels = [];
  for (const input of Array.isArray(sources) ? sources : []) {
    const data = parseExtraction(input);
    const fallback = { ...data, observations: sortStable(data.observations || []), metrics: Array.isArray(data.metrics) ? sortStable(data.metrics) : data.metrics };
    const sourceId = text(data.sourceId || data.id) || `source-${hash(fallback)}`;
    const sourceObservations = normalizeReportObservations(data, { sourceId, reportPeriod: declaredPeriod, currency });
    observations.push(...sourceObservations);
    for (const panel of Array.isArray(data.panels) ? data.panels : []) {
      if (panel.excluded === true) continue;
      const visiblePeriod = periodOf(panel.period || data.period);
      const inherited = !visiblePeriod.start && !visiblePeriod.end && fullPeriod(declaredPeriod);
      const normalized = {
        ...clone(panel), sourceId,
        metricKey: text(panel.metricKey || panel.key) || 'unknown',
        ...resolveReportCurrency({ ...panel, metricKey: text(panel.metricKey || panel.key), unit: unitOf(panel.unit) }, currency),
        platform: platformOf(panel.platform ?? data.platform), scope: scopeOf(panel.scope),
        contextKey: contextOf(panel.contextKey || data.contextKey, sourceId),
        period: inherited ? declaredPeriod : visiblePeriod,
        periodProvenance: inherited ? 'REPORT_DECLARED' : panel.periodProvenance || (fullPeriod(visiblePeriod) ? 'SOURCE_VISIBLE' : 'UNKNOWN'),
        dataset: Array.isArray(panel.dataset) ? clone(panel.dataset) : [],
      };
      normalized.panelId = panel.panelId || `${sourceId}:panel-${panel.id || hash(normalized)}`;
      validateSummaryMetric(normalized, issues);
      normalizePanelReferences(normalized, sourceObservations, issues);
      if (normalized.dataset.length) validateObservation({ ...normalized, key: normalized.metricKey, label: normalized.title || normalized.metricKey, value: 1, rawValue: null }, declaredPeriod, issues);
      panels.push(normalized);
    }
  }
  const ordered = sortStable(observations);
  const active = ordered.filter(item => !item.excluded);
  const identities = new Map();
  for (const item of active) {
    const previous = identities.get(item.observationId);
    if (previous && canonical(previous) !== canonical(item)) issues.push(makeIssue('OBSERVATION_ID_CONFLICT', 'Dos observaciones diferentes comparten la misma identidad de origen.', [previous, item], true));
    identities.set(item.observationId, item);
  }
  const grouped = new Map();
  for (const item of reconcileContexts(active)) {
    validateObservation(item, declaredPeriod, issues);
    const signature = factSignature(item);
    if (!grouped.has(signature)) grouped.set(signature, []);
    grouped.get(signature).push(item);
  }
  const facts = sortStable([...grouped.values()].map(items => consolidate(items, issues)));
  validateBreakdowns(active, issues);
  const uniqueIssues = sortStable(groupRepeatedIssues([...new Map(issues.map(item => [item.id, item])).values()]));
  return {
    schemaVersion: 2, currency: currency || REPORT_DEFAULT_CURRENCY, observations: ordered, facts, panels: sortStable(panels), issues: uniqueIssues,
    readyForNarrative: facts.some(item => item.value !== null) && !uniqueIssues.some(item => item.blocking),
  };
}
