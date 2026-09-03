import prisma from '../lib/prisma.js';
import { google } from 'googleapis';
import {
  getAuthorizedGoogleOAuthClient,
  getAuthorizedGoogleOAuthClients,
  CENTRAL_GOOGLE_CALENDAR_EMAIL,
  isGoogleOAuthReauthError,
  markGoogleCalendarReauthRequired
} from './googleCalendarOAuthService.js';
import crypto from 'crypto';

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
  const status = error.code || error.response?.status;
  const errors = error.response?.data?.error?.errors || error.errors || [];
  return status === 404 || status === 410 || errors.some(item => item.reason === 'deleted');
};

const isExpiredGoogleSyncTokenError = (error) => {
  const status = error.code || error.response?.status;
  const errors = error.response?.data?.error?.errors || error.errors || [];
  return status === 410 || errors.some(item => item.reason === 'fullSyncRequired');
};

export async function listAllGoogleEventPages(calendar, request) {
  const items = [];
  let pageToken;
  let nextSyncToken;

  try {
    do {
      const response = await calendar.events.list({ ...request, ...(pageToken ? { pageToken } : {}) });
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

const normalizeAttendeeEmails = async (memberIds = [], externalEmails = []) => {
  const members = memberIds.length
    ? await prisma.teamMember.findMany({ where: { id: { in: memberIds } }, select: { email: true } })
    : [];
  return [...new Set([...externalEmails, ...members.map(member => member.email)]
    .map(email => email?.trim().toLowerCase())
    .filter(email => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
};

export const normalizeOperationalEventRange = (data = {}, current = {}) => {
  const startAt = new Date(data.startAt ?? current.startAt);
  const endAt = new Date(data.endAt ?? current.endAt);

  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
    const error = new Error('La fecha y hora de finalización deben ser posteriores al inicio.');
    error.code = 'INVALID_EVENT_RANGE';
    throw error;
  }

  return { startAt, endAt };
};

export const getGooglePatchOptions = (target, fallback = null) => (target?.googleEtag || fallback?.googleEtag)
  ? { headers: { 'If-Match': target?.googleEtag || fallback.googleEtag } }
  : undefined;

export const classifyGoogleCalendarSyncError = error => {
  const status = error.code || error.response?.status;
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
  if (!rule) return { recurrence: 'NONE', recurrenceEnd: null, googleRecurrence: [] };
  const until = rule.match(/(?:^|;)UNTIL=([^;]+)/)?.[1];
  const recurrenceEnd = until && /^\d{8}T\d{6}Z$/.test(until)
    ? new Date(`${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}T${until.slice(9, 11)}:${until.slice(11, 13)}:${until.slice(13, 15)}Z`)
    : null;
  const isSimpleWeekly = /^RRULE:FREQ=WEEKLY(?:;UNTIL=\d{8}T\d{6}Z)?$/.test(rule);
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
    : { ...(operation === 'patch' ? { date: null } : {}), dateTime: formatGoogleDateTimeInBogota(event.startAt), timeZone: 'America/Bogota' },
  end: isAllDayRange(event)
    ? { date: formatGoogleAllDayDate(event.endAt), ...(operation === 'patch' ? { dateTime: null, timeZone: null } : {}) }
    : { ...(operation === 'patch' ? { date: null } : {}), dateTime: formatGoogleDateTimeInBogota(event.endAt), timeZone: 'America/Bogota' },
  attendees: event.attendeeEmails.map(email => ({ email })),
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
        requestId: `brain-${event.id}-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  } : {})
});

const toGoogleEventPayload = buildGoogleEventPayload;

export const expandOperationalEventOccurrences = (events = [], start, end) => {
  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const expanded = [];

  for (const event of events) {
    const seriesStart = new Date(event.startAt);
    const seriesEnd = new Date(event.endAt);
    if (event.recurrence !== 'WEEKLY') {
      if (seriesStart <= rangeEnd && seriesEnd >= rangeStart) expanded.push(event);
      continue;
    }

    const duration = seriesEnd.getTime() - seriesStart.getTime();
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
      expanded.push({
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

export async function getOperationalEvents(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const events = await prisma.operationalEvent.findMany({
    where: {
      OR: [
        {
          AND: [
            { recurrence: 'WEEKLY' },
            { startAt: { lte: endDate } },
            { OR: [{ recurrenceEnd: null }, { recurrenceEnd: { gte: startDate } }] }
          ]
        },
        // Event starts within range
        { startAt: { gte: startDate, lte: endDate } },
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
  return expandOperationalEventOccurrences(events, startDate, endDate);
}

export async function syncOperationalEventToGoogle(event) {
  const targetLink = event.googleLinks?.find(link => link.isOrganizer) || event.googleLinks?.[0];
  const auth = await getAuthorizedGoogleOAuthClient(targetLink?.connectionId || event.googleConnectionId || null);
  if (!auth) return event;

  const calendar = google.calendar({ version: 'v3', auth: auth.oauth2Client });
  const calendarId = targetLink?.calendarId || auth.connection.calendarId || 'primary';
  const linkedGoogleEventId = targetLink?.googleEventId || event.googleEventId;
  const payload = toGoogleEventPayload(event, { operation: linkedGoogleEventId ? 'patch' : 'insert' });
  let googleWriteCompleted = false;

  try {
    const response = linkedGoogleEventId
      ? await calendar.events.patch({
          calendarId,
          eventId: linkedGoogleEventId,
          conferenceDataVersion: 1,
          sendUpdates: 'all',
          requestBody: payload
        }, getGooglePatchOptions(targetLink, event))
      : await calendar.events.insert({
          calendarId,
          conferenceDataVersion: 1,
          sendUpdates: 'all',
          requestBody: payload
        });

    const googleEvent = response.data;
    googleWriteCompleted = true;
    await prisma.googleCalendarEventLink.upsert({
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
    return await prisma.operationalEvent.update({
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
        meetingLink: getMeetLinkFromGoogleEvent(googleEvent) || event.meetingLink || null,
        googleMeetSpaceName: event.googleMeetSpaceName || null
      }
    });
  } catch (error) {
    const details = getGoogleErrorDetails(error);
    console.error(`[OperationalEventService] Google Calendar sync failed: ${details}`);
    if (googleWriteCompleted) {
      await prisma.operationalEvent.update({
        where: { id: event.id },
        data: {
          googleSyncStatus: 'ERROR',
          googleSyncError: `Google actualizado; metadatos pendientes: ${details}`.slice(0, 2000),
          googleLastSyncedAt: new Date()
        }
      }).catch(metadataStatusError => {
        console.error('[OperationalEventService] Failed to persist pending metadata status:', metadataStatusError?.response?.data || metadataStatusError);
      });
      const metadataError = new Error('Google Calendar se actualizó, pero quedó pendiente confirmar los metadatos locales.', { cause: error });
      metadataError.code = 'GOOGLE_SYNC_METADATA_PENDING';
      metadataError.preserveLocal = true;
      throw metadataError;
    }
    const errorCode = classifyGoogleCalendarSyncError(error);
    if (errorCode === 'GOOGLE_CALENDAR_REAUTH_REQUIRED') {
      await markGoogleCalendarReauthRequired(auth.connection);
    }
    await prisma.operationalEvent.update({
      where: { id: event.id },
      data: {
        googleSyncStatus: 'ERROR',
        googleSyncError: details.slice(0, 2000),
        googleLastSyncedAt: new Date()
      }
    });
    const syncError = new Error(`Google Calendar sync failed: ${details}`, { cause: error });
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

async function syncGoogleCalendarToOperationalEventsUnlocked({ start, end, connectionId } = {}) {
  const auth = await getAuthorizedGoogleOAuthClient(connectionId || null);
  if (!auth) {
    return { imported: 0, updated: 0, skipped: 0, connected: false };
  }

  const calendar = google.calendar({ version: 'v3', auth: auth.oauth2Client });
  const calendarId = auth.connection.calendarId || 'primary';
  const timeMin = start ? new Date(start) : new Date();
  const timeMax = end ? new Date(end) : new Date(timeMin.getTime() + 30 * 24 * 60 * 60 * 1000);

  const incrementalRequest = auth.connection.syncToken ? {
    calendarId,
    syncToken: auth.connection.syncToken,
    showDeleted: true,
    maxResults: 250
  } : null;
  const fullRequest = {
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: false,
    showDeleted: true,
    maxResults: 250
  };

  let pageResult;
  try {
    pageResult = await listAllGoogleEventPages(calendar, incrementalRequest || fullRequest);
  } catch (error) {
    if (error.code !== 'GOOGLE_SYNC_TOKEN_EXPIRED') throw error;
    await prisma.googleCalendarConnection.update({
      where: { id: auth.connection.id },
      data: { syncToken: null }
    });
    pageResult = await listAllGoogleEventPages(calendar, fullRequest);
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const teamMembers = await prisma.teamMember.findMany({ select: { id: true, email: true } });

  for (const googleEvent of pageResult.items) {
    if (googleEvent.status === 'cancelled') {
      const cancelledLink = await prisma.googleCalendarEventLink.findFirst({
        where: { connectionId: auth.connection.id, calendarId, googleEventId: googleEvent.id }
      });
      if (cancelledLink) {
        await prisma.googleCalendarEventLink.delete({ where: { id: cancelledLink.id } });
        const remainingLinks = await prisma.googleCalendarEventLink.count({ where: { operationalEventId: cancelledLink.operationalEventId } });
        if (remainingLinks === 0) await prisma.operationalEvent.delete({ where: { id: cancelledLink.operationalEventId } });
      }
      skipped += 1;
      continue;
    }

    const brainEventId = googleEvent.extendedProperties?.private?.brainOperationalEventId;
    const googleData = toOperationalEventDataFromGoogle(googleEvent, calendarId, auth.connection.id, teamMembers);
    const existingLink = await prisma.googleCalendarEventLink.findFirst({
      where: { connectionId: auth.connection.id, calendarId, googleEventId: googleEvent.id },
      include: { operationalEvent: true }
    });
    const existing = existingLink?.operationalEvent || (brainEventId
      ? await prisma.operationalEvent.findUnique({ where: { id: brainEventId } })
      : await prisma.operationalEvent.findFirst({
          where: googleEvent.iCalUID
            ? { googleICalUID: googleEvent.iCalUID }
            : { googleCalendarId: calendarId, googleConnectionId: auth.connection.id, googleEventId: googleEvent.id }
        }));

    let operationalEventId;
    if (existing) {
      await prisma.operationalEvent.update({
        where: { id: existing.id },
        data: googleData
      });
      operationalEventId = existing.id;
      updated += 1;
    } else {
      const created = await prisma.operationalEvent.create({ data: googleData });
      operationalEventId = created.id;
      imported += 1;
    }
    await prisma.googleCalendarEventLink.upsert({
      where: { connectionId_calendarId_googleEventId: { connectionId: auth.connection.id, calendarId, googleEventId: googleEvent.id } },
      create: {
        operationalEventId,
        connectionId: auth.connection.id,
        calendarId,
        googleEventId: googleEvent.id,
        googleICalUID: googleEvent.iCalUID || null,
        googleEtag: googleEvent.etag || null,
        isOrganizer: googleEvent.organizer?.email?.toLowerCase() === auth.connection.email.toLowerCase()
      },
      update: {
        operationalEventId,
        googleICalUID: googleEvent.iCalUID || null,
        googleEtag: googleEvent.etag || null,
        isOrganizer: googleEvent.organizer?.email?.toLowerCase() === auth.connection.email.toLowerCase()
      }
    });
  }

  await prisma.googleCalendarConnection.update({
    where: { id: auth.connection.id },
    data: { lastSyncedAt: new Date(), syncToken: pageResult.nextSyncToken || auth.connection.syncToken }
  });

  return { imported, updated, skipped, connected: true };
}

export function syncGoogleCalendarToOperationalEvents(options = {}) {
  return withGoogleCalendarSyncLock(options.connectionId || 'default', () => syncGoogleCalendarToOperationalEventsUnlocked(options));
}

export async function syncAllGoogleCalendars(options = {}) {
  const clients = await getAuthorizedGoogleOAuthClients();
  const results = [];
  for (const { connection } of clients) {
    try {
      results.push({ connectionId: connection.id, email: connection.email, ...(await syncGoogleCalendarToOperationalEvents({ ...options, connectionId: connection.id })) });
    } catch (error) {
      console.error(`[OperationalEventService] Error sincronizando ${connection.email}:`, error.response?.data || error.message);
      results.push({ connectionId: connection.id, email: connection.email, connected: false, error: error.message });
    }
  }
  return results;
}

export async function getOperationalEventReconciliationPreview(limit = 20) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 20);
  const where = {
    source: 'BRAIN',
    googleLinks: { none: {} },
    googleSyncStatus: { not: 'DISMISSED' }
  };
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

export async function dismissOperationalEventReconciliation(id, prismaClient = prisma) {
  return await prismaClient.operationalEvent.updateMany({
    where: { id, source: 'BRAIN', googleLinks: { none: {} } },
    data: { googleSyncStatus: 'DISMISSED', googleSyncError: null }
  });
}

export async function reconcilePendingOperationalEvents({ eventIds = [], connectionId } = {}) {
  if (!Array.isArray(eventIds) || eventIds.length === 0) throw new Error('Selecciona al menos un evento');
  if (eventIds.length > 20) throw new Error('Solo se pueden reconciliar hasta 20 eventos por operación');
  if (!connectionId) throw new Error('Selecciona la cuenta organizadora de Google');
  const auth = await getAuthorizedGoogleOAuthClient(connectionId);
  if (!auth) throw new Error('La cuenta organizadora de Google no está disponible');

  const events = await prisma.operationalEvent.findMany({
    where: {
      id: { in: [...new Set(eventIds)] },
      source: 'BRAIN',
      googleLinks: { none: {} },
      googleSyncStatus: { not: 'DISMISSED' }
    }
  });
  const results = [];
  for (const event of events) {
    try {
      const assigned = await prisma.operationalEvent.update({
        where: { id: event.id },
        data: { googleConnectionId: connectionId }
      });
      await syncOperationalEventToGoogle(assigned);
      results.push({ id: event.id, status: 'SYNCED' });
    } catch (error) {
      console.error(`[OperationalEventService] Error reconciliando ${event.id}:`, error.response?.data || error.message);
      results.push({ id: event.id, status: 'ERROR', error: getGoogleErrorDetails(error) });
    }
  }
  return {
    requested: eventIds.length,
    synced: results.filter(result => result.status === 'SYNCED').length,
    failed: results.filter(result => result.status === 'ERROR').length,
    results
  };
}

export async function renewGoogleCalendarWatchChannels() {
  const clients = await getAuthorizedGoogleOAuthClients();
  const address = `${process.env.APP_URL || 'https://labs.brainstudioagencia.com'}/api/activity/google-calendar/webhook`;
  const renewed = [];

  for (const { oauth2Client, connection } of clients) {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const activeChannel = await prisma.googleCalendarSyncChannel.findFirst({
      where: { connectionId: connection.id, expiresAt: { gt: new Date(Date.now() + 12 * 60 * 60 * 1000) } },
      orderBy: { expiresAt: 'desc' }
    });
    if (activeChannel) continue;

    const channelId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');
    const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000;
    const response = await calendar.events.watch({
      calendarId: connection.calendarId || 'primary',
      requestBody: { id: channelId, type: 'web_hook', address, token, expiration: String(expiration) }
    });
    await prisma.googleCalendarSyncChannel.create({
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
  }
  return renewed;
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

async function deleteGoogleEventIfLinked(event) {
  const targetLink = event.googleLinks?.find(link => link.isOrganizer) || event.googleLinks?.[0];
  if (!event.googleEventId && !targetLink) return;

  const auth = await getAuthorizedGoogleOAuthClient(targetLink?.connectionId || event.googleConnectionId || null);
  if (!auth) return;

  const calendar = google.calendar({ version: 'v3', auth: auth.oauth2Client });
  try {
    await calendar.events.delete({
      calendarId: targetLink?.calendarId || event.googleCalendarId || auth.connection.calendarId || 'primary',
      eventId: targetLink?.googleEventId || event.googleEventId,
      sendUpdates: 'all'
    });
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

export async function createOperationalEvent(data, createdById = null) {
  const validated = validateOperationalEventInput(data);
  const range = { startAt: validated.startAt, endAt: validated.endAt };
  const externalEmails = (data.attendeeEmails || []).filter(email => email?.toLowerCase() !== FIREFLIES_BOT_EMAIL);
  if (data.captureWithFireflies) externalEmails.push(FIREFLIES_BOT_EMAIL);
  const attendeeEmails = await normalizeAttendeeEmails(data.memberIds || [], externalEmails);
  return await createSyncedOperationalEvent({
    createLocalEvent: () => prisma.operationalEvent.create({
      data: {
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
        source: data.source || 'BRAIN',
        createdById,
        googleConnectionId: data.googleConnectionId || null,
        googleCalendarId: data.googleCalendarId || null,
        googleMeetAccessType: data.googleMeetAccessType || (data.type === 'MEETING' ? 'OPEN' : null)
      }
    }),
    syncToGoogle: syncOperationalEventToGoogle,
    deleteLocalEvent: (id) => prisma.operationalEvent.delete({ where: { id } })
  });
}

export async function updateOperationalEvent(id, data) {
  const current = await prisma.operationalEvent.findUnique({ where: { id } });
  if (!current) throw createOperationalEventError('EVENT_NOT_FOUND', 'El evento ya no existe.');
  const validated = validateOperationalEventInput(data, current);
  const range = { startAt: validated.startAt, endAt: validated.endAt };
  const memberIds = data.memberIds ?? current?.memberIds ?? [];
  const captureWithFireflies = data.captureWithFireflies ?? current?.captureWithFireflies ?? false;
  const externalEmails = (data.attendeeEmails ?? current?.attendeeEmails ?? []).filter(email => email?.toLowerCase() !== FIREFLIES_BOT_EMAIL);
  if (captureWithFireflies) externalEmails.push(FIREFLIES_BOT_EMAIL);
  const attendeeEmails = await normalizeAttendeeEmails(memberIds, externalEmails);
  return await updateSyncedOperationalEvent({
    updateLocalEvent: async () => {
      const event = await prisma.operationalEvent.update({
        where: { id },
        data: {
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
  syncToGoogle = syncOperationalEventToGoogle
} = {}) {
  const event = await findEvent(id);
  if (!event) throw createOperationalEventError('EVENT_NOT_FOUND', 'El evento ya no existe.');
  const candidate = connectionId && !event.googleLinks?.length
    ? { ...event, googleConnectionId: connectionId }
    : event;
  return await syncToGoogle(candidate);
}

export async function deleteOperationalEvent(id) {
  const event = await prisma.operationalEvent.findUnique({ where: { id }, include: { googleLinks: true } });
  if (event) {
    try {
      await deleteGoogleEventIfLinked(event);
    } catch (error) {
      const details = getGoogleErrorDetails(error);
      console.error(`[OperationalEventService] Google Calendar delete failed: ${details}`);
      throw new Error(`Google Calendar delete failed: ${details}`);
    }
  }

  return await prisma.operationalEvent.delete({
    where: { id }
  });
}
