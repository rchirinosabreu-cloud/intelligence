import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import prisma from '../lib/prisma.js';

/**
 * Helper to get a Service Account Auth client.
 */
const getServiceAuth = async () => {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!credentialsJson) throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is missing.');

  const credentials = JSON.parse(credentialsJson);

  return new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/presentations.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.readonly'
    ],
  });
};

/**
 * Fetches data from a Google Sheet using Service Account.
 */
export const readGoogleSheet = async (spreadsheetId, range = 'A1:Z100') => {
  const auth = await getServiceAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range
  });

  return response.data.values;
};

/**
 * Lists recent unread emails from Gmail.
 * NOTE: Service Accounts require Domain-Wide Delegation for Gmail.
 * If not available, this may return empty or error depending on setup.
 */
export const getRecentEmails = async (maxResults = 5) => {
  try {
    const auth = await getServiceAuth();
    const gmail = google.gmail({ version: 'v1', auth });

    const response = await gmail.users.messages.list({
      userId: 'me', // This only works if DWD is set up or if 'me' refers to the SA (rarely useful)
      q: 'is:unread',
      maxResults
    });

    const messages = response.data.messages || [];
    const detailedMessages = await Promise.all(
      messages.map(async (msg) => {
        const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id });
        const headers = detail.data.payload.headers;
        const from = headers.find(h => h.name === 'From')?.value;
        const subject = headers.find(h => h.name === 'Subject')?.value;
        return { id: msg.id, from, subject, snippet: detail.data.snippet };
      })
    );

    return detailedMessages;
  } catch (err) {
    console.warn('[GoogleWorkspaceService] Gmail listing failed (Service Account mode):', err.message);
    return [];
  }
};

/**
 * Fetches slides content using Service Account.
 */
export const readGoogleSlides = async (presentationId) => {
  const auth = await getServiceAuth();
  const slides = google.slides({ version: 'v1', auth });

  const response = await slides.presentations.get({ presentationId });
  return response.data;
};
