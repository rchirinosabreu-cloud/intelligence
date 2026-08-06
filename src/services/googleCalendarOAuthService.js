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
  return await prisma.googleCalendarConnection.findFirst({
    where: {
      email: CENTRAL_GOOGLE_CALENDAR_EMAIL,
      isActive: true
    }
  });
};

export const getAuthorizedGoogleOAuthClient = async () => {
  const connection = await getCentralGoogleCalendarConnection();
  if (!connection) return null;

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(JSON.parse(decrypt(connection.encryptedTokens)));
  return { oauth2Client, connection };
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
