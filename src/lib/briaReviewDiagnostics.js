// One readable line for the technical cause of a failed review attempt.
// Shared by the review panel and any future operational health view.
const formatMoment = value => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(date);
};

// Production replaces the text of 5xx responses with a stable code such as
// INTERNAL_SERVER_ERROR. A code is not an explanation: show the fallback instead.
const CODE_LIKE = /^[A-Z][A-Z0-9_]{2,79}$/;
export const humanizeReviewRequestError = (payload, fallback) => {
  const text = typeof payload?.error === 'string' ? payload.error.trim() : '';
  if (!text || CODE_LIKE.test(text)) return fallback;
  return text;
};

export const formatReviewDiagnostic = (diagnostic, { maxAttempts = 3 } = {}) => {
  if (!diagnostic || typeof diagnostic !== 'object') return '';
  const attempt = Number.isFinite(Number(diagnostic.attempt)) ? Number(diagnostic.attempt) : null;
  const when = formatMoment(diagnostic.at);
  const head = `Intento ${attempt ?? '?'}${maxAttempts ? ` de ${maxAttempts}` : ''}${when ? ` (${when})` : ''}`;
  const cause = [diagnostic.code, diagnostic.status ? `HTTP ${diagnostic.status}` : null].filter(Boolean).join(' · ');
  const message = String(diagnostic.message || '').trim();
  const tail = [cause, message].filter(Boolean).join('. ');
  return tail ? `${head}: ${tail}` : head;
};
