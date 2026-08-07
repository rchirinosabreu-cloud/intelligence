import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('operational calendar is ready for central Google Calendar OAuth sync', async () => {
  const schema = await read('prisma/schema.prisma');
  const oauthService = await read('src/services/googleCalendarOAuthService.js');
  const activityRoutes = await read('src/routes/api/activity.js');
  const eventService = await read('src/services/operationalEventService.js');

  assert.match(schema, /model GoogleCalendarConnection/);
  assert.match(schema, /email\s+String\s+@unique/);
  assert.match(schema, /encryptedTokens\s+String/);
  assert.match(schema, /model GoogleCalendarSyncChannel/);
  assert.match(schema, /googleEventId\s+String\?/);
  assert.match(schema, /googleCalendarId\s+String\?/);
  assert.match(schema, /googleMeetAccessType\s+String\?/);
  assert.match(schema, /@@index\(\[googleCalendarId, googleEventId\]\)/);

  assert.match(oauthService, /google\.auth\.OAuth2/);
  assert.match(oauthService, /coordinadorbrainstudio@gmail\.com/);
  assert.match(oauthService, /encrypt\(JSON\.stringify\(mergedTokens\)\)/);
  assert.match(oauthService, /decrypt\(connection\.encryptedTokens\)/);
  assert.match(oauthService, /listAccessibleGoogleCalendars/);
  assert.match(oauthService, /setActiveGoogleCalendar/);

  assert.match(activityRoutes, /google-calendar\/auth-url/);
  assert.match(activityRoutes, /google-calendar\/oauth-callback/);
  assert.match(activityRoutes, /google-calendar\/status/);
  assert.match(activityRoutes, /google-calendar\/calendars/);
  assert.match(activityRoutes, /google-calendar\/active-calendar/);
  assert.match(activityRoutes, /google-calendar\/sync/);
  assert.match(eventService, /syncOperationalEventToGoogle/);
  assert.match(eventService, /syncGoogleCalendarToOperationalEvents/);
  assert.match(eventService, /getGoogleErrorDetails/);
  assert.match(eventService, /throw new Error\(`Google Calendar sync failed:/);
  assert.match(eventService, /if \(error\.code === 404 \|\| error\.response\?\.status === 404\)/);
  assert.match(eventService, /extendedProperties\?\.\private\?\.brainOperationalEventId/);
});

test('operational calendar fixes current render and role issues', async () => {
  const calendar = await read('src/components/modules/Activity/OperationalCalendar.jsx');
  const activityMap = await read('src/components/modules/Activity/ActivityMap.jsx');
  const callback = await read('src/components/modules/Activity/GoogleCalendarCallback.jsx');
  const app = await read('src/App.jsx');
  const activityStatus = await read('src/services/activityStatusService.js');

  assert.match(calendar, /from 'date-fns\/locale'/);
  assert.match(calendar, /role === 'PROJECT_MANAGER'/);
  assert.doesNotMatch(calendar, /role === 'PM'/);
  assert.match(calendar, /if \(!res\.ok\) \{[\s\S]*throw new Error/);
  assert.match(calendar, /Authorization:\s*`Bearer \$\{localStorage\.getItem\('authToken'\)\}`/);
  assert.match(calendar, /google-calendar\/auth-url/);
  assert.match(calendar, /google-calendar\/sync/);
  assert.match(callback, /google-calendar\/oauth-callback/);
  assert.match(app, /google-calendar\/callback/);
  assert.match(activityMap, /role === 'PROJECT_MANAGER'/);
  assert.match(activityStatus, /currentEvent/);
});
