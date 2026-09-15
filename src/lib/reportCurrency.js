export const REPORT_DEFAULT_CURRENCY = 'COP';
const monetaryKeys = new Set(['spend', 'costPerResult', 'cpc', 'cpm', 'revenue', 'budget']);
const ambiguousUnits = new Set(['', '$', '$UNKNOWN', 'UNKNOWN', 'CURRENCY', 'MONEY', 'COUNT']);

// Currency is a report convention, never a conversion or an OCR assertion.
// Explicit currencies in the source (or a human correction) always survive.
export function resolveReportCurrency(item, currency) {
  const unit = String(item.unit ?? '').trim();
  const provenance = item.currencyProvenance ? {
    originalUnit: item.originalUnit, currencyProvenance: item.currencyProvenance,
  } : {};
  if (!monetaryKeys.has(item.key || item.metricKey) || !ambiguousUnits.has(unit.toUpperCase())) return { unit, ...provenance };
  const visible = String(item.rawValue ?? '').match(/\b(?:COP|USD|EUR|GBP|MXN|ARS|CLP|PEN|BRL|CAD|AUD)\b/i)?.[0]?.toUpperCase();
  if (visible) return { unit: visible, originalUnit: item.originalUnit ?? unit, currencyProvenance: 'SOURCE_VISIBLE' };
  return { unit: currency || REPORT_DEFAULT_CURRENCY, originalUnit: item.originalUnit ?? unit,
    currencyProvenance: currency ? 'REPORT_DECLARED' : 'AGENCY_DEFAULT' };
}
