import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import crypto from 'crypto';
import {
    createOpenGoogleMeetSpace,
    getAuthorizedGoogleOAuthClient,
    isGoogleOAuthReauthError,
    markGoogleCalendarReauthRequired
} from './googleCalendarOAuthService.js';

let calendarClient;
let authClient;

function getCalendarClient() {
    if (calendarClient) return calendarClient;

    try {
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
            console.error("Missing GOOGLE_APPLICATION_CREDENTIALS_JSON");
            return null;
        }

        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        // Sanitize private key
        if (credentials.private_key) {
             credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }

        authClient = new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            subject: process.env.GOOGLE_CALENDAR_ID || process.env.GOOGLE_WORKSPACE_SUBJECT || 'contacto@brainstudioagencia.com',
            scopes: [
                'https://www.googleapis.com/auth/calendar'
            ],
        });

        // Instantiate Calendar v3 with this auth client
        calendarClient = google.calendar({ version: 'v3', auth: authClient });
        console.log("[CalendarService] Initialized successfully.");
        return calendarClient;
    } catch (error) {
        console.error("[CalendarService] Initialization failed:", error?.message || error);
        return null;
    }
}
export async function getUpcomingEvents(calendarId = process.env.GOOGLE_CALENDAR_ID || process.env.GOOGLE_WORKSPACE_SUBJECT || 'contacto@brainstudioagencia.com') {
    const calendar = getCalendarClient();
    if (!calendar) {
        throw new Error("Calendar client not initialized");
    }

    try {
        // Simple log with timestamp
        console.log(`[${new Date().toISOString()}] [CalendarService] Fetching events for ${calendarId}`);
        const now = new Date();
        const response = await calendar.events.list({
            calendarId: calendarId,
            timeMin: now.toISOString(),
            maxResults: 10, // Increased to filter out non-meetings if needed
            singleEvents: true,
            orderBy: 'startTime',
        });

        const items = response.data.items || [];
        console.log(`[CalendarService] Found ${items.length} events.`);

        return items.map(event => {
            // start.dateTime is for timed events, start.date for all-day
            const start = event.start.dateTime || event.start.date;
            const end = event.end.dateTime || event.end.date;

            // Robust Meet Link Extraction
            let meetLink = event.hangoutLink;
            if (!meetLink && event.conferenceData && event.conferenceData.entryPoints) {
                const videoEntry = event.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video');
                if (videoEntry) {
                    meetLink = videoEntry.uri;
                }
            }

            return {
                id: event.id,
                title: event.summary || 'Sin título',
                start_time: start,
                end_time: end,
                meet_link: meetLink, // Prioritized Meet Link
                html_link: event.htmlLink,    // Fallback link to calendar event
                description: event.description,
                location: event.location
            };
        }).slice(0, 5); // Return top 5

    } catch (error) {
        console.error(`[CalendarService] Error fetching events:`, error.message);
        throw error;
    }
}

/**
 * Creates a Google Calendar event with a Google Meet link.
 */
export async function createMeetEvent(title, startAt, endAt, description = '', connectionId = null) {
    const centralMeet = await createCentralOAuthMeetEvent(title, startAt, endAt, description, connectionId);
    if (centralMeet) return centralMeet;
    if (connectionId) return null;

    const calendar = getCalendarClient();
    if (!calendar) return null;

    try {
        const calendarId = process.env.GOOGLE_CALENDAR_ID || process.env.GOOGLE_WORKSPACE_SUBJECT || 'contacto@brainstudioagencia.com';
        console.log(`[CalendarService] Creating Meet event in ${calendarId}: ${title}`);

        const response = await calendar.events.insert({
            calendarId: calendarId,
            conferenceDataVersion: 1,
            requestBody: {
                summary: title,
                description: description,
                start: { dateTime: new Date(startAt).toISOString() },
                end: { dateTime: new Date(endAt).toISOString() },
                conferenceData: {
                    createRequest: {
                        requestId: crypto.randomBytes(16).toString('hex'),
                        conferenceSolutionKey: { type: 'hangoutsMeet' }
                    }
                }
            }
        });

        const meetLink = response.data.hangoutLink;
        console.log(`[CalendarService] Created event with link: ${meetLink}`);
        return { meetingLink: meetLink, googleMeetSpaceName: null };
    } catch (error) {
        console.error("[CalendarService] Failed to create Meet event:", error.response?.data || error.message);
        throw error;
    }
}

async function createCentralOAuthMeetEvent(_title, _startAt, _endAt, _description = '', connectionId = null) {
    let auth = null;
    try {
        auth = await getAuthorizedGoogleOAuthClient(connectionId);
        if (!auth) return null;

        const meetSpace = await createOpenGoogleMeetSpace(connectionId);
        return meetSpace?.meetingUri
            ? { meetingLink: meetSpace.meetingUri, googleMeetSpaceName: meetSpace.name || null }
            : null;
    } catch (error) {
        console.error("[CalendarService] Central OAuth Meet creation failed:", error.response?.data || error.message);
        if (auth?.connection && isGoogleOAuthReauthError(error)) {
            await markGoogleCalendarReauthRequired(auth.connection);
        }
        throw error;
    }
}
