import prisma from '../lib/prisma.js';
import { google } from 'googleapis';
import {
  getAuthorizedGoogleOAuthClient,
  CENTRAL_GOOGLE_CALENDAR_EMAIL,
  isGoogleOAuthReauthError,
  markGoogleCalendarReauthRequired
} from './googleCalendarOAuthService.js';

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

const formatGoogleDateTimeInBogota = (value) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date(value)).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
};

const formatGoogleDate = (value) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date(value));

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

const googleAllDayEndToInclusiveDate = (date) => new Date(
  new Date(`${date}T00:00:00.000-05:00`).getTime() - 1
);

const getExclusiveAllDayEndDate = (value) => {
  const nextDay = new Date(value);
  nextDay.setDate(nextDay.getDate() + 1);
  return formatGoogleDate(nextDay);
};

const isAllDayRange = (startAt, endAt) => {
  const start = new Date(startAt);
  const end = new Date(endAt);
  return start.getHours() === 0 && start.getMinutes() === 0 &&
    end.getHours() === 23 && end.getMinutes() === 59;
};

const getMeetLinkFromGoogleEvent = (event) => {
  if (event.hangoutLink) return event.hangoutLink;
  const videoEntry = event.conferenceData?.entryPoints?.find(entry => entry.entryPointType === 'video');
  return videoEntry?.uri || null;
};

const mapGoogleEventType = (event) => {
  const summary = (event.summary || '').toLowerCase();
  if (getMeetLinkFromGoogleEvent(event) || summary.includes('meet') || summary.includes('reuni')) return 'MEETING';
  if (summary.includes('permiso') || summary.includes('ausencia')) return 'ABSENCE';
  if (summary.includes('producci')) return 'PRODUCTION';
  if (summary.includes('descanso') || summary.includes('cafe') || summary.includes('café')) return 'BREAK';
  return 'PROJECT';
};

const toOperationalEventDataFromGoogle = (event, calendarId) => ({
  title: event.summary || 'Evento de Google Calendar',
  type: mapGoogleEventType(event),
  description: decodeGoogleDescription(event.description),
  startAt: new Date(event.start?.dateTime || `${event.start?.date}T00:00:00.000-05:00`),
  endAt: event.end?.dateTime ? new Date(event.end.dateTime) : googleAllDayEndToInclusiveDate(event.end?.date),
  memberIds: [],
  recurrence: 'NONE',
  recurrenceEnd: null,
  meetingLink: getMeetLinkFromGoogleEvent(event),
  source: 'GOOGLE',
  organizerEmail: event.organizer?.email || null,
  googleCalendarId: calendarId,
  googleEventId: event.id,
  googleICalUID: event.iCalUID,
  googleEtag: event.etag,
  googleHtmlLink: event.htmlLink,
  googleUpdatedAt: event.updated ? new Date(event.updated) : null,
  googleLastSyncedAt: new Date(),
  googleSyncStatus: 'SYNCED'
});

