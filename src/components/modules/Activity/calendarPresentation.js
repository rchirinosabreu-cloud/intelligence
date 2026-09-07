export const getDayEventDisplay = (events = [], expanded = false, limit = 4) => ({
  visible: expanded ? events : events.slice(0, limit),
  overflow: expanded ? 0 : Math.max(0, events.length - limit)
});

export const summarizeGoogleSyncResults = (results = []) => results.reduce((summary, result) => ({
  imported: summary.imported + (result.imported || 0),
  updated: summary.updated + (result.updated || 0),
  skipped: summary.skipped + (result.skipped || 0),
  failed: summary.failed + Math.max(Number(result.failed) || 0, result.connected === false || result.error ? 1 : 0)
}), { imported: 0, updated: 0, skipped: 0, failed: 0 });

export const getGoogleConnectionHealth = (connection, now = new Date()) => {
  if (connection.reconnectRequired || connection.isActive === false) return { status: 'reconnect', label: 'Reconectar cuenta' };
  if ((connection.errorCount || 0) > 0) return { status: 'error', label: 'Con errores' };
  if ((connection.pendingCount || 0) > 0) return { status: 'pending', label: 'Sincronización pendiente' };
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
  const left = Math.min(Math.max(rect.left, margin), Math.max(margin, viewport.width - dimensions.width - margin));
  const fitsBelow = rect.bottom + gap + dimensions.height <= viewport.height - margin;
  return { left, top: fitsBelow ? rect.bottom + gap : Math.max(margin, rect.top - dimensions.height - gap), placement: fitsBelow ? 'bottom' : 'top' };
};

export const explainGoogleSyncError = (error = '', syncStatus = '') => {
  const normalized = String(error).toLowerCase();
  if (['PENDING', 'PENDING_DELETE'].includes(syncStatus) || normalized.includes('pendiente de confirmación')) {
    return 'La confirmación de Google todavía no llegó. El cambio permanece guardado para reintentarlo sin duplicar el evento.';
  }
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

export const formatActivityEventSchedule = (event = {}) => {
  const start = event.startAt ? new Date(event.startAt) : null;
  const end = event.endAt ? new Date(event.endAt) : null;
  if (!start || !Number.isFinite(start.getTime())) return 'Horario no disponible';
  const validEnd = end && Number.isFinite(end.getTime()) && end > start;
  const dateLabel = date => new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', day: 'numeric', month: 'short'
  }).format(date);
  const dayKey = date => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
  const timeLabel = date => new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(date);
  if (event.isAllDay) {
    const lastDay = validEnd ? new Date(end.getTime() - 1) : start;
    return `Todo el día · ${dateLabel(start)}${dayKey(start) !== dayKey(lastDay) ? ` – ${dateLabel(lastDay)}` : ''}`;
  }
  const recurring = event.recurrence === 'WEEKLY';
  return `${recurring ? 'Semanal' : dateLabel(start)} · ${timeLabel(start)}${validEnd
    ? ` – ${!recurring && dayKey(start) !== dayKey(end) ? `${dateLabel(end)}, ` : ''}${timeLabel(end)}` : ''}`;
};

export const getExternalAttendeeEmails = (attendeeEmails = [], teamMembers = []) => {
  const internalEmails = new Set(teamMembers.map(member => member.email?.trim().toLowerCase()).filter(Boolean));
  return [...new Set(attendeeEmails
    .map(email => email?.trim().toLowerCase())
    .filter(email => email && email !== 'fred@fireflies.ai' && !internalEmails.has(email)))];
};

const padDatePart = value => String(value).padStart(2, '0');

export const toBogotaCalendarFormValue = value => {
  if (value == null || !Number.isFinite(new Date(value).getTime())) return { date: null, time: '' };
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value)).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return {
    // DatePicker holds only a calendar day. Noon avoids local DST gaps at midnight.
    date: new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12, 0, 0, 0),
    time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
  };
};

