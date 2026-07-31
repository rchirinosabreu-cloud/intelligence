const PERIOD_KINDS = new Set(['MONTHLY', 'QUARTERLY']);
const SOURCE_PLATFORMS = new Set(['META_ADS', 'ORGANIC_RRSS']);

const requireString = (value, field) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} is required`);
  }
  return value;
};

const parseDate = (value, field) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${field} must be a valid date`);
  }
  return date;
};

const toJsonValue = (value, field) => {
  try {
    const serialized = JSON.stringify(value ?? (Array.isArray(value) ? [] : {}));
    if (serialized === undefined) throw new TypeError();
    return JSON.parse(serialized);
  } catch {
    throw new TypeError(`${field} must be JSON serializable`);
  }
};

const normalizeSource = (source, index) => {
  const prefix = `sources[${index}]`;
  const confidence = Number(source?.confidence);
  if (!Number.isFinite(confidence)) {
    throw new TypeError(`${prefix}.confidence must be a finite number`);
  }

  return {
    sourceId: requireString(source?.sourceId, `${prefix}.sourceId`),
    storagePath: requireString(source?.storagePath, `${prefix}.storagePath`),
    platform: SOURCE_PLATFORMS.has(source?.platform) ? source.platform : 'META_ADS',
    screenType: requireString(source?.screenType, `${prefix}.screenType`),
    extractionData: toJsonValue(source?.extractionData, `${prefix}.extractionData`),
    confidence,
    warnings: toJsonValue(source?.warnings ?? [], `${prefix}.warnings`),
  };
};

export const buildMetricReportCreateData = (input = {}) => {
  const clientId = requireString(input.clientId, 'clientId');
  const startDate = parseDate(input.startDate, 'startDate');
  const endDate = parseDate(input.endDate, 'endDate');

  if (startDate > endDate) {
    throw new TypeError('startDate must be before or equal to endDate');
  }

  return {
    clientId,
    periodKind: PERIOD_KINDS.has(input.periodKind) ? input.periodKind : 'MONTHLY',
    startDate,
    endDate,
    status: 'DRAFT',
    normalizedMetrics: toJsonValue(input.normalizedMetrics, 'normalizedMetrics'),
    narrative: toJsonValue(input.narrative, 'narrative'),
    sections: toJsonValue(input.sections ?? [], 'sections'),
    sources: {
      create: (input.sources ?? []).map(normalizeSource),
    },
  };
};
