import prisma from '../lib/prisma.js';
import { google } from 'googleapis';
import { getAuthorizedGoogleOAuthClient, getAuthorizedGoogleOAuthClients, CENTRAL_GOOGLE_CALENDAR_EMAIL } from './googleCalendarOAuthService.js';
import crypto from 'crypto';

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

const normalizeAttendeeEmails = async (memberIds = [], externalEmails = []) => {
  const members = memberIds.length
    ? await prisma.teamMember.findMany({ where: { id: { in: memberIds } }, select: { email: true } })
    : [];
  return [...new Set([...externalEmails, ...members.map(member => member.email)]
    .map(email => email?.trim().toLowerCase())
    .filter(email => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
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

const toOperationalEventDataFromGoogle = (event, calendarId, connectionId) => ({
  title: event.summary || 'Evento de Google Calendar',
  type: mapGoogleEventType(event),
  description: event.description || null,
  startAt: new Date(event.start?.dateTime || `${event.start?.date}T00:00:00.000-05:00`),
  endAt: new Date(event.end?.dateTime || `${event.end?.date}T23:59:59.000-05:00`),
  memberIds: [],
  recurrence: 'NONE',
  recurrenceEnd: null,
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
  googleSyncStatus: 'SYNCED'
});

const toGoogleEventPayload = (event) => ({
  summary: event.title,
  description: event.description || '',
  start: { dateTime: formatGoogleDateTimeInBogota(event.startAt), timeZone: 'America/Bogota' },
  end: { dateTime: formatGoogleDateTimeInBogota(event.endAt), timeZone: 'America/Bogota' },
  attendees: event.attendeeEmails.map(email => ({ email })),
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
  const targetLink = event.googleLinks?.find(link => link.isOrganizer) || event.googleLinks?.[0];
  const auth = await getAuthorizedGoogleOAuthClient(targetLink?.connectionId || event.googleConnectionId || null);
  if (!auth) return event;

  const calendar = google.calendar({ version: 'v3', auth: auth.oauth2Client });
  const calendarId = targetLink?.calendarId || auth.connection.calendarId || 'primary';
  const payload = toGoogleEventPayload(event);

  try {
    const linkedGoogleEventId = targetLink?.googleEventId || event.googleEventId;
    const response = linkedGoogleEventId
      ? await calendar.events.patch({
          calendarId,
          eventId: linkedGoogleEventId,
          conferenceDataVersion: 1,
          sendUpdates: 'all',
          requestBody: payload
        })
      : await calendar.events.insert({
          calendarId,
          conferenceDataVersion: 1,
          sendUpdates: 'all',
          requestBody: payload
        });

    const googleEvent = response.data;
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
        meetingLink: getMeetLinkFromGoogleEvent(googleEvent) || event.meetingLink || null
      }
    });
  } catch (error) {
    const details = getGoogleErrorDetails(error);
    console.error(`[OperationalEventService] Google Calendar sync failed: ${details}`);
    await prisma.operationalEvent.update({
      where: { id: event.id },
      data: {
        googleSyncStatus: 'ERROR',
        googleLastSyncedAt: new Date()
      }
    });
    throw new Error(`Google Calendar sync failed: ${details}`);
  }
}

export async function syncGoogleCalendarToOperationalEvents({ start, end, connectionId } = {}) {
  const auth = await getAuthorizedGoogleOAuthClient(connectionId || null);
  if (!auth) {
    return { imported: 0, updated: 0, skipped: 0, connected: false };
  }

  const calendar = google.calendar({ version: 'v3', auth: auth.oauth2Client });
  const calendarId = auth.connection.calendarId || 'primary';
  const timeMin = start ? new Date(start) : new Date();
  const timeMax = end ? new Date(end) : new Date(timeMin.getTime() + 30 * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list(auth.connection.syncToken ? {
    calendarId,
    syncToken: auth.connection.syncToken,
    showDeleted: true,
    maxResults: 250
  } : {
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    showDeleted: true,
    maxResults: 250
  });

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const googleEvent of response.data.items || []) {
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
    const googleData = toOperationalEventDataFromGoogle(googleEvent, calendarId, auth.connection.id);
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
    data: { lastSyncedAt: new Date(), syncToken: response.data.nextSyncToken || auth.connection.syncToken }
  });

  return { imported, updated, skipped, connected: true };
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

export async function handleGoogleCalendarWebhook(headers = {}) {
  const channelId = headers['x-goog-channel-id'];
  const token = headers['x-goog-channel-token'];
  const resourceState = headers['x-goog-resource-state'];
  if (!channelId || !token) return { accepted: false };
  const channel = await prisma.googleCalendarSyncChannel.findFirst({
    where: { channelId, token, expiresAt: { gt: new Date() } }
  });
  if (!channel) return { accepted: false };
  if (resourceState !== 'sync') {
    await syncGoogleCalendarToOperationalEvents({ connectionId: channel.connectionId });
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

export async function createOperationalEvent(data, createdById = null) {
  const attendeeEmails = await normalizeAttendeeEmails(data.memberIds || [], data.attendeeEmails || []);
  const event = await prisma.operationalEvent.create({
    data: {
      title: data.title,
      type: data.type,
      description: data.description,
      startAt: new Date(data.startAt),
      endAt: new Date(data.endAt),
      memberIds: data.memberIds || [],
      attendeeEmails,
      attendeeResponses: {},
      recurrence: data.recurrence || 'NONE',
      recurrenceEnd: data.recurrenceEnd ? new Date(data.recurrenceEnd) : null,
      meetingLink: data.meetingLink || null,
      source: data.source || 'BRAIN',
      createdById,
      googleConnectionId: data.googleConnectionId || null,
      googleCalendarId: data.googleCalendarId || null,
      googleMeetAccessType: data.googleMeetAccessType || (data.type === 'MEETING' ? 'OPEN' : null)
    }
  });

  return await syncOperationalEventToGoogle(event);
}

export async function updateOperationalEvent(id, data) {
  const current = await prisma.operationalEvent.findUnique({ where: { id } });
  const memberIds = data.memberIds ?? current?.memberIds ?? [];
  const attendeeEmails = await normalizeAttendeeEmails(memberIds, data.attendeeEmails ?? current?.attendeeEmails ?? []);
  const event = await prisma.operationalEvent.update({
    where: { id },
    data: {
      title: data.title,
      type: data.type,
      description: data.description,
      startAt: data.startAt ? new Date(data.startAt) : undefined,
      endAt: data.endAt ? new Date(data.endAt) : undefined,
      memberIds: data.memberIds,
      attendeeEmails,
      recurrence: data.recurrence,
      recurrenceEnd: data.recurrenceEnd ? new Date(data.recurrenceEnd) : null,
      meetingLink: data.meetingLink,
      googleMeetAccessType: data.googleMeetAccessType
    }
  });

  const eventWithLinks = await prisma.operationalEvent.findUnique({ where: { id: event.id }, include: { googleLinks: true } });
  return await syncOperationalEventToGoogle(eventWithLinks);
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
