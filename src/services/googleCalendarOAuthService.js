import { google } from 'googleapis';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { withCalendarSyncLock, googleCalendarRequestOptions } from './calendarSyncLock.js';

export const CENTRAL_GOOGLE_CALENDAR_EMAIL = process.env.GOOGLE_CALENDAR_ACCOUNT_EMAIL || 'coordinadorbrainstudio@gmail.com';
const DEFAULT_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/userinfo.email',
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
  return new google.auth.OAuth2({ clientId: process.env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri: getRedirectUri(), transporterOptions: googleCalendarRequestOptions() });
};

export const isGoogleOAuthReauthError = (error) => {
  const payload = error?.response?.data || {};
  return payload.error === 'invalid_grant' ||
    Number(error?.response?.status || error?.code) === 401 ||
    error?.code === 'invalid_grant' ||
    error?.code === 'GOOGLE_CALENDAR_REAUTH_REQUIRED' ||
    /token has been expired or revoked|invalid_grant/i.test(error?.message || '') ||
    (error?.cause ? isGoogleOAuthReauthError(error.cause) : false);
};

export const markGoogleCalendarReauthRequired = async (connection = null, prismaClient = prisma) => {
  const connectionId = typeof connection === 'string' ? connection : connection?.id;
  await prismaClient.googleCalendarConnection.updateMany({
    where: connectionId ? { id: connectionId, ...(connection?.encryptedTokens ? { encryptedTokens: connection.encryptedTokens } : {}) } : { email: CENTRAL_GOOGLE_CALENDAR_EMAIL },
    data: { isActive: false, syncToken: null }
  });
};

export const persistGoogleCalendarTokens = async (connection, tokens, prismaClient = prisma) => {
  const encryptedTokens = encrypt(JSON.stringify(tokens));
  const result = await prismaClient.googleCalendarConnection.updateMany({
    where: { id: connection.id, encryptedTokens: connection.encryptedTokens, isActive: true },
    data: { encryptedTokens }
  });
  if (result.count) connection.encryptedTokens = encryptedTokens;
};

const ACTIVE_CONNECTION_ORDER = [
  { lastSyncedAt: { sort: 'desc', nulls: 'last' } },
  { connectedAt: 'desc' }
];

export const orderGoogleCalendarConnections = connections => [...connections].sort((left, right) => {
  const centralFirst = Number(right.email?.toLowerCase() === CENTRAL_GOOGLE_CALENDAR_EMAIL.toLowerCase()) - Number(left.email?.toLowerCase() === CENTRAL_GOOGLE_CALENDAR_EMAIL.toLowerCase());
  return centralFirst || String(left.email).localeCompare(String(right.email)) || String(left.id).localeCompare(String(right.id));
});

const createGoogleCalendarReauthError = (cause) => {
  const error = new Error('La autorización de Google venció o fue revocada. Vuelve a conectar la cuenta.', { cause });
  error.code = 'GOOGLE_CALENDAR_REAUTH_REQUIRED';
  error.reconnectRequired = true;
  return error;
};

export const authorizeGoogleCalendarConnections = async (connections, {
  createOAuthClient = () => getOAuthClient(),
  decryptTokens = decrypt,
  markReauthRequired = markGoogleCalendarReauthRequired,
  persistTokens = persistGoogleCalendarTokens
} = {}) => {
  let lastReauthError = null;

  for (const connection of connections) {
    const oauth2Client = createOAuthClient(connection);
    const storedTokens = JSON.parse(decryptTokens(connection.encryptedTokens));
    oauth2Client.setCredentials(storedTokens);
    try {
      await oauth2Client.getAccessToken();
      if (oauth2Client.credentials && JSON.stringify(oauth2Client.credentials) !== JSON.stringify(storedTokens)) {
        await persistTokens(connection, { ...storedTokens, ...oauth2Client.credentials });
      }
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

export const getGoogleCalendarAuthUrl = (requestedEmail = null) => {
  const oauth2Client = getOAuthClient();
  const payload = Buffer.from(JSON.stringify({ requestedEmail: requestedEmail?.trim().toLowerCase() || null })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.ENCRYPTION_KEY || process.env.GOOGLE_OAUTH_CLIENT_SECRET).update(payload).digest('base64url');

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: DEFAULT_SCOPES,
    include_granted_scopes: true,
    login_hint: requestedEmail || undefined,
    state: `${payload}.${signature}`
  });
};

export const verifyGoogleCalendarOAuthState = (state) => {
  if (!state || !state.includes('.')) throw new Error('El estado OAuth de Google no es válido');
  const [payload, signature] = state.split('.');
  const expected = crypto.createHmac('sha256', process.env.ENCRYPTION_KEY || process.env.GOOGLE_OAUTH_CLIENT_SECRET).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new Error('No se pudo verificar el estado OAuth de Google');
  }
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
};

