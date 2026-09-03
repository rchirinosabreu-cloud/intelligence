export const getDayEventDisplay = (events = [], expanded = false, limit = 4) => ({
  visible: expanded ? events : events.slice(0, limit),
  overflow: expanded ? 0 : Math.max(0, events.length - limit)
});

export const summarizeGoogleSyncResults = (results = []) => results.reduce((summary, result) => ({
  imported: summary.imported + (result.imported || 0),
  updated: summary.updated + (result.updated || 0),
  skipped: summary.skipped + (result.skipped || 0),
  failed: summary.failed + (result.connected === false ? 1 : 0)
}), { imported: 0, updated: 0, skipped: 0, failed: 0 });

export const getGoogleConnectionHealth = (connection, now = new Date()) => {
  if ((connection.errorCount || 0) > 0) return { status: 'error', label: 'Con errores' };
  const syncedAt = connection.lastSyncedAt ? new Date(connection.lastSyncedAt).getTime() : 0;
  const channelExpiresAt = connection.channelExpiresAt ? new Date(connection.channelExpiresAt).getTime() : 0;
  if (!syncedAt || now.getTime() - syncedAt > 5 * 60 * 1000 || channelExpiresAt <= now.getTime()) {
    return { status: 'delayed', label: 'Actualizacion retrasada' };
  }
  return { status: 'healthy', label: 'Actualizado' };
};

export const getCalendarPopoverPosition = (rect, viewport, dimensions = { width: 300, height: 200 }) => {
  const gap = 8;
  const margin = 16;
  const left = Math.min(Math.max(rect.left, margin), viewport.width - dimensions.width - margin);
  const fitsBelow = rect.bottom + gap + dimensions.height <= viewport.height - margin;
  return { left, top: fitsBelow ? rect.bottom + gap : Math.max(margin, rect.top - dimensions.height - gap), placement: fitsBelow ? 'bottom' : 'top' };
};

export const explainGoogleSyncError = (error = '') => {
  const normalized = String(error).toLowerCase();
  if (normalized.includes('timerangeempty') || normalized.includes('specified time range is empty') || normalized.includes('"timemax"')) {
    return 'El evento no tiene un rango de tiempo válido para Google Calendar. Es histórico y su hora de finalización está vacía o no es posterior al inicio. Esto no afecta la sincronización de los demás eventos.';
  }
  if (normalized.includes('insufficient permission') || normalized.includes('insufficientpermissions') || normalized.includes('forbidden')) {
    return 'La cuenta conectada no tiene permisos suficientes para sincronizar este evento. Puedes reintentar después de revisar la conexión con Google.';
  }
  return 'Google rechazó la sincronización de este evento. Puedes reintentarlo; si vuelve a fallar, los detalles técnicos permiten identificar la causa.';
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const addExternalEmailTags = (currentEmails = [], rawValue = '') => {
  const candidates = rawValue
    .split(/[;,\n]/)
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
  const valid = candidates.filter(email => EMAIL_PATTERN.test(email));

  return {
    emails: [...new Set([...currentEmails.map(email => email.toLowerCase()), ...valid])],
    invalid: candidates.filter(email => !EMAIL_PATTERN.test(email))
  };
};

export const getExternalAttendeeEmails = (attendeeEmails = [], teamMembers = []) => {
  const internalEmails = new Set(teamMembers.map(member => member.email?.trim().toLowerCase()).filter(Boolean));
  return [...new Set(attendeeEmails
    .map(email => email?.trim().toLowerCase())
    .filter(email => email && email !== 'fred@fireflies.ai' && !internalEmails.has(email)))];
};

const padDatePart = value => String(value).padStart(2, '0');

export const toBogotaDatePickerValue = value => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(value)).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
    return result;
  }, {});
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second, 0);
};

export const fromBogotaDatePickerValue = value => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return null;
  return `${value.getFullYear()}-${padDatePart(value.getMonth() + 1)}-${padDatePart(value.getDate())}T${padDatePart(value.getHours())}:${padDatePart(value.getMinutes())}:${padDatePart(value.getSeconds())}-05:00`;
};

export const normalizeCalendarDescription = (description = '') => description
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\n{3,}/g, '\n\n')
  .trim();

