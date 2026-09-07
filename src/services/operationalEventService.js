import prisma from '../lib/prisma.js';
import { google } from 'googleapis';
import {
  getAuthorizedGoogleOAuthClient,
  getGoogleCalendarConnections,
  getPendingGoogleCalendarWhere,
  CENTRAL_GOOGLE_CALENDAR_EMAIL,
  isGoogleOAuthReauthError,
  markGoogleCalendarReauthRequired
} from './googleCalendarOAuthService.js';
import crypto from 'crypto';
import rrule from 'rrule';
import { withCalendarSyncLock, assertCalendarSyncLock, googleCalendarRequestOptions } from './calendarSyncLock.js';
import { googleEventIdFor, googleStatus, insertGoogleEventReliably, patchGoogleEventReliably, isRetryableGoogleWriteError, nextGoogleRetryAt } from './googleCalendarWriteReliability.js';

const FIREFLIES_BOT_EMAIL = 'fred@fireflies.ai';
const OPERATIONAL_EVENT_TYPES = new Set(['PRODUCTION', 'PROJECT', 'MEETING', 'ABSENCE', 'BREAK']);
const OPERATIONAL_RECURRENCES = new Set(['NONE', 'WEEKLY', 'GOOGLE']);

const createOperationalEventError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const getGoogleErrorDetails = (error) => {
  const data = error.response?.data || error.errors || error.message || error;
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return error.message || 'Unknown Google Calendar error';
  }
};

const isGoogleEventAlreadyDeleted = (error) => {
  const status = googleStatus(error);
  const errors = error.response?.data?.error?.errors || error.errors || [];
  return status === 404 || status === 410 || errors.some(item => item.reason === 'deleted');
};

const isExpiredGoogleSyncTokenError = (error) => {
  const status = googleStatus(error);
  const errors = error.response?.data?.error?.errors || error.errors || [];
  return status === 410 || errors.some(item => item.reason === 'fullSyncRequired');
};

export async function listAllGoogleEventPages(calendar, request) {
  const items = [];
  let pageToken;
  let nextSyncToken;
  const seenPages = new Set();

  try {
    do {
      if (pageToken && seenPages.has(pageToken)) throw new Error('Google devolvió una página de eventos repetida');
      if (pageToken) seenPages.add(pageToken);
      const response = await calendar.events.list({ ...request, ...(pageToken ? { pageToken } : {}) }, googleCalendarRequestOptions());
      items.push(...(response.data.items || []));
      pageToken = response.data.nextPageToken;
      if (!pageToken) nextSyncToken = response.data.nextSyncToken || null;
    } while (pageToken);
  } catch (error) {
    if (request.syncToken && isExpiredGoogleSyncTokenError(error)) {
      const expiredError = new Error('El token incremental de Google Calendar venció');
      expiredError.code = 'GOOGLE_SYNC_TOKEN_EXPIRED';
      expiredError.cause = error;
      throw expiredError;
    }
    throw error;
  }

  return { items, nextSyncToken };
}