export const storeGoogleCalendarOAuthCode = async (code, connectedById = null, requestedEmail = null) => {
  if (!code) throw new Error('Missing Google OAuth code');

  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  const profile = await google.oauth2({ version: 'v2', auth: oauth2Client }).userinfo.get();
  const authenticatedEmail = profile.data.email?.trim().toLowerCase();
  if (!authenticatedEmail || profile.data.verified_email === false) {
    throw new Error('Google no devolvió un correo verificado');
  }
  if (requestedEmail && authenticatedEmail !== requestedEmail.trim().toLowerCase()) {
    throw new Error(`Se autorizó ${authenticatedEmail}, pero se esperaba ${requestedEmail.trim().toLowerCase()}`);
  }

  const existing = await prisma.googleCalendarConnection.findUnique({
    where: { email: authenticatedEmail }
  });

  const mergedTokens = {
    ...(existing ? JSON.parse(decrypt(existing.encryptedTokens)) : {}),
    ...tokens
  };

  return await prisma.googleCalendarConnection.upsert({
    where: { email: authenticatedEmail },
    create: {
      email: authenticatedEmail,
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
      syncToken: null,
      syncVersion: 0,
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
    orderBy: ACTIVE_CONNECTION_ORDER
  });
  return orderGoogleCalendarConnections(connections)[0] || null;
};

export const getGoogleCalendarConnections = async () => prisma.googleCalendarConnection.findMany({
  where: { isActive: true },
  orderBy: ACTIVE_CONNECTION_ORDER,
  select: { id: true, email: true, calendarId: true, scopes: true, isActive: true, connectedAt: true, lastSyncedAt: true }
});

export const getAuthorizedGoogleOAuthClient = async (connectionId = null) => {
  const connections = await prisma.googleCalendarConnection.findMany({
    where: connectionId ? { id: connectionId, isActive: true } : { isActive: true },
    orderBy: ACTIVE_CONNECTION_ORDER
  });
  return await authorizeGoogleCalendarConnections(orderGoogleCalendarConnections(connections));
};

export const getAuthorizedGoogleOAuthClients = async () => {
  const connections = await prisma.googleCalendarConnection.findMany({
    where: { isActive: true },
    orderBy: ACTIVE_CONNECTION_ORDER
  });
  const authorized = [];
  for (const connection of connections) {
    try {
      const auth = await authorizeGoogleCalendarConnections([connection]);
      if (auth) authorized.push(auth);
    } catch (error) {
      if (!isGoogleOAuthReauthError(error)) throw error;
    }
  }
  return authorized;
};

export const getPendingGoogleCalendarWhere = () => ({
  source: 'BRAIN', googleLinks: { none: {} }, googleCancelled: false, requestId: null, googleEventId: null,
  OR: [{ googleSyncStatus: null }, { googleSyncStatus: { notIn: ['DISMISSED', 'DELETED', 'PENDING_DELETE', 'MERGED', 'PENDING', 'RETRY'] } }]
});

const getGoogleCalendarDiagnosticWhere = () => ({
  googleSyncError: { not: null },
  OR: [{ googleSyncStatus: null }, { googleSyncStatus: { notIn: ['DELETED', 'MERGED', 'PENDING', 'PENDING_DELETE'] } }]
});

export const getGoogleCalendarIssueWhere = connectionId => ({
  googleConnectionId: connectionId,
  OR: [
    getGoogleCalendarDiagnosticWhere(),
    { googleSyncStatus: { in: ['PENDING', 'PENDING_DELETE'] } }
  ]
});

export const getCentralGoogleCalendarConnectionStatus = async () => {
  const rawConnections = await prisma.googleCalendarConnection.findMany({
    orderBy: ACTIVE_CONNECTION_ORDER,
    select: {
      id: true,
      email: true,
      calendarId: true,
      scopes: true,
      isActive: true,
      connectedAt: true,
      lastSyncedAt: true,
      syncToken: true,
      channels: {
        where: { expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: 'desc' },
        take: 1,
        select: { expiresAt: true }
      },
      _count: { select: { eventLinks: true } }
    }
  });
  const connections = await Promise.all(rawConnections.map(async ({ syncToken, channels, _count, ...connection }) => {
    const errorWhere = {
      googleConnectionId: connection.id,
      ...getGoogleCalendarDiagnosticWhere()
    };
    const [errorCount, pendingCount, syncErrors] = await Promise.all([
      prisma.operationalEvent.count({ where: errorWhere }),
      prisma.operationalEvent.count({ where: { googleConnectionId: connection.id, googleSyncStatus: { in: ['PENDING', 'PENDING_DELETE'] } } }),
      prisma.operationalEvent.findMany({ where: getGoogleCalendarIssueWhere(connection.id), orderBy: { googleLastSyncedAt: 'desc' }, take: 10, select: { id: true, title: true, startAt: true, googleLastSyncedAt: true, googleSyncError: true, googleSyncStatus: true, googleNextRetryAt: true } })
    ]);
    return { ...connection, reconnectRequired: !connection.isActive, incrementalSyncReady: Boolean(syncToken), channelExpiresAt: channels[0]?.expiresAt || null, linkedEventCount: _count.eventLinks, errorCount, pendingCount, syncErrors };
  }));
  const [pendingCount, errorCount] = await Promise.all([
    prisma.operationalEvent.count({ where: getPendingGoogleCalendarWhere() }),
    prisma.operationalEvent.count({ where: { source: 'BRAIN', ...getGoogleCalendarDiagnosticWhere() } })
  ]);
  return { connected: connections.some(connection => connection.isActive), connections, reconciliation: { pendingCount, errorCount } };
};

export const listGoogleCalendarPages = async calendar => {
  const items = [];
  let pageToken;
  const seen = new Set();
  do {
    if (pageToken && seen.has(pageToken)) throw new Error('Google devolvió una página de calendarios repetida');
    if (pageToken) seen.add(pageToken);
    const response = await calendar.calendarList.list({ minAccessRole: 'reader', showHidden: false, ...(pageToken ? { pageToken } : {}) }, googleCalendarRequestOptions());
    items.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return items;
};

export const listAccessibleGoogleCalendars = async (connectionId = null) => {
  const auth = await getAuthorizedGoogleOAuthClient(connectionId);
  if (!auth) return [];

  const calendar = google.calendar({ version: 'v3', auth: auth.oauth2Client });
  const items = await listGoogleCalendarPages(calendar);

  return items.map(item => ({
    id: item.id,
    connectionId: auth.connection.id,
    accountEmail: auth.connection.email,
    summary: item.summary,
    description: item.description,
    primary: item.primary === true,
    accessRole: item.accessRole,
    backgroundColor: item.backgroundColor,
    selected: item.id === auth.connection.calendarId || (item.primary && auth.connection.calendarId === 'primary')
  }));
};

export const persistGoogleCalendarSelection = async (connectionId, calendarId, prismaClient = prisma) => prismaClient.$transaction(async tx => {
  const updated = await tx.googleCalendarConnection.update({
    where: { id: connectionId },
    data: { calendarId, syncToken: null, syncVersion: 0, lastSyncedAt: null },
    select: { id: true, email: true, calendarId: true, scopes: true, isActive: true, connectedAt: true, lastSyncedAt: true }
  });
  await tx.googleCalendarSyncChannel.updateMany({ where: { connectionId }, data: { expiresAt: new Date(0) } });
  return updated;
});

export const setActiveGoogleCalendar = async (calendarId, connectionId = null) => withCalendarSyncLock(async () => {
  if (!calendarId) throw new Error('calendarId is required');

  const connection = connectionId
    ? await prisma.googleCalendarConnection.findFirst({ where: { id: connectionId, isActive: true } })
    : await getCentralGoogleCalendarConnection();
  if (!connection) throw new Error('Google Calendar is not connected');

  return persistGoogleCalendarSelection(connection.id, calendarId);
});

export const createOpenGoogleMeetSpace = async (connectionId = null) => {
  const auth = await getAuthorizedGoogleOAuthClient(connectionId);
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
