import prisma from '../lib/prisma.js';
import { getAuthorizedGoogleOAuthClient } from './googleCalendarOAuthService.js';

const MEET_API_BASE_URL = 'https://meet.googleapis.com/v2';
const DEFAULT_ONLY_BOT_GRACE_MS = 2 * 60 * 1000;

const getMeetingCode = meetingLink => {
  try {
    const url = new URL(meetingLink);
    return url.hostname === 'meet.google.com' ? url.pathname.split('/').filter(Boolean)[0] || null : null;
  } catch {
    return null;
  }
};

const readGoogleError = async response => {
  const payload = await response.json().catch(() => ({}));
  return payload.error?.message || 'Google Meet no pudo procesar la conferencia';
};

const getParticipantDisplayName = participant => (
  participant.signedinUser?.displayName || participant.anonymousUser?.displayName || participant.phoneUser?.displayName || ''
);

const isFirefliesParticipant = participant => {
  const name = getParticipantDisplayName(participant).toLowerCase();
  return name.includes('fireflies') || name === 'fred' || name.startsWith('fred ');
};

export const evaluateMeetAutoCloseState = ({ participants = [], onlyBotSince = null, now = new Date(), graceMs = DEFAULT_ONLY_BOT_GRACE_MS }) => {
  const activeParticipants = participants.filter(participant => !participant.latestEndTime);
  const activeBots = activeParticipants.filter(isFirefliesParticipant);
  const activeHumans = activeParticipants.filter(participant => !isFirefliesParticipant(participant));
  const hadHumanParticipants = participants.some(participant => !isFirefliesParticipant(participant));
  if (activeHumans.length > 0) return { action: 'RESET' };
  if (!hadHumanParticipants || activeBots.length === 0) return { action: 'IGNORE' };
  if (!onlyBotSince) return { action: 'ARM', onlyBotSince: now };
  if (now.getTime() - new Date(onlyBotSince).getTime() < graceMs) return { action: 'WAIT' };
  return { action: 'CLOSE' };
};

const defaultGetAccessToken = async oauth2Client => {
  const accessToken = await oauth2Client.getAccessToken();
  return typeof accessToken === 'string' ? accessToken : accessToken?.token;
};

const getAuthorizedMeetContext = async (event, { getAuth, getAccessToken }) => {
  const organizerLink = event.googleLinks?.find(link => link.isOrganizer) || event.googleLinks?.[0];
  const auth = await getAuth(organizerLink?.connectionId || event.googleConnectionId || null);
  if (!auth) throw new Error('La cuenta organizadora de Google no está conectada');
  const token = await getAccessToken(auth.oauth2Client);
  if (!token) throw new Error('Google no devolvió un token de acceso válido');
  return { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
};

const resolveMeetSpace = async (event, { db, request, headers }) => {
  const meetingCode = getMeetingCode(event.meetingLink);
  const resource = event.googleMeetSpaceName || (meetingCode ? `spaces/${meetingCode}` : null);
  if (!resource) throw new Error('No se pudo identificar el espacio de Google Meet');
  const response = await request(`${MEET_API_BASE_URL}/${resource}`, { method: 'GET', headers });
  if (!response.ok) throw new Error(await readGoogleError(response));
  const space = await response.json();
  if (space.name && space.name !== event.googleMeetSpaceName) {
    await db.operationalEvent.update({ where: { id: event.id }, data: { googleMeetSpaceName: space.name } });
  }
  return space;
};

const listConferenceParticipants = async (conferenceRecordName, { request, headers }) => {
  const participants = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({ pageSize: '250' });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await request(`${MEET_API_BASE_URL}/${conferenceRecordName}/participants?${params}`, { method: 'GET', headers });
    if (!response.ok) throw new Error(await readGoogleError(response));
    const payload = await response.json();
    participants.push(...(payload.participants || []));
    pageToken = payload.nextPageToken || null;
  } while (pageToken);
  return participants;
};

export async function endGoogleMeetConference(eventId, dependencies = {}) {
  const db = dependencies.db || prisma;
  const getAuth = dependencies.getAuth || getAuthorizedGoogleOAuthClient;
  const request = dependencies.request || ((url, options) => fetch(url, options));
  const getAccessToken = dependencies.getAccessToken || defaultGetAccessToken;
  const event = await db.operationalEvent.findUnique({ where: { id: eventId }, include: { googleLinks: true } });
  if (!event) throw new Error('El evento no existe');
  if (event.type !== 'MEETING' || !event.meetingLink) throw new Error('El evento no tiene una reunión de Google Meet');
  const { headers } = await getAuthorizedMeetContext(event, { getAuth, getAccessToken });
  const space = event.googleMeetSpaceName ? { name: event.googleMeetSpaceName } : await resolveMeetSpace(event, { db, request, headers });
  if (!space.name) throw new Error('Google Meet no devolvió el identificador del espacio');
  const response = await request(`${MEET_API_BASE_URL}/${space.name}:endActiveConference`, { method: 'POST', headers, body: JSON.stringify({}) });
  if (!response.ok) throw new Error(await readGoogleError(response));
  await db.operationalEvent.update({ where: { id: event.id }, data: { googleMeetEndedAt: new Date(), googleMeetOnlyBotSince: null, googleMeetSpaceName: space.name } });
  return { ended: true, spaceName: space.name };
}

export async function autoCloseFinishedFirefliesMeetings(dependencies = {}) {
  const db = dependencies.db || prisma;
  const getAuth = dependencies.getAuth || getAuthorizedGoogleOAuthClient;
  const request = dependencies.request || ((url, options) => fetch(url, options));
  const getAccessToken = dependencies.getAccessToken || defaultGetAccessToken;
  const now = dependencies.now || new Date();
  const events = await db.operationalEvent.findMany({
    where: {
      type: 'MEETING', captureWithFireflies: true, meetingLink: { not: null }, googleMeetEndedAt: null,
      startAt: { lte: now, gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
    },
    include: { googleLinks: true }
  });
  const results = [];
  for (const event of events) {
    try {
      const { headers } = await getAuthorizedMeetContext(event, { getAuth, getAccessToken });
      const space = await resolveMeetSpace(event, { db, request, headers });
      const conferenceRecordName = space.activeConference?.conferenceRecord;
      if (!conferenceRecordName) continue;
      const participants = await listConferenceParticipants(conferenceRecordName, { request, headers });
      const state = evaluateMeetAutoCloseState({ participants, onlyBotSince: event.googleMeetOnlyBotSince, now, graceMs: dependencies.graceMs });
      if (state.action === 'ARM') await db.operationalEvent.update({ where: { id: event.id }, data: { googleMeetOnlyBotSince: state.onlyBotSince } });
      if (state.action === 'RESET' && event.googleMeetOnlyBotSince) await db.operationalEvent.update({ where: { id: event.id }, data: { googleMeetOnlyBotSince: null } });
      if (state.action === 'CLOSE') await endGoogleMeetConference(event.id, { db, getAuth, request, getAccessToken });
      results.push({ eventId: event.id, action: state.action });
    } catch (error) {
      console.error(`[Google Meet] No se pudo evaluar el cierre automático de ${event.id}:`, error.response?.data || error.message);
      results.push({ eventId: event.id, action: 'ERROR', error: error.message });
    }
  }
  return results;
}
