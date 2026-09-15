// Browser-safe display of already normalized evidence. Never parse OCR here:
// treating an absent value or a localized string as a number could invent data.
const numberFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 20 });
const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const displayNumber = (value) => numberFormat.format(Object.is(value, -0) ? 0 : value);

const unitSuffix = (unit) => {
  const normalized = String(unit ?? '').trim();
  if (!normalized || /^(count|number|integer|unknown|none)$/i.test(normalized)) return '';
  if (/^(percent|percentage|%)$/i.test(normalized)) return ' %';
  if (/^(currency|money)$/i.test(normalized)) return ' (moneda sin confirmar)';
  return ` ${normalized}`;
};

export const formatEvidenceValue = (fact = {}) => {
  if (!finiteNumber(fact.value)) return 'No disponible';
  const unit = String(fact.unit ?? '').trim();
  if (fact.precision === 'ROUNDED') {
    const raw = typeof fact.rawValue === 'string' && fact.rawValue.trim();
    return `≈ ${raw || `${displayNumber(fact.value)}${unitSuffix(unit)}`}`;
  }
  if (/^(seconds?|s)$/i.test(unit) && fact.value >= 0) {
    const hours = Math.floor(fact.value / 3600);
    const minutes = Math.floor((fact.value % 3600) / 60);
    const seconds = fact.value % 60;
    return [hours ? `${displayNumber(hours)} h` : '', minutes ? `${displayNumber(minutes)} min` : '', seconds || (!hours && !minutes) ? `${displayNumber(seconds)} s` : ''].filter(Boolean).join(' ');
  }
  return `${displayNumber(fact.value)}${unitSuffix(unit)}`;
};

export const formatEvidenceChangePct = (value) => finiteNumber(value)
  ? `${value > 0 ? '+' : ''}${displayNumber(value)} %`
  : 'Sin comparación';
