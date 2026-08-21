import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildGoogleEventPayload,
  buildGoogleRecurrence,
  listAllGoogleEventPages,
  mapGoogleEventDates
} from '../src/services/operationalEventService.js';
import {
  addExternalEmailTags,
  getGoogleConnectionHealth,
  getCalendarPopoverPosition,
  getDayEventDisplay,
  normalizeCalendarDescription,
  summarizeGoogleSyncResults
} from '../src/components/modules/Activity/calendarPresentation.js';

test('calendar popovers open above bottom-row events and below when space allows', () => {
  assert.deepEqual(
    getCalendarPopoverPosition({ left: 60, top: 740, bottom: 770 }, { width: 1280, height: 800 }),
    { left: 60, top: 532, placement: 'top' }
  );
  assert.deepEqual(
    getCalendarPopoverPosition({ left: 60, top: 100, bottom: 130 }, { width: 1280, height: 800 }),
    { left: 60, top: 138, placement: 'bottom' }
  );
});

test('Google Calendar pagination reaches the final page and returns its sync token', async () => {
  const calls = [];
  const calendar = {
    events: {
      list: async (params) => {
        calls.push(params);
        if (!params.pageToken) {
          return { data: { items: [{ id: 'first' }], nextPageToken: 'page-2' } };
        }
        return { data: { items: [{ id: 'second' }], nextSyncToken: 'sync-final' } };
      }
    }
  };

  const result = await listAllGoogleEventPages(calendar, { calendarId: 'primary', maxResults: 250 });

  assert.deepEqual(result.items.map(item => item.id), ['first', 'second']);
  assert.equal(result.nextSyncToken, 'sync-final');
  assert.equal(calls[1].pageToken, 'page-2');
});

test('Google Calendar pagination marks an expired sync token for a full retry', async () => {
  const error = Object.assign(new Error('Sync token is no longer valid'), { code: 410 });
  const calendar = { events: { list: async () => { throw error; } } };

  await assert.rejects(
    () => listAllGoogleEventPages(calendar, { calendarId: 'primary', syncToken: 'expired' }),
    candidate => candidate.code === 'GOOGLE_SYNC_TOKEN_EXPIRED'
  );
});

test('weekly Brainstudio recurrence becomes a Google RRULE', () => {
  assert.deepEqual(buildGoogleRecurrence({
    recurrence: 'WEEKLY',
    recurrenceEnd: new Date('2026-09-30T23:59:59.000Z')
  }), ['RRULE:FREQ=WEEKLY;UNTIL=20260930T235959Z']);
  assert.equal(buildGoogleRecurrence({ recurrence: 'NONE' }), undefined);
});

test('Google all-day end dates remain exclusive and identifiable', () => {
  const dates = mapGoogleEventDates({
    start: { date: '2026-08-20' },
    end: { date: '2026-08-21' }
  });

  assert.equal(dates.isAllDay, true);
  assert.equal(dates.startAt.toISOString(), '2026-08-20T05:00:00.000Z');
  assert.equal(dates.endAt.toISOString(), '2026-08-21T05:00:00.000Z');
});

test('day overflow can be expanded without opening event creation', () => {
  const events = Array.from({ length: 7 }, (_, index) => ({ id: String(index + 1) }));
  assert.deepEqual(getDayEventDisplay(events, false), { visible: events.slice(0, 4), overflow: 3 });
  assert.deepEqual(getDayEventDisplay(events, true), { visible: events, overflow: 0 });
});

test('manual sync summary aggregates every connected Google account', () => {
  const summary = summarizeGoogleSyncResults([
    { email: 'social@brainstudio.com', imported: 3, updated: 5, skipped: 1, connected: true },
    { email: 'coordinador@brainstudio.com', imported: 2, updated: 4, skipped: 0, connected: true }
  ]);

  assert.deepEqual(summary, { imported: 5, updated: 9, skipped: 1, failed: 0 });
});

