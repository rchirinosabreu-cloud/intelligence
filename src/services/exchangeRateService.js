import { safeFetchText } from '../config/security.js';

const OFFICIAL_TRM_ENDPOINT = 'https://www.datos.gov.co/resource/ceyp-9c7c.json?$select=valor,vigenciadesde,vigenciahasta&$order=vigenciadesde%20DESC&$limit=1';

const parseRateValue = (value) => {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  const rate = Number(normalized);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('La fuente oficial no devolvio una TRM valida');
  }
  return rate;
};
export const parseOfficialTrmResponse = (rawText) => {
  let rows;
  try {
    rows = JSON.parse(rawText);
  } catch {
    throw new Error('La fuente oficial devolvio una respuesta invalida');
  }

  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.vigenciadesde) {
    throw new Error('La fuente oficial no devolvio una vigencia para la TRM');
  }

  return {
    rate: parseRateValue(row.valor),
    source: 'SUPERFINANCIERA_TRM',
    validFrom: row.vigenciadesde,
    validTo: row.vigenciahasta || row.vigenciadesde
  };
};

export const fetchOfficialUsdCopRate = async ({ fetchText = safeFetchText } = {}) => {
  const response = await fetchText(OFFICIAL_TRM_ENDPOINT, {
    headers: { Accept: 'application/json' },
    maxBytes: 64 * 1024,
    maxRedirects: 1,
    timeoutMs: 8_000
  });

  return parseOfficialTrmResponse(response.text);
};
