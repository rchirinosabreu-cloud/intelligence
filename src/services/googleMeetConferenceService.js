import prisma from '../lib/prisma.js';
import { getAuthorizedGoogleOAuthClient } from './googleCalendarOAuthService.js';

const MEET_API_BASE_URL = 'https://meet.googleapis.com/v2';

const getMeetingCode = meetingLink => {
  if (!meetingLink) return null;
  try {
    const url = new URL(meetingLink);
    if (url.hostname !== 'meet.google.com') return null;
    return url.pathname.split('/').filter(Boolean)[0] || null;
  } catch {
    return null;
  }
};

const readGoogleError = async response => {
  const payload = await response.json().catch(() => ({}));
  return payload.error?.message || 'Google Meet no pudo finalizar la conferencia';
};

export async function endGoogleMeetConference(eventId, dependencies = {}) {
  const db = dependencies.db || prisma;
  const getAuth = dependencies.getAuth || getAuthorizedGoogleOAuthClient;
  const request = dependencies.request || (async (url, options) => fetch(url, options));
  const getAccessToken = dependencies.getAccessToken || (async oauth2Client => {
    const accessToken = await oauth2Client.getAccessToken();
    return typeof accessToken === 'string' ? accessToken : accessToken?.token;
  });
  const event = await db.operationalEvent.findUnique({ where: { id: eventId }, include: { googleLinks: true } });
  if (!event) throw new Error('El evento no existe');
  if (event.type !== 'MEETING' || !event.meetingLink) throw new Error('El evento no tiene una reunión de Google Meet');

  const organizerLink = event.googleLinks?.find(link => link.isOrganizer) || event.googleLinks?.[0];
  const auth = await getAuth(organizerLink?.connectionId || event.googleConnectionId || null);
  if (!auth) throw new Error('La cuenta organizadora de Google no está conectada');
  const token = await getAccessToken(auth.oauth2Client);
  if (!token) throw new Error('Google no devolvió un token de acceso válido');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  let spaceName = event.googleMeetSpaceName;
  if (!spaceName) {
    const meetingCode = getMeetingCode(event.meetingLink);
    if (!meetingCode) throw new Error('No se pudo identificar el espacio de Google Meet');
    const lookup = await request(`${MEET_API_BASE_URL}/spaces/${encodeURIComponent(meetingCode)}`, { method: 'GET', headers });
    if (!lookup.ok) throw new Error(await readGoogleError(lookup));
    const space = await lookup.json();
    spaceName = space.name;
    if (!spaceName) throw new Error('Google Meet no devolvió el identificador del espacio');
    await db.operationalEvent.update({ where: { id: event.id }, data: { googleMeetSpaceName: spaceName } });
  }

  const response = await request(`${MEET_API_BASE_URL}/${spaceName}:endActiveConference`, {
    method: 'POST', headers, body: JSON.stringify({})
  });
  if (!response.ok) throw new Error(await readGoogleError(response));
  return { ended: true, spaceName };
}
