import { google } from 'googleapis';
import prisma from '../lib/prisma.js';
import { encrypt, decrypt } from '../utils/encryption.js';

export const CENTRAL_GOOGLE_CALENDAR_EMAIL = process.env.GOOGLE_CALENDAR_ACCOUNT_EMAIL || 'coordinadorbrainstudio@gmail.com';
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/meetings.space.created'
];

const getRedirectUri = () => (
  process.env.GOOGLE_CALENDAR_OAUTH_REDIRECT_URI ||
  `${process.env.APP_URL || 'http://localhost:3000'}/google-calendar/callback`
);

export const getOAuthClient = () => {
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials are not configured');
  }

  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    getRedirectUri()
  );
};

export const getGoogleCalendarAuthUrl = () => {
  const oauth2Client = getOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: DEFAULT_SCOPES,
    include_granted_scopes: true
  });
};

export const isGoogleOAuthReauthError = (error) => {
  const payload = error?.response?.data || {};
  return payload.error === 'invalid_grant' ||
    error?.code === 'invalid_grant' ||
    error?.code === 'GOOGLE_CALENDAR_REAUTH_REQUIRED' ||
    /token has been expired or revoked|invalid_grant/i.test(error?.message || '') ||
    (error?.cause ? isGoogleOAuthReauthError(error.cause) : false);
};

export const markGoogleCalendarReauthRequired = async (connection = null, prismaClient = prisma) => {
  const connectionId = typeof connection === 'string' ? connection : connection?.id;
  await prismaClient.googleCalendarConnection.updateMany({
    where: connectionId ? { id: connectionId } : { email: CENTRAL_GOOGLE_CALENDAR_EMAIL },
    data: { isActive: false, syncToken: null }
  });
};

const createGoogleCalendarReauthError = (cause) => {
  const error = new Error('La autorizacion de Google vencio o fue revocada. Vuelve a conectar la cuenta.', { cause });
  error.code = 'GOOGLE_CALENDAR_REAUTH_REQUIRED';
  error.reconnectRequired = true;
  return error;
};

export const authorizeGoogleCalendarConnections = async (connections, {
  createOAuthClient = () => getOAuthClient(),
  decryptTokens = decrypt,
  markReauthRequired = markGoogleCalendarReauthRequired
} = {}) => {
  let lastReauthError = null;

  for (const connection of connections) {
    const oauth2Client = createOAuthClient(connection);
    oauth2Client.setCredentials(JSON.parse(decryptTokens(connection.encryptedTokens)));

    try {
      await oauth2Client.getAccessToken();
      return { oauth2Client, connection };
    } catch (error) {
      if (!isGoogleOAuthReauthError(error)) throw error;
      lastReauthError = error;
      await markReauthRequired(connection);
    }
  }

  if (lastReauthError) throw createGoogleCalendarReauthError(lastReauthError);
  return null;
};

export const storeGoogleCalendarOAuthCode = async (code, connectedById = null) => {
  if (!code) throw new Error('Missing Google OAuth code');

  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);

  const existing = await prisma.googleCalendarConnection.findUnique({
    where: { email: CENTRAL_GOOGLE_CALENDAR_EMAIL }
  });

  const mergedTokens = {
    ...(existing ? JSON.parse(decrypt(existing.encryptedTokens)) : {}),
    ...tokens
  };

  return await prisma.googleCalendarConnection.upsert({
    where: { email: CENTRAL_GOOGLE_CALENDAR_EMAIL },
    create: {
      email: CENTRAL_GOOGLE_CALENDAR_EMAIL,
      calendarId: 'primary',
      encryptedTokens: encrypt(JSON.stringify(mergedTokens)),
      scopes: DEFAULT_SCOPES,
      connectedById,
      isActive: true
    },
    update: {
      encryptedTokens: encrypt(JSON.stringify(mergedTokens)),
      scopes: DEFAULT_SCOPES,
      connectedById,
      connectedAt: new Date(),
      isActive: true
    },
    select: {
      id: true,
      email: true,
      calendarId: true,
      scopes: true,
      isActive: true,
      connectedAt: true,
      lastSyncedAt: true
    }
  });
};

export const getCentralGoogleCalendarConnection = async () => {
  const connections = await prisma.googleCalendarConnection.findMany({
    where: { isActive: true },
    orderBy: [
      { lastSyncedAt: { sort: 'desc', nulls: 'last' } },
      { connectedAt: 'desc' }
    ],
    take: 1
  });
  return connections[0] || null;
};

export const getAuthorizedGoogleOAuthClient = async () => {
  const connections = await prisma.googleCalendarConnection.findMany({
    where: { isActive: true },
    orderBy: [
      { lastSyncedAt: { sort: 'desc', nulls: 'last' } },
      { connectedAt: 'desc' }
    ]
  });
  return await authorizeGoogleCalendarConnections(connections);
};

export const getCentralGoogleCalendarConnectionStatus = async () => {
  const connection = await getCentralGoogleCalendarConnection();
  if (!connection) {
    return {
      connected: false,
      email: CENTRAL_GOOGLE_CALENDAR_EMAIL
    };
  }

  return {
    connected: true,
    id: connection.id,
    email: connection.email,
    calendarId: connection.calendarId,
    scopes: connection.scopes,
    connectedAt: connection.connectedAt,
    lastSyncedAt: connection.lastSyncedAt
  };
};

export const listAccessibleGoogleCalendars = async () => {
  const auth = await getAuthorizedGoogleOAuthClient();
  if (!auth) return [];

  const calendar = google.calendar({ version: 'v3', auth: auth.oauth2Client });
  const response = await calendar.calendarList.list({
    minAccessRole: 'reader',
    showHidden: false
  });

  return (response.data.items || []).map(item => ({
    id: item.id,
    summary: item.summary,
    description: item.description,
    primary: item.primary === true,
    accessRole: item.accessRole,
    backgroundColor: item.backgroundColor,
    selected: item.id === auth.connection.calendarId || (item.primary && auth.connection.calendarId === 'primary')
  }));
};

export const setActiveGoogleCalendar = async (calendarId) => {
  if (!calendarId) throw new Error('calendarId is required');

  const connection = await getCentralGoogleCalendarConnection();
  if (!connection) throw new Error('Google Calendar is not connected');

  return await prisma.googleCalendarConnection.update({
    where: { id: connection.id },
    data: {
      calendarId,
      syncToken: null,
      lastSyncedAt: null
    },
    select: {
      id: true,
      email: true,
      calendarId: true,
      scopes: true,
      isActive: true,
      connectedAt: true,
      lastSyncedAt: true
    }
  });
};

export const createOpenGoogleMeetSpace = async () => {
  const auth = await getAuthorizedGoogleOAuthClient();
  if (!auth) return null;

  const accessToken = await auth.oauth2Client.getAccessToken();
  const token = typeof accessToken === 'string' ? accessToken : accessToken?.token;
  if (!token) throw new Error('Google OAuth access token is not available');

  const response = await fetch('https://meet.googleapis.com/v2/spaces', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      config: {
        accessType: 'OPEN',
        entryPointAccess: 'ALL'
      }
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || 'Failed to create Google Meet space');
  }

  return await response.json();
};
