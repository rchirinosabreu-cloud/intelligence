// One readable line for the technical cause of a failed review attempt.
// Shared by the review panel and any future operational health view.
const formatMoment = value => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(date);
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