test('calendar overflow opens an accessible day agenda and provides a mobile agenda', async () => {
  const calendar = await readFile(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8');

  assert.match(calendar, /setSelectedDayAgenda\(day\)/);
  assert.match(calendar, /data-operational-day-agenda="dialog"/);
  assert.match(calendar, /role="dialog"/);
  assert.match(calendar, /aria-modal="true"/);
  assert.match(calendar, /md:hidden/);
  assert.doesNotMatch(calendar, /onClick=\{\(\) => handleEmptyDayClick\(day\)\}[\s\S]{0,180}\{overflow\} mas/);
});

test('Meet generation honors the selected Google organizer account', async () => {
  const calendar = await readFile(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8');
  const routes = await readFile(new URL('../src/routes/api/activity.js', import.meta.url), 'utf8');

  assert.match(calendar, /googleConnectionId:\s*formData\.googleConnectionId/);
  assert.match(routes, /createMeetEvent\(title, startAt, endAt, description, googleConnectionId\)/);
});

test('connection health distinguishes healthy, delayed and error states', () => {
  const now = new Date('2026-08-20T20:00:00.000Z');
  assert.equal(getGoogleConnectionHealth({ lastSyncedAt: '2026-08-20T19:59:00.000Z', channelExpiresAt: '2026-08-21T20:00:00.000Z', errorCount: 0 }, now).status, 'healthy');
  assert.equal(getGoogleConnectionHealth({ lastSyncedAt: '2026-08-20T19:40:00.000Z', channelExpiresAt: '2026-08-21T20:00:00.000Z', errorCount: 0 }, now).status, 'delayed');
  assert.equal(getGoogleConnectionHealth({ lastSyncedAt: '2026-08-20T19:59:00.000Z', channelExpiresAt: '2026-08-21T20:00:00.000Z', errorCount: 2 }, now).status, 'error');
});

test('status endpoint exposes operational health without exposing tokens', async () => {
  const oauth = await readFile(new URL('../src/services/googleCalendarOAuthService.js', import.meta.url), 'utf8');
  assert.match(oauth, /incrementalSyncReady/);
  assert.match(oauth, /channelExpiresAt/);
  assert.match(oauth, /errorCount/);
  assert.match(oauth, /syncErrors/);
  assert.doesNotMatch(oauth, /encryptedTokens:\s*true/);
});

test('calendar exposes failed events, retry recovery and an organized manual sync control', async () => {
  const calendar = await readFile(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8');

  assert.match(calendar, /google-calendar\/sync/);
  assert.match(calendar, /Sincronizar/);
  assert.match(calendar, /data-google-calendar-errors="dialog"/);
  assert.match(calendar, /Reintentar/);
  assert.match(calendar, /pointer-events-none/);
  assert.match(calendar, /deleteCandidate && createPortal/);
});

test('historical reconciliation requires an explicit bounded event selection', async () => {
  const service = await readFile(new URL('../src/services/operationalEventService.js', import.meta.url), 'utf8');
  const routes = await readFile(new URL('../src/routes/api/activity.js', import.meta.url), 'utf8');
  const calendar = await readFile(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8');

  assert.match(service, /reconcilePendingOperationalEvents/);
  assert.match(service, /eventIds\.length > 20/);
  assert.match(routes, /google-calendar\/reconciliation/);
  assert.match(calendar, /Confirmar y sincronizar/);
  assert.match(calendar, /puede enviar invitaciones/i);
});

test('external guests become validated, normalized and unique email tags', () => {
  assert.deepEqual(
    addExternalEmailTags(['cliente@empresa.com'], ' SOCIAL@BRAINSTUDIO.COM, cliente@empresa.com; invalido '),
    {
      emails: ['cliente@empresa.com', 'social@brainstudio.com'],
      invalid: ['invalido']
    }
  );
});

test('Google Calendar HTML descriptions are converted to readable plain text', () => {
  const description = '<p>Enlace donde nos reuniremos:</p><p><a href="https://meet.google.com/abc-defg-hij">Google Meet</a></p>';
  assert.equal(normalizeCalendarDescription(description), 'Enlace donde nos reuniremos:\nGoogle Meet');
});

test('calendar dialogs use the shared modal system, wide layout and scroll containment', async () => {
  const calendar = await readFile(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8');

  assert.match(calendar, /<Dialog open=\{!!selectedDayAgenda\}/);
  assert.match(calendar, /<Dialog open=\{isModalOpen\}/);
  assert.match(calendar, /max-w-3xl/);
  assert.match(calendar, /data-operational-event-form="dialog"/);
  assert.match(calendar, /data-operational-external-guests="tags"/);
  assert.doesNotMatch(calendar, /value=\{\(formData\.attendeeEmails \|\| \[\]\)\.join\(', '\)\}/);
});

test('calendar header hides connect actions for accounts that are already linked', async () => {
  const calendar = await readFile(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8');

  assert.match(calendar, /isGoogleAccountConnected/);
  assert.match(calendar, /!isGoogleAccountConnected\('coordinadorbrainstudio@gmail.com'\)/);
  assert.match(calendar, /!isGoogleAccountConnected\('social.brainstudio@gmail.com'\)/);
  assert.doesNotMatch(calendar, /Actualizaci[oó]n autom[aá]tica[\s\S]{0,80}<\/button>/i);
});

test('all-day Brainstudio events use Google date fields with an exclusive end date', () => {
  const payload = buildGoogleEventPayload({
    id: 'event-1',
    title: 'Día creativo',
    type: 'PROJECT',
    description: '',
    startAt: new Date('2026-08-20T05:00:00.000Z'),
    endAt: new Date('2026-08-21T05:00:00.000Z'),
    isAllDay: true,
    attendeeEmails: [],
    recurrence: 'NONE'
  });

  assert.deepEqual(payload.start, { date: '2026-08-20' });
  assert.deepEqual(payload.end, { date: '2026-08-21' });
});

test('all-day state is persisted and exposed by the operational calendar', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  const service = await readFile(new URL('../src/services/operationalEventService.js', import.meta.url), 'utf8');
  const calendar = await readFile(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8');

  assert.match(schema, /isAllDay\s+Boolean\s+@default\(false\)/);
  assert.match(service, /isAllDay:\s*mapGoogleEventDates\(event\)\.isAllDay/);
  assert.match(service, /isAllDay:\s*Boolean\(data\.isAllDay\)/);
  assert.match(calendar, /Todo el día/);
  assert.match(calendar, /formData\.isAllDay/);
});

test('external guest tags stay in one horizontal row without changing field height', async () => {
  const calendar = await readFile(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8');

  assert.match(calendar, /data-operational-external-guests="tags"/);
  assert.match(calendar, /flex-nowrap/);
  assert.match(calendar, /overflow-x-auto/);
  assert.doesNotMatch(calendar, /data-operational-external-guests="tags"[\s\S]{0,500}flex-wrap/);
});