const normalizeAttendeeEmails = async (memberIds = [], externalEmails = [], db = prisma) => {
  const members = memberIds.length
    ? await db.teamMember.findMany({ where: { id: { in: memberIds } }, select: { email: true } })
    : [];
  return [...new Set([...externalEmails, ...members.map(member => member.email)]
    .map(email => email?.trim().toLowerCase())
    .filter(email => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
};

export const normalizeOperationalEventRange = (data = {}, current = {}) => {
  const explicitTime = value => {
    if (value instanceof Date) return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    const dayCheck = new Date(Date.UTC(year, month - 1, day));
    return dayCheck.getUTCFullYear() === year && dayCheck.getUTCMonth() === month - 1 && dayCheck.getUTCDate() === day && Number(value.slice(11, 13)) < 24;
  };
  if (!explicitTime(data.startAt ?? current.startAt) || !explicitTime(data.endAt ?? current.endAt)) {
    throw createOperationalEventError('INVALID_EVENT_RANGE', 'Indica la fecha completa, incluido el año, y una hora con zona horaria.');
  }
  const startAt = new Date(data.startAt ?? current.startAt);
  const endAt = new Date(data.endAt ?? current.endAt);

  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
    const error = new Error('La fecha y hora de finalización deben ser posteriores al inicio.');
    error.code = 'INVALID_EVENT_RANGE';
    throw error;
  }

  return { startAt, endAt };
};

export const validateOperationalEventSchedule = (data, current = null, now = new Date()) => {
  const { startAt } = normalizeOperationalEventRange(data, current || {});
  const isAllDay = Boolean(data.isAllDay ?? current?.isAllDay);
  // Existing history remains editable without changing its original schedule.
  if (current && startAt.getTime() === new Date(current.startAt).getTime() && isAllDay === Boolean(current.isAllDay)) return;
  const bogotaDay = value => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
  };
  const isPast = isAllDay ? bogotaDay(startAt) < bogotaDay(now) : startAt.getTime() < now.getTime();
  if (isPast) throw createOperationalEventError('INVALID_EVENT_PAST', 'No puedes elegir una fecha y hora que ya pasó');
};

export const getGooglePatchOptions = (target, fallback = null) => (target?.googleEtag || fallback?.googleEtag)
  ? { headers: { 'If-Match': target?.googleEtag || fallback.googleEtag } }
  : undefined;

export const classifyGoogleCalendarSyncError = error => {
  const status = googleStatus(error);
  if (status === 412) return 'GOOGLE_CALENDAR_CONFLICT';
  if (isGoogleOAuthReauthError(error)) return 'GOOGLE_CALENDAR_REAUTH_REQUIRED';
  const details = getGoogleErrorDetails(error);
  if (/invalid (?:start|end) time|timeRangeEmpty/i.test(details)) return 'INVALID_GOOGLE_EVENT_TIME';
  return null;
};

export const validateOperationalEventInput = (data = {}, current = {}) => {
  const title = data.title ?? current.title;
  const type = data.type ?? current.type;
  const recurrence = data.recurrence ?? current.recurrence ?? 'NONE';
  const range = normalizeOperationalEventRange(data, current);

  if (!String(title || '').trim()) {
    throw createOperationalEventError('INVALID_EVENT_TITLE', 'El evento debe tener un título.');
  }
  if (!OPERATIONAL_EVENT_TYPES.has(type)) {
    throw createOperationalEventError('INVALID_EVENT_TYPE', 'El tipo de evento no es válido.');
  }
  if (!OPERATIONAL_RECURRENCES.has(recurrence)) {
    throw createOperationalEventError('INVALID_EVENT_RECURRENCE', 'La recurrencia del evento no es válida.');
  }
  if (data.memberIds !== undefined && !Array.isArray(data.memberIds)) {
    throw createOperationalEventError('INVALID_EVENT_ATTENDEES', 'El equipo involucrado no es válido.');
  }
  if (data.attendeeEmails !== undefined && !Array.isArray(data.attendeeEmails)) {
    throw createOperationalEventError('INVALID_EVENT_ATTENDEES', 'Los invitados externos no son válidos.');
  }

  const recurrenceEndValue = data.recurrenceEnd ?? current.recurrenceEnd;
  if (recurrence === 'WEEKLY' && recurrenceEndValue) {
    const recurrenceEnd = new Date(recurrenceEndValue);
    if (!Number.isFinite(recurrenceEnd.getTime()) || recurrenceEnd < range.startAt) {
      throw createOperationalEventError('INVALID_EVENT_RECURRENCE', 'La recurrencia no puede terminar antes de que comience el evento.');
    }
  }

  return { ...range, title: String(title).trim(), type, recurrence };
};

const formatGoogleDateTimeInBogota = (value) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(value)).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}-05:00`;
};

export const getMeetLinkFromGoogleEvent = (event) => {
  if (event.hangoutLink) return event.hangoutLink;
  const videoEntry = event.conferenceData?.entryPoints?.find(entry => entry.entryPointType === 'video');
  if (videoEntry?.uri) return videoEntry.uri;
  const fallbackText = [event.location, event.description].filter(Boolean).join('\n');
  return fallbackText.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i)?.[0] || null;
};

export const mapGoogleEventType = (event) => {
  const explicitType = event.extendedProperties?.private?.brainEventType;
  if (OPERATIONAL_EVENT_TYPES.has(explicitType)) return explicitType;
  if (event.eventType === 'outOfOffice') return 'ABSENCE';
  if (event.eventType === 'focusTime' || event.eventType === 'workingLocation') return 'PROJECT';
  const summary = (event.summary || '').toLowerCase();
  if (getMeetLinkFromGoogleEvent(event) || summary.includes('meet') || summary.includes('reuni')) return 'MEETING';
  if (summary.includes('permiso') || summary.includes('ausencia')) return 'ABSENCE';
  if (summary.includes('producci')) return 'PRODUCTION';
  if (summary.includes('descanso') || summary.includes('cafe') || summary.includes('café')) return 'BREAK';
  return 'PROJECT';
};

export const mapGoogleEventDates = (event) => {
  const isAllDay = Boolean(event.start?.date && event.end?.date);
  return {
    isAllDay,
    startAt: new Date(event.start?.dateTime || `${event.start?.date}T00:00:00.000-05:00`),
    endAt: new Date(event.end?.dateTime || `${event.end?.date}T00:00:00.000-05:00`)
  };
};

const isAllDayRange = (event) => Boolean(event.isAllDay);

const decodeGoogleDescription = (value) => {
  if (!value) return null;
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim() || null;
};

export const getGoogleRecurrenceData = (event) => {
  const googleRecurrence = Array.isArray(event.recurrence) ? event.recurrence : [];
  const rule = (event.recurrence || []).find(item => item.startsWith('RRULE:'));
  if (!rule) return { recurrence: googleRecurrence.length ? 'GOOGLE' : 'NONE', recurrenceEnd: null, googleRecurrence };
  const until = rule.match(/(?:^|;)UNTIL=([^;]+)/)?.[1];
  const recurrenceEnd = until && /^\d{8}T\d{6}Z$/.test(until)
    ? new Date(`${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}T${until.slice(9, 11)}:${until.slice(11, 13)}:${until.slice(13, 15)}Z`)
    : null;
  const isSimpleWeekly = googleRecurrence.length === 1 && /^RRULE:FREQ=WEEKLY(?:;UNTIL=\d{8}T\d{6}Z)?$/.test(rule);
  return {
    recurrence: isSimpleWeekly ? 'WEEKLY' : 'GOOGLE',
    recurrenceEnd,
    googleRecurrence
  };
};

export const resolveGoogleMemberIds = (attendees = [], teamMembers = []) => {
  const attendeeEmails = new Set(attendees.map(attendee => attendee.email?.trim().toLowerCase()).filter(Boolean));
  return teamMembers
    .filter(member => attendeeEmails.has(member.email?.trim().toLowerCase()))
    .map(member => member.id);
};

const toOperationalEventDataFromGoogle = (event, calendarId, connectionId, teamMembers = []) => ({
  title: event.summary || 'Evento de Google Calendar',
  type: mapGoogleEventType(event),
  description: decodeGoogleDescription(event.description),
  startAt: mapGoogleEventDates(event).startAt,
  endAt: mapGoogleEventDates(event).endAt,
  isAllDay: mapGoogleEventDates(event).isAllDay,
  captureWithFireflies: (event.attendees || []).some(attendee => attendee.email?.toLowerCase() === FIREFLIES_BOT_EMAIL),
  memberIds: resolveGoogleMemberIds(event.attendees || [], teamMembers),
  ...getGoogleRecurrenceData(event),
  meetingLink: getMeetLinkFromGoogleEvent(event),
  source: 'GOOGLE',
  organizerEmail: event.organizer?.email || null,
  attendeeEmails: (event.attendees || []).map(attendee => attendee.email).filter(Boolean),
  attendeeResponses: Object.fromEntries((event.attendees || []).filter(attendee => attendee.email).map(attendee => [attendee.email, attendee.responseStatus || 'needsAction'])),
  googleConnectionId: connectionId,
  googleCalendarId: calendarId,
  googleEventId: event.id,
  googleICalUID: event.iCalUID,
  googleEtag: event.etag,
  googleHtmlLink: event.htmlLink,
  googleUpdatedAt: event.updated ? new Date(event.updated) : null,
  googleLastSyncedAt: new Date(),
  googleSyncStatus: 'SYNCED',
  googleSyncError: null
});

export const buildGoogleRecurrence = (event) => {
  if (event.recurrence === 'GOOGLE') {
    return Array.isArray(event.googleRecurrence) && event.googleRecurrence.length ? event.googleRecurrence : undefined;
  }
  if (event.recurrence !== 'WEEKLY') return undefined;
  const until = event.recurrenceEnd
    ? new Date(event.recurrenceEnd).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    : null;
  return [`RRULE:FREQ=WEEKLY${until ? `;UNTIL=${until}` : ''}`];
};

const formatGoogleAllDayDate = value => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(value));
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const stripManagedMeetLine = value => String(value || '')
  .replace(/^Google Meet:\s*https:\/\/meet\.google\.com\/[a-z0-9-]+\s*$/gim, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export const buildGoogleEventPayload = (event, { operation = 'insert' } = {}) => ({
  summary: event.title,
  description: [stripManagedMeetLine(event.description), event.meetingLink ? `Google Meet: ${event.meetingLink}` : ''].filter(Boolean).join('\n\n'),
  ...(event.meetingLink ? { location: event.meetingLink } : operation === 'patch' ? { location: null } : {}),
  start: isAllDayRange(event)
    ? { date: formatGoogleAllDayDate(event.startAt), ...(operation === 'patch' ? { dateTime: null, timeZone: null } : {}) }
    : { ...(operation === 'patch' ? { date: null } : {}), dateTime: event.googleTimeZone && event.googleTimeZone !== 'America/Bogota' ? new Date(event.startAt).toISOString() : formatGoogleDateTimeInBogota(event.startAt), timeZone: event.googleTimeZone || 'America/Bogota' },
  end: isAllDayRange(event)
    ? { date: formatGoogleAllDayDate(event.endAt), ...(operation === 'patch' ? { dateTime: null, timeZone: null } : {}) }
    : { ...(operation === 'patch' ? { date: null } : {}), dateTime: event.googleTimeZone && event.googleTimeZone !== 'America/Bogota' ? new Date(event.endAt).toISOString() : formatGoogleDateTimeInBogota(event.endAt), timeZone: event.googleTimeZone || 'America/Bogota' },
  attendees: event.attendeeEmails.map(email => ({ email,
    ...(['accepted', 'declined', 'tentative', 'needsAction'].includes(event.attendeeResponses?.[email])
      ? { responseStatus: event.attendeeResponses[email] } : {})
  })),
  ...(buildGoogleRecurrence(event)
    ? { recurrence: buildGoogleRecurrence(event) }
    : operation === 'patch' ? { recurrence: [] } : {}),
  extendedProperties: {
    private: {
      brainOperationalEventId: event.id,
      brainEventType: event.type
    }
  },
  ...(event.type === 'MEETING' && !event.meetingLink ? {
    conferenceData: {
      createRequest: {
        requestId: `brain-${event.id}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  } : {})
});

const toGoogleEventPayload = buildGoogleEventPayload;