export const combineBogotaDateAndTime = (date, time = '00:00') => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()) || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return null;
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}T${time.length === 5 ? `${time}:00` : time}-05:00`;
};

export const parseCalendarDateInput = value => {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match.map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
};

export const parseCalendarDateTimeInput = (value, isAllDay = false) => {
  if (isAllDay) {
    const date = parseCalendarDateInput(value);
    return date ? { date, time: '' } : null;
  }
  const match = String(value || '').match(/^(\d{2}\/\d{2}\/\d{4}) ((?:[01]\d|2[0-3]):[0-5]\d)$/);
  const date = match && parseCalendarDateInput(match[1]);
  return date ? { date, time: match[2] } : null;
};

export const formatCalendarDateTimeInput = (date, time, isAllDay = false) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '';
  const day = `${padDatePart(date.getDate())}/${padDatePart(date.getMonth() + 1)}/${date.getFullYear()}`;
  return isAllDay ? day : `${day} ${time || ''}`;
};

export const toBogotaCalendarDate = value => toBogotaCalendarFormValue(value).date;

export const formatBogotaClock = value => toBogotaCalendarFormValue(value).time || 'Hora no disponible';

export const getBogotaCalendarFormRange = (start, end) => {
  const first = toBogotaCalendarFormValue(start);
  const last = toBogotaCalendarFormValue(end);
  return { startAt: first.date, startTime: first.time, endAt: last.date, endTime: last.time };
};

export const getInitialBogotaCalendarRange = (baseDate, now = new Date()) => {
  const rounded = new Date(Math.ceil(now.getTime() / (15 * 60 * 1000)) * 15 * 60 * 1000);
  const first = toBogotaCalendarFormValue(rounded);
  const date = new Date(baseDate || first.date);
  date.setHours(12, 0, 0, 0);
  if (baseDate && first.time === '00:00' && formatBogotaClock(now).startsWith('23:')) date.setDate(date.getDate() + 1);
  const start = combineBogotaDateAndTime(date, first.time);
  return getBogotaCalendarFormRange(start, new Date(new Date(start).getTime() + 60 * 60 * 1000));
};

export const moveBogotaCalendarStart = (form, date, time = form.startTime) => {
  const start = combineBogotaDateAndTime(date, form.isAllDay ? '00:00' : time);
  const previousStart = combineBogotaDateAndTime(form.startAt, form.isAllDay ? '00:00' : form.startTime);
  const previousEnd = combineBogotaDateAndTime(form.endAt, form.isAllDay ? '00:00' : form.endTime);
  const duration = previousStart && previousEnd
    ? Math.max(new Date(previousEnd) - new Date(previousStart), form.isAllDay ? 86400000 : 900000)
    : form.isAllDay ? 86400000 : 3600000;
  return getBogotaCalendarFormRange(start, new Date(new Date(start).getTime() + duration));
};

export const serializeBogotaCalendarEventDates = (form, original = null) => {
  const serialize = (dateField, timeField) => {
    const value = combineBogotaDateAndTime(form[dateField], form.isAllDay ? '00:00' : form[timeField]);
    const previous = original?.[dateField];
    if (!previous || Boolean(original.isAllDay) !== Boolean(form.isAllDay)) return value;
    const previousFields = toBogotaCalendarFormValue(previous);
    const previousValue = combineBogotaDateAndTime(previousFields.date, form.isAllDay ? '00:00' : previousFields.time);
    return value === previousValue ? previous : value;
  };
  let recurrenceEnd = form.recurrence === 'WEEKLY' ? getCalendarRecurrenceEnd(form.recurrenceEnd) : null;
  if (recurrenceEnd && original?.recurrence === form.recurrence && original.recurrenceEnd &&
      combineBogotaDateAndTime(form.recurrenceEnd) === combineBogotaDateAndTime(toBogotaCalendarDate(original.recurrenceEnd))) {
    recurrenceEnd = original.recurrenceEnd;
  }
  return { startAt: serialize('startAt', 'startTime'), endAt: serialize('endAt', 'endTime'), recurrenceEnd };
};

export const getCalendarStartValidationError = (form, original = null, now = new Date()) => {
  const startAt = serializeBogotaCalendarEventDates(form, original).startAt;
  if (!startAt) return '';
  if (original?.startAt && new Date(startAt).getTime() === new Date(original.startAt).getTime() &&
      Boolean(form.isAllDay) === Boolean(original.isAllDay)) return '';
  if (form.isAllDay) {
    return combineBogotaDateAndTime(form.startAt) < combineBogotaDateAndTime(toBogotaCalendarDate(now))
      ? 'No puedes elegir una fecha y hora que ya pasó' : '';
  }
  return new Date(startAt) < now ? 'No puedes elegir una fecha y hora que ya pasó' : '';
};

export const toBogotaDatePickerValue = value => {
  if (value == null || !Number.isFinite(new Date(value).getTime())) return null;
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

export const getRoundedBogotaNow = (baseDate, now = new Date()) => {
  const bogotaNow = toBogotaDatePickerValue(now);
  const start = new Date(baseDate || bogotaNow);
  start.setHours(bogotaNow.getHours(), Math.ceil(bogotaNow.getMinutes() / 15) * 15, 0, 0);
  return start;
};

export const getCalendarEventBounds = event => {
  const eventStart = toBogotaCalendarDate(event.startAt);
  const exclusiveEnd = toBogotaCalendarDate(event.endAt);
  if (!eventStart || !exclusiveEnd || new Date(event.endAt) <= new Date(event.startAt)) return null;
  // Google uses an exclusive end for timed and all-day events alike.
  const finalDay = toBogotaCalendarDate(new Date(new Date(event.endAt).getTime() - 1));
  finalDay.setHours(0, 0, 0, 0);
  return { eventStart, exclusiveEnd, finalDay };
};

export const getCalendarRecurrenceEnd = value => {
  return value ? combineBogotaDateAndTime(value, '23:59:59') : null;
};

export const createCalendarRequestIdentity = (generateId = () => crypto.randomUUID()) => {
  let fingerprint;
  let requestId;
  return {
    forPayload(payload) {
      const nextFingerprint = JSON.stringify(payload);
      if (fingerprint !== nextFingerprint) {
        requestId = generateId();
        fingerprint = nextFingerprint;
      }
      return requestId;
    },
    reset() {
      fingerprint = undefined;
      requestId = undefined;
    }
  };
};

export const getCalendarSaveFeedback = (event, editing = false) => event?.googleSyncStatus === 'SYNCED'
  ? { success: true, message: `Evento ${editing ? 'actualizado' : 'creado'} y sincronizado con Google Calendar` }
  : { success: false, message: 'Evento guardado. La sincronización con Google Calendar sigue pendiente.' };

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

