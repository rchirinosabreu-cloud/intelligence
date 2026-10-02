import {
    createOpenGoogleMeetSpace,
    getAuthorizedGoogleOAuthClient,
    isGoogleOAuthReauthError,
    markGoogleCalendarReauthRequired
} from './googleCalendarOAuthService.js';

/**
 * Creates a Google Calendar event with a Google Meet link.
 */
export async function createMeetEvent(title, startAt, endAt, description = '', connectionId = null, { createSpace = createCentralOAuthMeetEvent } = {}) {
    const centralMeet = await createSpace(title, startAt, endAt, description, connectionId);
    if (centralMeet) return centralMeet;
    throw Object.assign(new Error('Conecta una cuenta de Google antes de generar el enlace de Meet.'), { code: 'GOOGLE_CALENDAR_NOT_CONNECTED' });
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
