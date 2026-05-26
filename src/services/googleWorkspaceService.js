import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import prisma from '../lib/prisma.js';

// Default email to impersonate for Gmail access (requires Domain-Wide Delegation)
export const DEFAULT_IMPERSONATED_EMAIL = process.env.GOOGLE_WORKSPACE_SUBJECT || 'contacto@brainstudioagencia.com';

/**
 * Helper to get a Service Account Auth client.
 * @param {string} subject - Email to impersonate (requires Domain-Wide Delegation).
 */
const getServiceAuth = async (subject = null) => {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!credentialsJson) throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is missing.');

  const credentials = JSON.parse(credentialsJson);

  return new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    subject: subject || process.env.GOOGLE_CALENDAR_ID || DEFAULT_IMPERSONATED_EMAIL, // Impersonation
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/cloud-platform'
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

  return response.data.values || [];
};

/**
 * Lists recent emails from Gmail.
 * NOTE: Service Accounts require Domain-Wide Delegation for Gmail impersonation.
 */
export const getRecentEmails = async (maxResults = 5, query = 'is:unread', subject = null) => {
  try {
    const auth = await getServiceAuth(subject);
    const gmail = google.gmail({ version: 'v1', auth });

    const response = await gmail.users.messages.list({
      userId: 'me', // Refers to the 'subject' if impersonating
      q: query,
      maxResults
    });

    const messages = response.data.messages || [];
    const detailedMessages = await Promise.all(
      messages.map(async (msg) => {
        try {
          const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id });
          const headers = detail.data.payload.headers;
          const fromHeader = headers.find(h => h.name === 'From')?.value;
          const subjectHeader = headers.find(h => h.name === 'Subject')?.value;
          const dateHeader = headers.find(h => h.name === 'Date')?.value;

          return {
            id: msg.id,
            from: fromHeader,
            subject: subjectHeader,
            date: dateHeader,
            snippet: detail.data.snippet
          };
        } catch (msgErr) {
          console.error(`[GoogleWorkspaceService] Error fetching message ${msg.id}:`, msgErr.message);
          return null;
        }
      })
    );

    return detailedMessages.filter(m => m !== null);
  } catch (err) {
    console.warn('[GoogleWorkspaceService] Gmail listing failed:', err.message);
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
