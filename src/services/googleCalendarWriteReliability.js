import crypto from 'node:crypto';
import { googleCalendarRequestOptions } from './calendarSyncLock.js';

export const googleEventIdFor = id => `brain${crypto.createHash('sha256').update(String(id)).digest('hex')}`;
export const googleStatus = error => Number(error.response?.status || error.status || error.code) || 0;
export const isRetryableGoogleWriteError = error => {
  const status = googleStatus(error);
  const reasons = error.response?.data?.error?.errors || error.errors || [];
  return !status || status === 408 || status === 409 || status === 429 || status >= 500 ||
    (status === 403 && reasons.some(item => ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded'].includes(item.reason)));
};
export const nextGoogleRetryAt = (attempts = 0, now = Date.now()) =>
  new Date(now + Math.min(60 * 60 * 1000, 30000 * 2 ** Math.min(attempts, 7)) + Math.floor(Math.random() * 10000));

const timeKey = value => value?.date || (value?.dateTime ? new Date(value.dateTime).toISOString() : null);
export function googleEventMatchesPayload(remote, payload) {
  if (remote.status === 'cancelled') return false;
  const emails = values => (values || []).map(item => item.email?.toLowerCase()).filter(Boolean).sort();
  return remote.summary === payload.summary && (remote.description || '') === (payload.description || '') &&
    (remote.location || '') === (payload.location || '') && timeKey(remote.start) === timeKey(payload.start) &&
    timeKey(remote.end) === timeKey(payload.end) &&
    JSON.stringify(remote.recurrence || []) === JSON.stringify(payload.recurrence || []) &&
    JSON.stringify(emails(remote.attendees)) === JSON.stringify(emails(payload.attendees)) &&
    remote.extendedProperties?.private?.brainEventType === payload.extendedProperties?.private?.brainEventType;
}

export async function patchGoogleEventReliably(calendar, request, patchOptions) {
  const read = () => calendar.events.get({ calendarId: request.calendarId, eventId: request.eventId }, googleCalendarRequestOptions());
  const current = await read();
  if (googleEventMatchesPayload(current.data, request.requestBody)) return current;
  try { return await calendar.events.patch(request, googleCalendarRequestOptions(patchOptions)); }
  catch (error) {
    if (isRetryableGoogleWriteError(error) || googleStatus(error) === 412) {
      try { const recovered = await read(); if (googleEventMatchesPayload(recovered.data, request.requestBody)) return recovered; }
      catch { /* Preserve the write error; a failed read is not evidence of success. */ }
    }
    throw error;
  }
}

export async function insertGoogleEventReliably(calendar, request) {
  const readExisting = async () => {
    try {
      const result = await calendar.events.get({ calendarId: request.calendarId, eventId: request.requestBody.id }, googleCalendarRequestOptions());
      if (result.data.status === 'cancelled') throw Object.assign(new Error('El evento fue eliminado en Google; no se recreará automáticamente.'), { code: 410 });
      if (result.data.extendedProperties?.private?.brainOperationalEventId !== request.requestBody.extendedProperties.private.brainOperationalEventId) {
        throw Object.assign(new Error('El identificador de Google pertenece a otro evento.'), { code: 412 });
      }
      if (!googleEventMatchesPayload(result.data, request.requestBody)) {
        throw Object.assign(new Error('El evento recuperado de Google contiene cambios externos. Sincroniza y revisa su versión.'), { code: 412 });
      }
      return result;
    } catch (error) { if (googleStatus(error) === 404) return null; throw error; }
  };
  const existing = await readExisting();
  if (existing) return existing;
  try { return await calendar.events.insert(request, googleCalendarRequestOptions()); }
  catch (error) {
    if (isRetryableGoogleWriteError(error)) {
      try { const recovered = await readExisting(); if (recovered) return recovered; }
      catch (readError) { if ([410, 412].includes(googleStatus(readError))) throw readError; }
    }
    throw error;
  }
}
