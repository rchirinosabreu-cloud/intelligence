import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

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
            scopes: [
                'https://www.googleapis.com/auth/calendar.readonly',
                'https://www.googleapis.com/auth/calendar.events'
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

export async function getUpcomingEvents(calendarId = 'social.brainstudio@gmail.com') {
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
export async function createMeetEvent(title, startAt, endAt, description = '') {
    const calendar = getCalendarClient();
    if (!calendar) return null;

    try {
        console.log(`[CalendarService] Creating Meet event: ${title}`);

        const response = await calendar.events.insert({
            calendarId: 'social.brainstudio@gmail.com', // Agency primary calendar
            conferenceDataVersion: 1,
            requestBody: {
                summary: title,
                description: description,
                start: { dateTime: new Date(startAt).toISOString() },
                end: { dateTime: new Date(endAt).toISOString() },
                conferenceData: {
                    createRequest: {
                        requestId: `meet-${Date.now()}`,
                        conferenceSolutionKey: { type: 'hangoutsMeet' }
                    }
                }
            }
        });

        const meetLink = response.data.hangoutLink;
        console.log(`[CalendarService] Created event with link: ${meetLink}`);
        return meetLink;
    } catch (error) {
        console.error("[CalendarService] Failed to create Meet event:", error.message);
        // Fallback or return null so the UI can handle it
        return null;
    }
}
