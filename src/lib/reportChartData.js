const isNonZero = (value) => Number.isFinite(value) && value !== 0;

const parseChartNumber = (value) => {
  if (typeof value === 'number') return Number.isSafeInteger(value) || Math.abs(value) < Number.MAX_SAFE_INTEGER
    ? Number(value.toFixed(4)) : null;
  if (typeof value !== 'string' || value.trim().length > 24) return null;
  const raw = value.trim().replace(/[^\d.,+-]/g, '');
  if (!raw) return null;
  let normalized = raw;
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) normalized = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  else if (comma >= 0) normalized = raw.split(',').at(-1).length === 3 ? raw.replace(/,/g, '') : raw.replace(',', '.');
  else if (dot >= 0 && raw.split('.').length === 2 && raw.split('.')[1].length === 3) normalized = raw.replace('.', '');
  const number = Number(normalized);
  return Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER ? Number(number.toFixed(4)) : null;
};

export const adaptDatasetForChart = (dataset, chartType) => {
  if (!Array.isArray(dataset)) return [];
  return dataset.flatMap((point) => {
    if (!point || typeof point !== 'object') return [];
    const label = typeof point.label === 'string' ? point.label.trim() : '';
    const preferred = ['value', 'results', 'impressions', 'reach', 'percentage']
      .map(key => parseChartNumber(point[key])).find(value => value !== null && value !== 0);
    const hombres = parseChartNumber(point.hombres);
    const mujeres = parseChartNumber(point.mujeres);
    if (!label || (preferred === undefined && !isNonZero(hombres) && !isNonZero(mujeres))) return [];
    const clean = { label };
    if (preferred !== undefined) clean.value = preferred;
    if (chartType === 'RANKING_TABLE') {
      for (const key of ['results', 'impressions', 'reach']) {
        const value = parseChartNumber(point[key]);
        if (value !== null && value !== 0) clean[key] = value;
      }
    }
    if (isNonZero(hombres)) clean.hombres = hombres;
    if (isNonZero(mujeres)) clean.mujeres = mujeres;
    return [clean];
  });
};

export const hasReadableChartData = (dataset) => adaptDatasetForChart(dataset).length > 0;