// rrule treats UTC fields as floating wall-clock components. Convert explicitly
// instead of depending on the server's local timezone (Windows/Railway differ).
const googleWallClockDate = (value, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(value)).reduce((all, item) => { all[item.type] = item.value; return all; }, {});
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)));
};
const googleWallClockToInstant = (value, timeZone) => {
  const desired = new Date(value).getTime();
  let candidate = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const correction = desired - googleWallClockDate(candidate, timeZone).getTime();
    if (!correction) break;
    candidate += correction;
  }
  return new Date(candidate);
};
const recurrenceDateText = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const parseRecurrenceDate = value => new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.length > 8 ? `${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}` : '00:00:00'}Z`);

const getGoogleOccurrenceStarts = (event, rangeStart, rangeEnd) => {
  const timeZone = event.googleTimeZone || 'America/Bogota';
  if ((event.googleRecurrence || []).some(line => /(?:^|;)FREQ=(SECONDLY|MINUTELY|HOURLY)(?:;|$)/.test(line.replace(/^RRULE:/, '')))) {
    throw createOperationalEventError('GOOGLE_CALENDAR_RECURRENCE_LIMIT', `La recurrencia de «${event.title || event.id}» es demasiado frecuente para mostrarla. Ajusta la regla en Google Calendar.`);
  }
  const rules = (event.googleRecurrence?.length ? event.googleRecurrence : buildGoogleRecurrence(event) || []).map(line => {
    if (line.startsWith('RRULE:')) return line.replace(/UNTIL=(\d{8}T\d{6}Z)/, (_, date) => `UNTIL=${recurrenceDateText(googleWallClockDate(parseRecurrenceDate(date), timeZone))}`);
    const match = line.match(/^(EXDATE|RDATE)([^:]*):(.+)$/);
    if (!match) return line;
    const sourceZone = match[2].match(/TZID=([^;]+)/)?.[1] || timeZone;
    const dates = match[3].split(',').map(date => {
      const parsed = parseRecurrenceDate(date);
      const instant = date.endsWith('Z') ? parsed : googleWallClockToInstant(parsed, sourceZone);
      return recurrenceDateText(googleWallClockDate(instant, timeZone));
    });
    return `${match[1]}:${dates.join(',')}`;
  });
  const set = rrule.rrulestr([`DTSTART:${recurrenceDateText(googleWallClockDate(event.startAt, timeZone))}`, ...rules].join('\n'), { forceset: true });
  const duration = new Date(event.endAt) - new Date(event.startAt);
  const pad = 2 * 24 * 60 * 60 * 1000;
  let count = 0;
  const occurrences = set.between(new Date(rangeStart.getTime() - duration - pad), new Date(rangeEnd.getTime() + pad), true, () => {
    count += 1;
    if (count > 10000) throw createOperationalEventError('GOOGLE_CALENDAR_RECURRENCE_LIMIT', 'La consulta supera 10.000 ocurrencias de una serie. Reduce el periodo consultado.');
    return true;
  });
  return occurrences
    .map(date => googleWallClockToInstant(date, timeZone))
    .filter(date => date <= rangeEnd && date.getTime() + duration >= rangeStart.getTime());
};

export const expandOperationalEventOccurrences = (events = [], start, end) => {
  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const expanded = [];
  const exceptions = events.filter(event => event.googleRecurringEventId && event.googleOriginalStartAt);
  const cancelledMasters = events.filter(event => !event.googleRecurringEventId && event.googleSyncStatus !== 'MERGED' && (
    event.googleCancelled || ['PENDING_DELETE', 'DELETED'].includes(event.googleSyncStatus)
  ));
  const isExcluded = (event, occurrenceStart) => exceptions.some(exception => (
    (exception.googleRecurringEventId === event.googleEventId || (exception.googleICalUID && exception.googleICalUID === event.googleICalUID)) &&
    new Date(exception.googleOriginalStartAt).getTime() === occurrenceStart.getTime()
  ));

  for (const event of events) {
    if (event.googleCancelled || ['PENDING_DELETE', 'DELETED', 'MERGED'].includes(event.googleSyncStatus)) continue;
    if (event.googleRecurringEventId && cancelledMasters.some(master => master.googleEventId === event.googleRecurringEventId || (event.googleICalUID && master.googleICalUID === event.googleICalUID))) continue;
    const seriesStart = new Date(event.startAt);
    const seriesEnd = new Date(event.endAt);
    if (!['WEEKLY', 'GOOGLE'].includes(event.recurrence)) {
      if (seriesStart <= rangeEnd && seriesEnd >= rangeStart) expanded.push(event);
      continue;
    }

    const duration = seriesEnd.getTime() - seriesStart.getTime();
    if (event.recurrence === 'GOOGLE' || event.googleTimeZone || event.googleRecurrence?.length) {
      for (const occurrenceStart of getGoogleOccurrenceStarts(event, rangeStart, rangeEnd)) {
        if (!isExcluded(event, occurrenceStart)) expanded.push({ ...event, startAt: occurrenceStart, endAt: new Date(occurrenceStart.getTime() + duration), seriesStartAt: seriesStart, seriesEndAt: seriesEnd, isRecurrenceOccurrence: true, occurrenceKey: `${event.id}:${occurrenceStart.toISOString()}` });
      }
      continue;
    }
    const recurrenceEnd = event.recurrenceEnd ? new Date(event.recurrenceEnd) : null;
    let occurrenceStart = new Date(seriesStart);
    if (occurrenceStart.getTime() + duration < rangeStart.getTime()) {
      const elapsedWeeks = Math.max(0, Math.floor((rangeStart.getTime() - occurrenceStart.getTime() - duration) / weekMs));
      occurrenceStart = new Date(occurrenceStart.getTime() + elapsedWeeks * weekMs);
      while (occurrenceStart.getTime() + duration < rangeStart.getTime()) {
        occurrenceStart = new Date(occurrenceStart.getTime() + weekMs);
      }
    }

    while (occurrenceStart <= rangeEnd && (!recurrenceEnd || occurrenceStart <= recurrenceEnd)) {
      if (!isExcluded(event, occurrenceStart)) expanded.push({
        ...event,
        startAt: new Date(occurrenceStart),
        endAt: new Date(occurrenceStart.getTime() + duration),
        seriesStartAt: seriesStart,
        seriesEndAt: seriesEnd,
        isRecurrenceOccurrence: true,
        occurrenceKey: `${event.id}:${occurrenceStart.toISOString()}`
      });
      occurrenceStart = new Date(occurrenceStart.getTime() + weekMs);
    }
  }

  return expanded.sort((left, right) => new Date(left.startAt) - new Date(right.startAt));
};

export function validateOperationalCalendarRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate || endDate - startDate > 366 * 24 * 60 * 60 * 1000) {
    throw createOperationalEventError('INVALID_CALENDAR_RANGE', 'Selecciona un periodo válido de hasta un año para consultar el calendario.');
  }
  return { startDate, endDate };
}

export async function getOperationalEvents(start, end) {
  const { startDate, endDate } = validateOperationalCalendarRange(start, end);

  const events = await prisma.operationalEvent.findMany({
    where: {
      OR: [
        {
          AND: [
            { recurrence: { in: ['WEEKLY', 'GOOGLE'] } },
            { startAt: { lte: endDate } },
            { OR: [{ recurrenceEnd: null }, { recurrenceEnd: { gte: startDate } }] }
          ]
        },
        // Event starts within range
        { startAt: { gte: startDate, lte: endDate } },
        // A moved/cancelled instance must suppress its original occurrence too.
        { googleOriginalStartAt: { gte: startDate, lte: endDate } },
        // Event ends within range
        { endAt: { gte: startDate, lte: endDate } },
        // Event spans across the entire range
        {
          AND: [
            { startAt: { lte: startDate } },
            { endAt: { gte: endDate } }
          ]
        }
      ]
    },
    orderBy: { startAt: 'asc' }
  });
  // A moved exception can land outside the master's original recurrence range.
  // Load its parent explicitly so deletion of the series still suppresses it.
  const exceptions = events.filter(event => event.googleRecurringEventId);
  if (exceptions.length) {
    const parents = await prisma.operationalEvent.findMany({
      where: {
        googleRecurringEventId: null,
        OR: [
          { googleEventId: { in: [...new Set(exceptions.map(event => event.googleRecurringEventId))] } },
          { googleICalUID: { in: [...new Set(exceptions.map(event => event.googleICalUID).filter(Boolean))] } }
        ]
      }
    });
    const allEvents = [...new Map([...events, ...parents].map(event => [event.id, event])).values()];
    return expandOperationalEventOccurrences(allEvents, startDate, endDate);
  }
  return expandOperationalEventOccurrences(events, startDate, endDate);
}

export async function syncOperationalEventToGoogle(event, {
  db = prisma,
  authorize = getAuthorizedGoogleOAuthClient,
  createCalendar = oauth2Client => google.calendar({ version: 'v3', auth: oauth2Client }),
  lock = withCalendarSyncLock
} = {}) {
  return lock(() => syncOperationalEventToGoogleUnlocked(event, { db, authorize, createCalendar }));
}

async function syncOperationalEventToGoogleUnlocked(event, { db, authorize, createCalendar }) {
  if (event.googleCancelled || ['DELETED', 'MERGED'].includes(event.googleSyncStatus)) throw createOperationalEventError('EVENT_NOT_FOUND', 'El evento ya no está activo.');
  const targetLink = event.googleLinks?.find(link => link.isOrganizer) || event.googleLinks?.[0];
  const auth = await authorize(targetLink?.connectionId || event.googleConnectionId || null);
  if (!auth) throw createOperationalEventError('GOOGLE_CALENDAR_NOT_CONNECTED', 'Conecta una cuenta de Google Calendar antes de guardar el evento.');

  const calendar = createCalendar(auth.oauth2Client);
  const calendarId = targetLink?.calendarId || event.googleCalendarId || auth.connection.calendarId || 'primary';
  const linkedGoogleEventId = targetLink?.googleEventId || event.googleEventId;
  const payload = toGoogleEventPayload(event, { operation: linkedGoogleEventId ? 'patch' : 'insert' });
  let googleWriteCompleted = false;

  try {
    const response = linkedGoogleEventId
      ? await patchGoogleEventReliably(calendar, {
          calendarId,
          eventId: linkedGoogleEventId,
          conferenceDataVersion: 1,
          sendUpdates: 'all',
          requestBody: payload
        }, getGooglePatchOptions(targetLink, event))
      : await insertGoogleEventReliably(calendar, {
          calendarId,
          conferenceDataVersion: 1,
          sendUpdates: 'all',
          requestBody: { ...payload, id: googleEventIdFor(event.id) }
        });

    const googleEvent = response.data;
    googleWriteCompleted = true;
    assertCalendarSyncLock();
    await db.googleCalendarEventLink.upsert({
      where: {
        connectionId_calendarId_googleEventId: {
          connectionId: auth.connection.id,
          calendarId,
          googleEventId: googleEvent.id
        }
      },
      create: {
        operationalEventId: event.id,
        connectionId: auth.connection.id,
        calendarId,
        googleEventId: googleEvent.id,
        googleICalUID: googleEvent.iCalUID || null,
        googleEtag: googleEvent.etag || null,
        isOrganizer: googleEvent.organizer?.email?.toLowerCase() === auth.connection.email.toLowerCase()
      },
      update: {
        googleICalUID: googleEvent.iCalUID || null,
        googleEtag: googleEvent.etag || null,
        isOrganizer: googleEvent.organizer?.email?.toLowerCase() === auth.connection.email.toLowerCase()
      }
    });
    assertCalendarSyncLock();
    return await db.operationalEvent.update({
      where: { id: event.id },
      data: {
        source: event.source || 'BRAIN',
        organizerEmail: googleEvent.organizer?.email || CENTRAL_GOOGLE_CALENDAR_EMAIL,
        attendeeEmails: (googleEvent.attendees || []).map(attendee => attendee.email).filter(Boolean),
        attendeeResponses: Object.fromEntries((googleEvent.attendees || []).filter(attendee => attendee.email).map(attendee => [attendee.email, attendee.responseStatus || 'needsAction'])),
        googleConnectionId: auth.connection.id,
        googleCalendarId: calendarId,
        googleEventId: googleEvent.id,
        googleICalUID: googleEvent.iCalUID,
        googleEtag: googleEvent.etag,
        googleHtmlLink: googleEvent.htmlLink,
        googleUpdatedAt: googleEvent.updated ? new Date(googleEvent.updated) : null,
        googleLastSyncedAt: new Date(),
        googleSyncStatus: 'SYNCED',
        googleSyncError: null,
        googleSyncAttempts: 0,
        googleNextRetryAt: null,
        meetingLink: getMeetLinkFromGoogleEvent(googleEvent) || event.meetingLink || null,
        googleMeetSpaceName: event.googleMeetSpaceName || null
      }
    });
  } catch (error) {
    const details = getGoogleErrorDetails(error);
    console.error(`[OperationalEventService] Google Calendar sync failed: ${details}`);
    if (googleWriteCompleted) {
      await Promise.resolve().then(() => {
        assertCalendarSyncLock();
        return db.operationalEvent.update({
        where: { id: event.id },
        data: {
          googleSyncStatus: 'PENDING',
          googleSyncError: `Google actualizado; metadatos pendientes: ${details}`.slice(0, 2000),
          googleSyncAttempts: (event.googleSyncAttempts || 0) + 1,
          googleNextRetryAt: nextGoogleRetryAt(event.googleSyncAttempts || 0)
        }
        });
      }).catch(metadataStatusError => {
        console.error('[OperationalEventService] Failed to persist pending metadata status:', metadataStatusError?.response?.data || metadataStatusError);
      });
      const metadataError = new Error('Google Calendar se actualizó, pero quedó pendiente confirmar los metadatos locales.', { cause: error });
      metadataError.code = 'GOOGLE_SYNC_METADATA_PENDING';
      metadataError.preserveLocal = true;
      metadataError.eventId = event.id;
      throw metadataError;
    }
    const errorCode = classifyGoogleCalendarSyncError(error);
    const pending = !errorCode && isRetryableGoogleWriteError(error);
    if (errorCode === 'GOOGLE_CALENDAR_REAUTH_REQUIRED') {
      await markGoogleCalendarReauthRequired(auth.connection);
    }
    try {
      assertCalendarSyncLock();
      await db.operationalEvent.update({
        where: { id: event.id },
        data: {
          googleSyncStatus: pending ? 'PENDING' : errorCode === 'GOOGLE_CALENDAR_CONFLICT' ? 'CONFLICT' : 'ERROR',
          googleSyncError: details.slice(0, 2000),
          googleSyncAttempts: (event.googleSyncAttempts || 0) + 1,
          googleNextRetryAt: pending ? nextGoogleRetryAt(event.googleSyncAttempts || 0) : null
        }
      });
      if (errorCode === 'GOOGLE_CALENDAR_CONFLICT') {
        assertCalendarSyncLock();
        await db.googleCalendarConnection.updateMany({ where: { id: auth.connection.id }, data: { syncToken: null, syncVersion: 0 } });
      }
    } catch (persistenceError) {
      console.error('[OperationalEventService] Failed to persist Google failure:', persistenceError.response?.data || persistenceError.message);
      throw Object.assign(new Error('Falta confirmar la sincronización del evento.', { cause: persistenceError }), {
        code: 'GOOGLE_SYNC_PENDING', preserveLocal: true, eventId: event.id
      });
    }
    const syncError = new Error(`Google Calendar sync failed: ${details}`, { cause: error });
    if (pending) { syncError.code = 'GOOGLE_SYNC_PENDING'; syncError.preserveLocal = true; syncError.eventId = event.id; }
    if (errorCode) syncError.code = errorCode;
    if (errorCode === 'GOOGLE_CALENDAR_REAUTH_REQUIRED') {
      syncError.reconnectRequired = true;
    }
    throw syncError;
  }
}

const googleCalendarSyncLocks = new Map();

export const withGoogleCalendarSyncLock = (key, task) => {
  const lockKey = key || 'default';
  const existing = googleCalendarSyncLocks.get(lockKey);
  if (existing) return existing;
  let pending;
  try {
    pending = Promise.resolve(task());
  } catch (error) {
    pending = Promise.reject(error);
  }
  googleCalendarSyncLocks.set(lockKey, pending);
  pending.finally(() => {
    if (googleCalendarSyncLocks.get(lockKey) === pending) googleCalendarSyncLocks.delete(lockKey);
  }).catch(() => {});
  return pending;
};

const GOOGLE_CALENDAR_SYNC_VERSION = 2;
const GOOGLE_PENDING_LOCAL_STATUSES = new Set(['PENDING', 'RETRY', 'PENDING_DELETE', 'ERROR', 'DELETED', 'MERGED']);

// The caller holds the shared PostgreSQL calendar lock. Event and link changes
// still commit together, so a failed link write cannot leave an orphan event.
export async function importGoogleCalendarEvent(googleEvent, connection, teamMembers = [], prismaClient = prisma) {
  assertCalendarSyncLock();
  if (!googleEvent.id) throw new Error('Google Calendar devolvió un evento sin identificador');
  const calendarId = connection.calendarId || 'primary';
  const linkKey = { connectionId: connection.id, calendarId, googleEventId: googleEvent.id };
  const originalTime = googleEvent.originalStartTime;
  const originalStartAt = originalTime ? mapGoogleEventDates({ start: originalTime, end: originalTime }).startAt : null;
  return prismaClient.$transaction(async tx => {
    assertCalendarSyncLock();
    const existingLink = await tx.googleCalendarEventLink.findFirst({ where: linkKey, include: { operationalEvent: true } });
    const brainEventId = googleEvent.extendedProperties?.private?.brainOperationalEventId;
    const referenced = !googleEvent.recurringEventId && brainEventId
      ? await tx.operationalEvent.findUnique({ where: { id: brainEventId } })
      : null;
    const existing = existingLink?.operationalEvent || (referenced?.googleSyncStatus !== 'MERGED' ? referenced : null) || await tx.operationalEvent.findFirst({
      where: googleEvent.iCalUID
        ? { googleICalUID: googleEvent.iCalUID, googleOriginalStartAt: originalStartAt, OR: [{ googleSyncStatus: null }, { googleSyncStatus: { not: 'MERGED' } }] }
        : { googleCalendarId: calendarId, googleConnectionId: connection.id, googleEventId: googleEvent.id }
    });
    const links = existing ? await tx.googleCalendarEventLink.findMany({ where: { operationalEventId: existing.id } }) : [];
    const incomingOrganizer = googleEvent.organizer?.self === true || googleEvent.organizer?.email?.toLowerCase() === connection.email.toLowerCase();
    const hasOtherOrganizer = links.some(link => link.isOrganizer && (link.connectionId !== connection.id || link.calendarId !== calendarId));
    const pending = existing && GOOGLE_PENDING_LOCAL_STATUSES.has(existing.googleSyncStatus);

    if (googleEvent.status === 'cancelled' && !googleEvent.recurringEventId) {
      if (!existing || pending) return 'skipped';
      if (hasOtherOrganizer) {
        if (existingLink) await tx.googleCalendarEventLink.delete({ where: { id: existingLink.id } });
      } else {
        await tx.operationalEvent.update({ where: { id: existing.id }, data: { googleCancelled: true, googleLastSyncedAt: new Date() } });
      }
      assertCalendarSyncLock();
      return 'skipped';
    }

    const cancelledInstance = googleEvent.status === 'cancelled';
    if (cancelledInstance && !originalStartAt) throw new Error('La excepción cancelada de Google no tiene fecha original');
    const normalized = cancelledInstance ? {
      ...googleEvent, start: googleEvent.start || originalTime,
      end: googleEvent.end || { dateTime: new Date(originalStartAt.getTime() + 1).toISOString() }
    } : googleEvent;
    const googleData = {
      ...toOperationalEventDataFromGoogle(normalized, calendarId, connection.id, teamMembers),
      googleRecurringEventId: googleEvent.recurringEventId || null,
      googleOriginalStartAt: originalStartAt,
      googleTimeZone: googleEvent.start?.timeZone || existing?.googleTimeZone || 'America/Bogota',
      googleCancelled: cancelledInstance
    };
    if (!Number.isFinite(googleData.startAt.getTime()) || !Number.isFinite(googleData.endAt.getTime())) {
      throw new Error(`El evento ${googleEvent.id} contiene fechas de Google inválidas`);
    }
    const older = existing?.googleUpdatedAt && googleData.googleUpdatedAt && googleData.googleUpdatedAt < new Date(existing.googleUpdatedAt);
    const preserveLocal = pending || older || (!incomingOrganizer && hasOtherOrganizer);
    let operationalEventId = existing?.id;
    let outcome = 'skipped';
    if (!existing) {
      const created = await tx.operationalEvent.create({ data: googleData });
      operationalEventId = created.id;
      outcome = 'imported';
    } else if (!preserveLocal) {
      await tx.operationalEvent.update({ where: { id: existing.id }, data: { ...googleData, source: existing.source } });
      outcome = 'updated';
    }
    // A pending edit retains its base ETag so the retry can detect a remote conflict.
    const linkMetadata = { googleICalUID: googleEvent.iCalUID || null, isOrganizer: incomingOrganizer };
    if (!pending && !older) linkMetadata.googleEtag = googleEvent.etag || null;
    assertCalendarSyncLock();
    await tx.googleCalendarEventLink.upsert({
      where: { connectionId_calendarId_googleEventId: linkKey },
      create: { ...linkKey, operationalEventId, ...linkMetadata },
      update: linkMetadata
    });
    assertCalendarSyncLock();
    return outcome;
  });
}

export async function syncGoogleCalendarConnection({ connectionId } = {}, {
  prismaClient = prisma,
  authorize = getAuthorizedGoogleOAuthClient,
  createCalendar = auth => google.calendar({ version: 'v3', auth }),
  listPages = listAllGoogleEventPages,
  importEvent = importGoogleCalendarEvent
} = {}) {
  const auth = await authorize(connectionId || null);
  if (!auth) {
    return { imported: 0, updated: 0, skipped: 0, connected: false };
  }

  const calendar = createCalendar(auth.oauth2Client);
  const calendarId = auth.connection.calendarId || 'primary';
  let previousToken = auth.connection.syncToken || null;
  const connectionVersion = auth.connection.syncVersion || 0;
  const connectedAt = auth.connection.connectedAt;
  const cursorWhere = () => ({ id: auth.connection.id, calendarId, isActive: true, connectedAt, syncToken: previousToken });
  const fullRequest = {
    calendarId,
    singleEvents: false,
    showDeleted: true,
    maxResults: 250
  };
  const incrementalRequest = previousToken && connectionVersion === GOOGLE_CALENDAR_SYNC_VERSION
    ? { ...fullRequest, syncToken: previousToken } : null;
  let fullSnapshot = !incrementalRequest;

  let pageResult;
  try {
    pageResult = await listPages(calendar, incrementalRequest || fullRequest);
  } catch (error) {
    if (error.code !== 'GOOGLE_SYNC_TOKEN_EXPIRED') throw error;
    const reset = await prismaClient.googleCalendarConnection.updateMany({
      where: cursorWhere(), data: { syncToken: null }
    });
    if (!reset.count) throw createOperationalEventError('GOOGLE_CALENDAR_SYNC_STALE', 'La conexión de Google cambió durante la sincronización');
    previousToken = null;
    fullSnapshot = true;
    pageResult = await listPages(calendar, fullRequest);
  }

  if (!pageResult.nextSyncToken) throw new Error('Google Calendar no devolvió el token final de sincronización');
  const current = await prismaClient.googleCalendarConnection.findUnique({ where: { id: auth.connection.id } });
  if (!current?.isActive || current.calendarId !== calendarId || new Date(current.connectedAt).getTime() !== new Date(connectedAt).getTime() || (current.syncToken || null) !== previousToken) {
    throw createOperationalEventError('GOOGLE_CALENDAR_SYNC_STALE', 'La conexión de Google cambió durante la sincronización');
  }
  const counts = { imported: 0, updated: 0, skipped: 0 };
  const teamMembers = await prismaClient.teamMember.findMany({ select: { id: true, email: true } });
  for (const googleEvent of pageResult.items) {
    const outcome = await importEvent(googleEvent, auth.connection, teamMembers, prismaClient);
    counts[outcome] += 1;
  }
  if (fullSnapshot) {
    // An expired cursor no longer guarantees old cancellation tombstones. Only
    // after every page imported successfully can absence be reconciled.
    const seen = new Set(pageResult.items.map(event => event.id));
    const links = await prismaClient.googleCalendarEventLink.findMany({ where: { connectionId: auth.connection.id, calendarId } });
    for (const link of links) {
      if (!seen.has(link.googleEventId)) {
        await importEvent({ id: link.googleEventId, status: 'cancelled' }, auth.connection, teamMembers, prismaClient);
      }
    }
  }
  assertCalendarSyncLock();
  const committed = await prismaClient.googleCalendarConnection.updateMany({
    where: cursorWhere(),
    data: { lastSyncedAt: new Date(), syncToken: pageResult.nextSyncToken, syncVersion: GOOGLE_CALENDAR_SYNC_VERSION }
  });
  if (!committed.count) throw createOperationalEventError('GOOGLE_CALENDAR_SYNC_STALE', 'La conexión de Google cambió durante la sincronización');
  return { ...counts, connected: true };
}

export function syncGoogleCalendarToOperationalEvents(options = {}) {
  return withGoogleCalendarSyncLock(options.connectionId || 'default', () => withCalendarSyncLock(() => syncGoogleCalendarConnection(options)));
}

export async function syncAllGoogleCalendars(options = {}, {
  listConnections = getGoogleCalendarConnections,
  syncCalendar = syncGoogleCalendarToOperationalEvents,
  logger = console
} = {}) {
  const connections = await listConnections();
  const results = [];
  for (const connection of connections) {
    try {
      results.push({ connectionId: connection.id, email: connection.email, ...(await syncCalendar({ ...options, connectionId: connection.id })) });
    } catch (error) {
      logger.error(`[OperationalEventService] Error sincronizando ${connection.email}:`, error.response?.data || error.message);
      results.push({ connectionId: connection.id, email: connection.email, connected: false, error: error.message });
    }
  }
  return results;
}

export async function getOperationalEventReconciliationPreview(limit = 20) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 20);
  const where = getPendingGoogleCalendarWhere();
  const [total, events] = await Promise.all([
    prisma.operationalEvent.count({ where }),
    prisma.operationalEvent.findMany({
      where,
      orderBy: { startAt: 'desc' },
      take: safeLimit,
      select: { id: true, title: true, startAt: true, endAt: true, attendeeEmails: true, googleSyncStatus: true }
    })
  ]);
  return { total, events };
}

export async function dismissOperationalEventGoogleError(id, prismaClient = prisma) {
  return await prismaClient.operationalEvent.updateMany({
    where: { id, googleSyncError: { not: null } },
    data: { googleSyncError: null }
  });
}

export async function dismissOperationalEventReconciliation(id, prismaClient = prisma, lock = withCalendarSyncLock) {
  return lock(() => prismaClient.operationalEvent.updateMany({
    where: { id, ...getPendingGoogleCalendarWhere(), requestId: null, googleEventId: null },
    data: { googleSyncStatus: 'DISMISSED', googleSyncError: null }
  }));
}

export async function reconcilePendingOperationalEvents({ eventIds = [], connectionId } = {}, {
  withLock = withCalendarSyncLock, prismaClient = prisma,
  authorize = getAuthorizedGoogleOAuthClient, syncToGoogle = syncOperationalEventToGoogle, logger = console, now = () => new Date()
} = {}) {
  if (!Array.isArray(eventIds) || eventIds.length === 0) throw new Error('Selecciona al menos un evento');
  if (eventIds.length > 20) throw new Error('Solo se pueden reconciliar hasta 20 eventos por operación');
  if (!connectionId) throw new Error('Selecciona la cuenta organizadora de Google');
  return withLock(async () => {
  const auth = await authorize(connectionId);
  if (!auth) throw new Error('La cuenta organizadora de Google no está disponible');

  const events = await prismaClient.operationalEvent.findMany({
    where: {
      id: { in: [...new Set(eventIds)] },
      ...getPendingGoogleCalendarWhere()
    }
  });
  const results = [];
  for (const event of events) {
    try {
      validateOperationalEventSchedule(event, null, now());
      assertCalendarSyncLock();
      const assigned = await prismaClient.operationalEvent.update({
        where: { id: event.id },
        data: { requestId: `legacy-reconcile-${event.id}`, googleConnectionId: auth.connection.id, googleCalendarId: auth.connection.calendarId || 'primary', googleSyncStatus: 'PENDING', googleNextRetryAt: new Date(), googleSyncError: null }
      });
      const synced = await syncToGoogle(assigned);
      results.push({ id: event.id, status: synced?.googleSyncStatus || 'SYNCED' });
    } catch (error) {
      logger.error(`[OperationalEventService] Error reconciliando ${event.id}:`, error.response?.data || error.message);
      results.push({ id: event.id, status: 'ERROR', error: getGoogleErrorDetails(error) });
    }
  }
  return {
    requested: eventIds.length,
    synced: results.filter(result => result.status === 'SYNCED').length,
    failed: results.filter(result => result.status === 'ERROR').length,
    pending: results.filter(result => result.status === 'PENDING').length,
    results
  };
  });
}

export async function renewGoogleCalendarWatchChannels({
  listConnections = getGoogleCalendarConnections, authorize = getAuthorizedGoogleOAuthClient,
  withLock = withCalendarSyncLock, prismaClient = prisma,
  createCalendar = auth => google.calendar({ version: 'v3', auth }), logger = console
} = {}) {
  const connections = await listConnections();
  const address = `${process.env.APP_URL || 'https://labs.brainstudioagencia.com'}/api/activity/google-calendar/webhook`;
  const renewed = [];
  const errors = [];

  for (const selected of connections) {
    try {
    await withLock(async () => {
    const auth = await authorize(selected.id);
    if (!auth) throw new Error('La cuenta de Google requiere reconexión');
    const { oauth2Client, connection } = auth;
    const calendar = createCalendar(oauth2Client);
    const activeChannel = await prismaClient.googleCalendarSyncChannel.findFirst({
      where: { connectionId: connection.id, expiresAt: { gt: new Date(Date.now() + 12 * 60 * 60 * 1000) } },
      orderBy: { expiresAt: 'desc' }
    });
    if (activeChannel) return;

    const channelId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');
    const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000;
    const response = await calendar.events.watch({
      calendarId: connection.calendarId || 'primary',
      requestBody: { id: channelId, type: 'web_hook', address, token, expiration: String(expiration) }
    }, googleCalendarRequestOptions());
    assertCalendarSyncLock();
    await prismaClient.googleCalendarSyncChannel.create({
      data: {
        connectionId: connection.id,
        channelId,
        resourceId: response.data.resourceId,
        resourceUri: response.data.resourceUri || null,
        token,
        expiresAt: response.data.expiration ? new Date(Number(response.data.expiration)) : new Date(expiration)
      }
    });
    renewed.push(connection.email);
    });
    } catch (error) {
      logger.error(`[OperationalEventService] Falló el webhook de ${selected.email}:`, error.response?.data || error.message);
      errors.push({ connectionId: selected.id, email: selected.email, error: error.message });
    }
  }
  return { renewed, failed: errors.length, errors };
}

export async function handleGoogleCalendarWebhook(headers = {}, {
  findChannel = query => prisma.googleCalendarSyncChannel.findFirst(query),
  scheduleSync = callback => queueMicrotask(callback),
  syncCalendar = syncGoogleCalendarToOperationalEvents,
  logger = console
} = {}) {
  const channelId = headers['x-goog-channel-id'];
  const token = headers['x-goog-channel-token'];
  const resourceState = headers['x-goog-resource-state'];
  if (!channelId || !token) return { accepted: false };
  const channel = await findChannel({
    where: { channelId, token, expiresAt: { gt: new Date() } }
  });
  if (!channel) return { accepted: false };
  if (channel.resourceId && headers['x-goog-resource-id'] !== channel.resourceId) return { accepted: false };
  if (resourceState !== 'sync') {
    scheduleSync(async () => {
      try {
        await syncCalendar({ connectionId: channel.connectionId });
      } catch (error) {
        logger.error('[OperationalEventService] Google webhook sync failed:', error.response?.data || error.message);
      }
    });
  }
  return { accepted: true };
}

export async function deleteGoogleEventIfLinked(event, {
  authorize = getAuthorizedGoogleOAuthClient,
  createCalendar = oauth2Client => google.calendar({ version: 'v3', auth: oauth2Client })
} = {}) {
  const targetLink = event.googleLinks?.find(link => link.isOrganizer) || event.googleLinks?.[0];
  if (!event.googleEventId && !targetLink && !event.requestId) return;

  const auth = await authorize(targetLink?.connectionId || event.googleConnectionId || null);
  if (!auth) throw createOperationalEventError('GOOGLE_CALENDAR_NOT_CONNECTED', 'Conecta la cuenta organizadora antes de eliminar el evento.');

  const calendar = createCalendar(auth.oauth2Client);
  try {
    await calendar.events.delete({
      calendarId: targetLink?.calendarId || event.googleCalendarId || auth.connection.calendarId || 'primary',
      eventId: targetLink?.googleEventId || event.googleEventId || googleEventIdFor(event.id),
      sendUpdates: 'all'
    }, googleCalendarRequestOptions(getGooglePatchOptions(targetLink, event)));
  } catch (error) {
    if (isGoogleEventAlreadyDeleted(error)) {
      console.warn(`[OperationalEventService] Google Calendar event already missing: ${event.googleEventId}`);
      return;
    }
    throw error;
  }
}

export const createSyncedOperationalEvent = async ({
  createLocalEvent,
  syncToGoogle,
  deleteLocalEvent
}) => {
  const event = await createLocalEvent();
  try {
    return await syncToGoogle(event);
  } catch (error) {
    if (error.preserveLocal) throw error;
    try {
      await deleteLocalEvent(event.id);
    } catch (cleanupError) {
      console.error('[OperationalEventService] Failed to rollback local event:', cleanupError?.response?.data || cleanupError);
    }
    throw error;
  }
};

export const updateSyncedOperationalEvent = async ({
  updateLocalEvent,
  syncToGoogle,
  restoreLocalEvent
}) => {
  const event = await updateLocalEvent();
  try {
    return await syncToGoogle(event);
  } catch (error) {
    if (error.preserveLocal) throw error;
    try {
      await restoreLocalEvent(event.id);
    } catch (restoreError) {
      console.error('[OperationalEventService] Failed to restore local event:', restoreError?.response?.data || restoreError);
    }
    throw error;
  }
};

export function getOperationalEventRequestIdentity(data, createdById) {
  const requestId = data.requestId;
  if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(requestId)) {
    throw createOperationalEventError('INVALID_EVENT_REQUEST_ID', 'Actualiza la plataforma y vuelve a intentarlo: falta un identificador válido para guardar sin duplicados. No se creó el evento.');
  }
  const fields = ['title', 'type', 'description', 'startAt', 'endAt', 'isAllDay', 'captureWithFireflies', 'memberIds', 'attendeeEmails', 'recurrence', 'recurrenceEnd', 'googleRecurrence', 'meetingLink', 'googleMeetSpaceName', 'googleConnectionId'];
  const payload = Object.fromEntries(fields.map(key => [key, data[key] ?? null]));
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ createdById, payload })).digest('hex');
  return { requestId, requestHash };
}

export async function createOperationalEvent(data, createdById = null, {
  db = prisma, authorize = getAuthorizedGoogleOAuthClient, syncToGoogle = syncOperationalEventToGoogle, lock = withCalendarSyncLock, now = () => new Date()
} = {}) {
  return lock(async () => {
  const validated = validateOperationalEventInput(data);
  const identity = getOperationalEventRequestIdentity(data, createdById);
  const existing = await db.operationalEvent.findUnique({ where: { requestId: identity.requestId }, include: { googleLinks: true } });
  if (existing) {
    if (existing.createdById !== createdById || existing.requestHash !== identity.requestHash) {
      throw createOperationalEventError('EVENT_REQUEST_CONFLICT', 'La solicitud ya fue utilizada con otros datos.');
    }
    if (existing.googleCancelled || ['PENDING_DELETE', 'DELETED', 'MERGED'].includes(existing.googleSyncStatus)) throw createOperationalEventError('EVENT_NOT_FOUND', 'El evento fue eliminado.');
    return existing.googleSyncStatus === 'SYNCED' ? existing : syncToGoogle(existing);
  }
  validateOperationalEventSchedule(data, null, now());
  const auth = await authorize(data.googleConnectionId || null);
  if (!auth) throw createOperationalEventError('GOOGLE_CALENDAR_NOT_CONNECTED', 'Conecta una cuenta de Google Calendar antes de guardar el evento.');
  const range = { startAt: validated.startAt, endAt: validated.endAt };
  const externalEmails = (data.attendeeEmails || []).filter(email => email?.toLowerCase() !== FIREFLIES_BOT_EMAIL);
  if (data.captureWithFireflies) externalEmails.push(FIREFLIES_BOT_EMAIL);
  const attendeeEmails = await normalizeAttendeeEmails(data.memberIds || [], externalEmails, db);
  validateOperationalEventSchedule(data, null, now());
  return await createSyncedOperationalEvent({
    createLocalEvent: () => db.operationalEvent.create({
      data: {
        ...identity,
        title: validated.title,
        type: validated.type,
        description: data.description,
        startAt: range.startAt,
        endAt: range.endAt,
        isAllDay: Boolean(data.isAllDay),
        captureWithFireflies: Boolean(data.captureWithFireflies),
        memberIds: data.memberIds || [],
        attendeeEmails,
        attendeeResponses: {},
        recurrence: validated.recurrence,
        recurrenceEnd: data.recurrenceEnd ? new Date(data.recurrenceEnd) : null,
        googleRecurrence: validated.recurrence === 'GOOGLE' ? (data.googleRecurrence || []) : [],
        meetingLink: data.meetingLink || null,
        googleMeetSpaceName: data.googleMeetSpaceName || null,
        source: 'BRAIN',
        createdById,
        googleConnectionId: auth.connection.id,
        googleCalendarId: auth.connection.calendarId || 'primary',
        googleSyncStatus: 'PENDING',
        googleNextRetryAt: new Date(),
        googleMeetAccessType: data.googleMeetAccessType || (data.type === 'MEETING' ? 'OPEN' : null)
      }
    }),
    syncToGoogle,
    deleteLocalEvent: (id) => db.operationalEvent.delete({ where: { id } })
  });
  });
}

export async function updateOperationalEvent(id, data) {
  return withCalendarSyncLock(() => updateOperationalEventUnlocked(id, data));
}

async function updateOperationalEventUnlocked(id, data) {
  const current = await prisma.operationalEvent.findUnique({ where: { id } });
  if (!current) throw createOperationalEventError('EVENT_NOT_FOUND', 'El evento ya no existe.');
  if (current.googleCancelled || ['DELETED', 'MERGED'].includes(current.googleSyncStatus)) throw createOperationalEventError('EVENT_NOT_FOUND', 'El evento ya no está activo.');
  if (['PENDING', 'PENDING_DELETE', 'DELETED'].includes(current.googleSyncStatus)) {
    throw createOperationalEventError('EVENT_SYNC_IN_PROGRESS', 'Confirma la sincronización pendiente antes de modificar este evento.');
  }
  const validated = validateOperationalEventInput(data, current);
  validateOperationalEventSchedule(data, current);
  const range = { startAt: validated.startAt, endAt: validated.endAt };
  const memberIds = data.memberIds ?? current?.memberIds ?? [];
  const captureWithFireflies = data.captureWithFireflies ?? current?.captureWithFireflies ?? false;
  const externalEmails = (data.attendeeEmails ?? current?.attendeeEmails ?? []).filter(email => email?.toLowerCase() !== FIREFLIES_BOT_EMAIL);
  if (captureWithFireflies) externalEmails.push(FIREFLIES_BOT_EMAIL);
  const attendeeEmails = await normalizeAttendeeEmails(memberIds, externalEmails);
  validateOperationalEventSchedule(data, current);
  return await updateSyncedOperationalEvent({
    updateLocalEvent: async () => {
      const event = await prisma.operationalEvent.update({
        where: { id },
        data: {
          googleSyncStatus: 'PENDING',
          googleSyncError: null,
          googleNextRetryAt: new Date(),
          title: data.title === undefined ? undefined : validated.title,
          type: data.type === undefined ? undefined : validated.type,
          description: data.description,
          startAt: data.startAt === undefined ? undefined : range.startAt,
          endAt: data.endAt === undefined ? undefined : range.endAt,
          isAllDay: data.isAllDay === undefined ? undefined : Boolean(data.isAllDay),
          captureWithFireflies,
          memberIds: data.memberIds,
          attendeeEmails,
          recurrence: data.recurrence === undefined ? undefined : validated.recurrence,
          recurrenceEnd: data.recurrenceEnd === undefined
            ? undefined
            : validated.recurrence === 'WEEKLY' && data.recurrenceEnd ? new Date(data.recurrenceEnd) : null,
          googleRecurrence: data.recurrence === undefined
            ? undefined
            : validated.recurrence === 'GOOGLE' ? (data.googleRecurrence || current.googleRecurrence || []) : [],
          meetingLink: data.meetingLink,
          googleMeetSpaceName: data.googleMeetSpaceName,
          googleMeetAccessType: data.googleMeetAccessType
        }
      });
      return await prisma.operationalEvent.findUnique({ where: { id: event.id }, include: { googleLinks: true } });
    },
    syncToGoogle: syncOperationalEventToGoogle,
    restoreLocalEvent: () => prisma.operationalEvent.update({
      where: { id },
      data: {
        googleSyncStatus: current.googleSyncStatus,
        googleNextRetryAt: null,
        title: current.title,
        type: current.type,
        description: current.description,
        startAt: current.startAt,
        endAt: current.endAt,
        isAllDay: current.isAllDay,
        captureWithFireflies: current.captureWithFireflies,
        memberIds: current.memberIds,
        attendeeEmails: current.attendeeEmails,
        attendeeResponses: current.attendeeResponses,
        recurrence: current.recurrence,
        recurrenceEnd: current.recurrenceEnd,
        googleRecurrence: current.googleRecurrence,
        meetingLink: current.meetingLink,
        googleMeetSpaceName: current.googleMeetSpaceName,
        googleMeetAccessType: current.googleMeetAccessType
      }
    })
  });
}

export async function retryOperationalEventGoogleSync(id, connectionId = null, {
  findEvent = eventId => prisma.operationalEvent.findUnique({ where: { id: eventId }, include: { googleLinks: true } }),
  syncToGoogle = syncOperationalEventToGoogle,
  lock = withCalendarSyncLock
} = {}) {
  return lock(async () => {
  const event = await findEvent(id);
  if (!event) throw createOperationalEventError('EVENT_NOT_FOUND', 'El evento ya no existe.');
  if (event.googleCancelled || ['DELETED', 'MERGED'].includes(event.googleSyncStatus)) throw createOperationalEventError('EVENT_NOT_FOUND', 'El evento fue eliminado.');
  if (event.googleSyncStatus === 'PENDING_DELETE') return deleteOperationalEvent(id);
  const candidate = connectionId && !event.googleLinks?.length && !event.googleConnectionId && !event.requestId
    ? { ...event, googleConnectionId: connectionId }
    : event;
  return await syncToGoogle(candidate);
  });
}

export async function deleteOperationalEvent(id) {
  return withCalendarSyncLock(() => deleteOperationalEventUnlocked(id));
}

async function deleteOperationalEventUnlocked(id) {
  const event = await prisma.operationalEvent.findUnique({ where: { id }, include: { googleLinks: true } });
  if (event?.googleSyncStatus === 'MERGED') throw createOperationalEventError('EVENT_NOT_FOUND', 'El duplicado fue consolidado; abre el evento vigente.');
  if (!event || event.googleSyncStatus === 'DELETED') return { id, googleSyncStatus: 'DELETED' };
  await prisma.operationalEvent.update({ where: { id }, data: { googleSyncStatus: 'PENDING_DELETE', googleNextRetryAt: new Date() } });
    try {
      await deleteGoogleEventIfLinked(event);
    } catch (error) {
      const details = getGoogleErrorDetails(error);
      console.error(`[OperationalEventService] Google Calendar delete failed: ${details}`);
      const pending = isRetryableGoogleWriteError(error) && !classifyGoogleCalendarSyncError(error);
      await prisma.operationalEvent.update({ where: { id }, data: {
        googleSyncStatus: pending ? 'PENDING_DELETE' : event.googleSyncStatus,
        googleSyncError: details.slice(0, 2000),
        googleSyncAttempts: (event.googleSyncAttempts || 0) + 1,
        googleNextRetryAt: pending ? nextGoogleRetryAt(event.googleSyncAttempts || 0) : null
      } });
      if (pending) return { id, googleSyncStatus: 'PENDING_DELETE' };
      throw error;
    }
  assertCalendarSyncLock();
  return await prisma.operationalEvent.update({
    where: { id }, data: { googleSyncStatus: 'DELETED', googleCancelled: true, googleSyncError: null, googleNextRetryAt: null }
  });
}

export async function retryPendingGoogleCalendarWrites({
  findPending = query => prisma.operationalEvent.findMany(query),
  retry = id => retryOperationalEventGoogleSync(id),
  persistFailure = query => prisma.operationalEvent.updateMany(query),
  logger = console,
  now = new Date()
} = {}) {
  const events = await findPending({
    where: { googleSyncStatus: { in: ['PENDING', 'PENDING_DELETE'] },
      OR: [{ googleNextRetryAt: null }, { googleNextRetryAt: { lte: now } }] },
    orderBy: [{ googleNextRetryAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    take: 20, select: { id: true, googleSyncStatus: true, googleSyncAttempts: true, googleNextRetryAt: true }
  });
  const result = { synced: 0, failed: 0, pending: 0 };
  for (const event of events) {
    try {
      const retried = await retry(event.id);
      if (['PENDING', 'PENDING_DELETE'].includes(retried?.googleSyncStatus)) result.pending++;
      else result.synced++;
    } catch (error) {
      result.failed++;
      logger.error('[Calendar recovery] Pending write failed:', event.id, error.response?.data || error.message);
      if (error.code === 'GOOGLE_CALENDAR_BUSY') break;
      if (['PENDING', 'PENDING_DELETE'].includes(event.googleSyncStatus)) {
        const authorizationRequired = error.code === 'GOOGLE_CALENDAR_NOT_CONNECTED' || isGoogleOAuthReauthError(error);
        const terminal = event.googleSyncStatus === 'PENDING' && authorizationRequired;
        try {
          // Authorization can fail before the sync handler writes retry metadata.
          // Match the original values so this fallback cannot overwrite that
          // handler's newer state or another worker's completed operation.
          await persistFailure({
            where: { id: event.id, googleSyncStatus: event.googleSyncStatus, googleSyncAttempts: event.googleSyncAttempts || 0, googleNextRetryAt: event.googleNextRetryAt || null },
            data: {
              googleSyncStatus: terminal ? 'ERROR' : event.googleSyncStatus,
              googleSyncError: getGoogleErrorDetails(error).slice(0, 2000),
              googleSyncAttempts: (event.googleSyncAttempts || 0) + 1,
              googleNextRetryAt: terminal ? null : nextGoogleRetryAt(event.googleSyncAttempts || 0, Math.max(new Date(now).getTime(), Date.now()))
            }
          });
        } catch (persistenceError) {
          logger.error('[Calendar recovery] Failed to persist retry backoff:', event.id, persistenceError.response?.data || persistenceError.message);
        }
      }
    }
  }
  return result;
}
