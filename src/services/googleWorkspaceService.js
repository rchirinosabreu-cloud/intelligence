import { google } from 'googleapis';
import { getAuthorizedClient } from './googleAuthService.js';
import prisma from '../lib/prisma.js';

/**
 * Fetches data from a Google Sheet.
 * @param {string} spreadsheetId
 * @param {string} range (Default: 'Sheet1!A1:Z100')
 */
export const readGoogleSheet = async (spreadsheetId, range = 'A1:Z100') => {
  // Find the primary integration to get auth
  const primaryAuth = await prisma.agencyIntegration.findFirst({
    where: { credentials: { not: null } }
  });

  if (!primaryAuth) throw new Error('No Google account connected.');

  const auth = await getAuthorizedClient(primaryAuth.id);
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range
  });

  return response.data.values;
};

/**
 * Lists recent unread emails from Gmail.
 */
export const getRecentEmails = async (maxResults = 5) => {
  const primaryAuth = await prisma.agencyIntegration.findFirst({
    where: { credentials: { not: null } }
  });

  if (!primaryAuth) return [];

  const auth = await getAuthorizedClient(primaryAuth.id);
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.messages.list({
    userId: 'me',
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
};

/**
 * Fetches slides content.
 */
export const readGoogleSlides = async (presentationId) => {
  const primaryAuth = await prisma.agencyIntegration.findFirst({
    where: { credentials: { not: null } }
  });

  if (!primaryAuth) throw new Error('No Google account connected.');

  const auth = await getAuthorizedClient(primaryAuth.id);
  const slides = google.slides({ version: 'v1', auth });

  const response = await slides.presentations.get({ presentationId });
  return response.data;
};