const toGoogleEventPayload = (event) => ({
  summary: event.title,
  description: event.description || '',
  start: isAllDayRange(event.startAt, event.endAt)
    ? { date: formatGoogleDate(event.startAt) }
    : { dateTime: formatGoogleDateTimeInBogota(event.startAt), timeZone: 'America/Bogota' },
  end: isAllDayRange(event.startAt, event.endAt)
    ? { date: getExclusiveAllDayEndDate(event.endAt) }
    : { dateTime: formatGoogleDateTimeInBogota(event.endAt), timeZone: 'America/Bogota' },
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

export async function getOperationalEvents(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  return await prisma.operationalEvent.findMany({
    where: {
      OR: [
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
}

export async function syncOperationalEventToGoogle(event) {
  const auth = await getAuthorizedGoogleOAuthClient();
  if (!auth) return event;

  const calendar = google.calendar({ version: 'v3', auth: auth.oauth2Client });
  const calendarId = auth.connection.calendarId || 'primary';
  const payload = toGoogleEventPayload(event);

  try {
    const response = event.googleEventId
      ? await calendar.events.patch({
          calendarId,
          eventId: event.googleEventId,
          conferenceDataVersion: 1,
          requestBody: payload
        })
      : await calendar.events.insert({
          calendarId,
          conferenceDataVersion: 1,
          sendUpdates: 'none',
          requestBody: payload
        });

    const googleEvent = response.data;
    return await prisma.operationalEvent.update({
      where: { id: event.id },
      data: {
        source: event.source || 'BRAIN',
        organizerEmail: googleEvent.organizer?.email || CENTRAL_GOOGLE_CALENDAR_EMAIL,
        googleCalendarId: calendarId,
        googleEventId: googleEvent.id,
        googleICalUID: googleEvent.iCalUID,
        googleEtag: googleEvent.etag,
        googleHtmlLink: googleEvent.htmlLink,
        googleUpdatedAt: googleEvent.updated ? new Date(googleEvent.updated) : null,
        googleLastSyncedAt: new Date(),
        googleSyncStatus: 'SYNCED',
        meetingLink: getMeetLinkFromGoogleEvent(googleEvent) || event.meetingLink || null
      }
    });
  } catch (error) {
    const details = getGoogleErrorDetails(error);
    console.error(`[OperationalEventService] Google Calendar sync failed: ${details}`);
    if (isGoogleOAuthReauthError(error)) {
      await markGoogleCalendarReauthRequired(auth.connection);
    }
    const syncError = new Error(`Google Calendar sync failed: ${details}`, { cause: error });
    if (isGoogleOAuthReauthError(error)) {
      syncError.code = 'GOOGLE_CALENDAR_REAUTH_REQUIRED';
      syncError.reconnectRequired = true;
    }
    throw syncError;
  }
}

export async function syncGoogleCalendarToOperationalEvents({ start, end } = {}) {
  const auth = await getAuthorizedGoogleOAuthClient();
  if (!auth) {
    return { imported: 0, updated: 0, skipped: 0, connected: false };
  }

  const calendar = google.calendar({ version: 'v3', auth: auth.oauth2Client });
  const calendarId = auth.connection.calendarId || 'primary';
  const timeMin = start ? new Date(start) : new Date();
  const timeMax = end ? new Date(end) : new Date(timeMin.getTime() + 30 * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250
  });

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const googleEvent of response.data.items || []) {
    if (googleEvent.status === 'cancelled') {
      skipped += 1;
      continue;
    }

    const brainEventId = googleEvent.extendedProperties?.private?.brainOperationalEventId;
    const googleData = toOperationalEventDataFromGoogle(googleEvent, calendarId);
    const existing = brainEventId
      ? await prisma.operationalEvent.findUnique({ where: { id: brainEventId } })
      : await prisma.operationalEvent.findFirst({
          where: {
            googleCalendarId: calendarId,
            googleEventId: googleEvent.id
          }
        });

    if (existing) {
      await prisma.operationalEvent.update({
        where: { id: existing.id },
        data: googleData
      });
      updated += 1;
    } else {
      await prisma.operationalEvent.create({ data: googleData });
      imported += 1;
    }
  }

  await prisma.googleCalendarConnection.update({
    where: { id: auth.connection.id },
    data: { lastSyncedAt: new Date() }
  });

  return { imported, updated, skipped, connected: true };
}

async function deleteGoogleEventIfLinked(event) {
  if (!event.googleEventId) return;

  const auth = await getAuthorizedGoogleOAuthClient();
  if (!auth) return;

  const calendar = google.calendar({ version: 'v3', auth: auth.oauth2Client });
  try {
    await calendar.events.delete({
      calendarId: event.googleCalendarId || auth.connection.calendarId || 'primary',
      eventId: event.googleEventId,
      sendUpdates: 'none'
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
    try {
      await deleteLocalEvent(event.id);
    } catch (cleanupError) {
      console.error('[OperationalEventService] Failed to rollback local event:', cleanupError?.response?.data || cleanupError);
    }
    throw error;
  }
};

export async function createOperationalEvent(data, createdById = null) {
  return await createSyncedOperationalEvent({
    createLocalEvent: () => prisma.operationalEvent.create({
      data: {
        title: data.title,
        type: data.type,
        description: data.description,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        memberIds: data.memberIds || [],
        recurrence: data.recurrence || 'NONE',
        recurrenceEnd: data.recurrenceEnd ? new Date(data.recurrenceEnd) : null,
        meetingLink: data.meetingLink || null,
        source: data.source || 'BRAIN',
        createdById,
        googleMeetAccessType: data.googleMeetAccessType || (data.type === 'MEETING' ? 'OPEN' : null)
      }
    }),
    syncToGoogle: syncOperationalEventToGoogle,
    deleteLocalEvent: (id) => prisma.operationalEvent.delete({ where: { id } })
  });
}

export async function updateOperationalEvent(id, data) {
  const event = await prisma.operationalEvent.update({
    where: { id },
    data: {
      title: data.title,
      type: data.type,
      description: data.description,
      startAt: data.startAt ? new Date(data.startAt) : undefined,
      endAt: data.endAt ? new Date(data.endAt) : undefined,
      memberIds: data.memberIds,
      recurrence: data.recurrence,
      recurrenceEnd: data.recurrenceEnd ? new Date(data.recurrenceEnd) : null,
      meetingLink: data.meetingLink,
      googleMeetAccessType: data.googleMeetAccessType
    }
  });

  return await syncOperationalEventToGoogle(event);
}

export async function deleteOperationalEvent(id) {
  const event = await prisma.operationalEvent.findUnique({ where: { id } });
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
