// Telling "the provider could not serve us" apart from "this work failed".
// An outage must not spend the retry budget of a job: the work never got a
// real chance, and burning attempts against a wall loses minutes permanently.
const UNAVAILABLE_CODES = new Set([
  'credit_balance_exhausted',
  'insufficient_quota',
  'rate_limit_exceeded',
  'server_error',
  'OPENAI_TIMEOUT',
  'OPENAI_NOT_CONFIGURED',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT'
]);
const UNAVAILABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export const isProviderUnavailable = (error) => {
  if (!error || typeof error !== 'object') return false;
  if (UNAVAILABLE_CODES.has(error.code)) return true;
  const status = Number(error.status || error.response?.status);
  return Number.isFinite(status) && UNAVAILABLE_STATUSES.has(status);
};
