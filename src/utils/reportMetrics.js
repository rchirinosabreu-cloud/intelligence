const COUNT_FORMATTER = new Intl.NumberFormat('es-CO', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const NUMBER_FORMATTER = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 1,
});

export const formatReportMetric = (metric, currency = 'COP') => {
  if (!metric || typeof metric.value !== 'number' || !Number.isFinite(metric.value)) return '—';

  if (metric.unit === 'CURRENCY') {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 0,
    }).format(metric.value);
  }

  if (metric.unit === 'PERCENT') {
    return new Intl.NumberFormat('es-CO', {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(metric.value / 100);
  }

  if (metric.unit === 'COUNT' && Math.abs(metric.value) >= 10000) {
    return COUNT_FORMATTER.format(metric.value).replace(/\s?k$/i, '\u00a0mil');
  }

  return NUMBER_FORMATTER.format(metric.value);
};

export const getRenderableTimeSeries = (series = []) => series.filter((item) => (
  Array.isArray(item.points)
  && item.points.length >= 2
  && item.points.every((point) => (
    typeof point.label === 'string'
    && typeof point.value === 'number'
    && Number.isFinite(point.value)
  ))
));
