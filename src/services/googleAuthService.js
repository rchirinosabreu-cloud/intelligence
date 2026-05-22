import { google } from 'googleapis';
import prisma from '../lib/prisma.js';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export const getAuthUrl = () => {
  const scopes = [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/presentations.readonly',
    'https://www.googleapis.com/auth/calendar.readonly'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
};

export const handleAuthCallback = async (code, alias = 'Main Google Account') => {
  const { tokens } = await oauth2Client.getToken(code);

  // Store the integration in the database
  // Note: For now we'll create a generic integration to hold the main credentials.
  // Real world usage might link this to a specific User or a global Admin integration.
  const integration = await prisma.agencyIntegration.create({
    data: {
      type: 'GMAIL', // Primary type for auth storage
      alias: alias,
      credentials: tokens,
      isActive: true
    }
  });

  return integration;
};

export const getAuthorizedClient = async (integrationId) => {
  const integration = await prisma.agencyIntegration.findUnique({
    where: { id: integrationId }
  });

  if (!integration || !integration.credentials) {
    throw new Error('No credentials found for this integration.');
  }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  client.setCredentials(integration.credentials);

  // Auto-refresh logic handled by googleapis if refresh_token is present
  client.on('tokens', async (tokens) => {
    if (tokens.refresh_token) {
      // Store new tokens
      await prisma.agencyIntegration.update({
        where: { id: integrationId },
        data: {
          credentials: {
            ...integration.credentials,
            ...tokens
          }
        }
      });
    }
  });

  return client;
};
