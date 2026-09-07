import test from 'node:test';
import assert from 'node:assert/strict';
import * as presentation from '../src/components/modules/Activity/calendarPresentation.js';

test('manual synchronization does not hide connected accounts with event failures', () => {
  assert.equal(presentation.summarizeGoogleSyncResults([
    { connected: true, imported: 2, failed: 3 },
    { connected: false, error: 'invalid_grant' },
    { connected: true, error: 'rate limit' }
  ]).failed, 5);
});

test('invalid dates do not crash the whole calendar', () => {
  assert.equal(presentation.toBogotaDatePickerValue('not a date'), null);
  assert.equal(presentation.toBogotaDatePickerValue(null), null);
});

test('a timed event ending at midnight is not duplicated on the next day', () => {
  const bounds = presentation.getCalendarEventBounds({
    startAt: '2026-09-07T22:00:00-05:00', endAt: '2026-09-08T00:00:00-05:00'
  });
  assert.equal(presentation.fromBogotaDatePickerValue(bounds.finalDay), '2026-09-07T00:00:00-05:00');
});

test('all-day exclusive ends keep exactly the selected days', () => {
  const bounds = presentation.getCalendarEventBounds({
    startAt: '2026-09-07T00:00:00-05:00', endAt: '2026-09-09T00:00:00-05:00', isAllDay: true
  });
  assert.equal(presentation.fromBogotaDatePickerValue(bounds.finalDay), '2026-09-08T00:00:00-05:00');
  assert.equal(presentation.getCalendarEventBounds({ startAt: 'bad', endAt: 'bad' }), null);
});

test('selected recurrence end includes its entire Bogota day', () => {
  const end = presentation.getCalendarRecurrenceEnd(new Date(2026, 8, 7));
  assert.equal(end, '2026-09-07T23:59:59-05:00');
});

test('default creation date uses the Bogota day even when device has passed midnight', () => {
  const date = presentation.getRoundedBogotaNow(undefined, new Date('2026-09-08T01:05:00Z'));
  assert.equal(presentation.fromBogotaDatePickerValue(date), '2026-09-07T20:15:00-05:00');
});

test('new event request identity survives the same payload retry and changes with the payload', () => {
  let next = 0;
  const identity = presentation.createCalendarRequestIdentity(() => `request-${++next}`);
  assert.equal(identity.forPayload({ title: 'Tráfico', startAt: 'date' }), 'request-1');
  assert.equal(identity.forPayload({ title: 'Tráfico', startAt: 'date' }), 'request-1');
  assert.equal(identity.forPayload({ title: 'Tráfico actualizado', startAt: 'date' }), 'request-2');
  identity.reset();
  assert.equal(identity.forPayload({ title: 'Tráfico actualizado', startAt: 'date' }), 'request-3');
});

test('saved pending and unknown sync outcomes never become a success toast', () => {
  assert.deepEqual(presentation.getCalendarSaveFeedback({ googleSyncStatus: 'PENDING' }), {
    success: false, message: 'Evento guardado. La sincronización con Google Calendar sigue pendiente.'
  });
  assert.equal(presentation.getCalendarSaveFeedback({}).success, false);
  assert.equal(presentation.getCalendarSaveFeedback({ googleSyncStatus: 'ERROR' }).success, false);
  assert.deepEqual(presentation.getCalendarSaveFeedback({ googleSyncStatus: 'SYNCED' }, true), {
    success: true, message: 'Evento actualizado y sincronizado con Google Calendar'
  });
});

test('a disconnected account is never presented as healthy because an old sync succeeded', () => {
  const now = new Date('2026-09-07T18:00:00Z');
  assert.deepEqual(presentation.getGoogleConnectionHealth({
    reconnectRequired: true, lastSyncedAt: now, channelExpiresAt: '2026-09-08T18:00:00Z'
  }, now), { status: 'reconnect', label: 'Reconectar cuenta' });
});

test('an account with durable pending writes is shown as pending instead of healthy', () => {
  assert.deepEqual(presentation.getGoogleConnectionHealth({ pendingCount: 1 }), {
    status: 'pending', label: 'Sincronización pendiente'
  });
});

test('pending diagnostics do not claim that Google rejected an unconfirmed write', () => {
  assert.doesNotMatch(presentation.explainGoogleSyncError('Guardado; esperando Google.', 'PENDING'), /rechazó/);
  assert.match(presentation.explainGoogleSyncError('Guardado; esperando Google.', 'PENDING'), /confirmación/);
});

test('Bogota date and time fields survive device spring gaps and autumn overlaps', () => {
  const previousZone = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    for (const instant of ['2026-03-08T02:30:00-05:00', '2026-11-01T01:30:00-05:00']) {
      const { date, time } = presentation.toBogotaCalendarFormValue(instant);
      assert.equal(date.getHours(), 12, 'The calendar date must use a safe noon carrier');
      assert.equal(presentation.combineBogotaDateAndTime(date, time), instant);
      assert.equal(presentation.formatBogotaClock(instant), instant.slice(11, 16));
    }
    assert.equal(presentation.combineBogotaDateAndTime(new Date(2026, 2, 8, 12), '02:30'), '2026-03-08T02:30:00-05:00');
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});

test('new form ranges keep one hour across the device daylight saving gap', () => {
  const previousZone = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const range = presentation.getInitialBogotaCalendarRange(undefined, new Date('2026-03-08T02:30:00-05:00'));
    assert.equal(range.startTime, '02:30');
    assert.equal(range.endTime, '03:30');
    assert.equal(presentation.combineBogotaDateAndTime(range.startAt, range.startTime), '2026-03-08T02:30:00-05:00');
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});

test('calendar date typing requires a full unambiguous day month and year', () => {
  assert.equal(presentation.parseCalendarDateInput('11/09'), null);
  assert.equal(presentation.parseCalendarDateInput('11 sept.'), null);
  assert.equal(presentation.parseCalendarDateInput('31/02/2026'), null);
  const valid = presentation.parseCalendarDateInput('11/09/2026');
  assert.equal(presentation.combineBogotaDateAndTime(valid, '09:00'), '2026-09-11T09:00:00-05:00');
});

test('a combined date-time field parses the full year and clock independently of device DST', () => {
  const previousZone = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    for (const [raw, expected] of [['08/03/2026 02:30', '2026-03-08T02:30:00-05:00'], ['01/11/2026 01:30', '2026-11-01T01:30:00-05:00']]) {
      const value = presentation.parseCalendarDateTimeInput(raw);
      assert.equal(value.date.getHours(), 12);
      assert.equal(presentation.combineBogotaDateAndTime(value.date, value.time), expected);
      assert.equal(presentation.formatCalendarDateTimeInput(value.date, value.time), raw);
    }
    for (const raw of ['11/09 08:00', '11 sept, 08:00', '11/09/2026', '31/02/2026 08:00', '11/09/2026 24:00', '11/09/2026 08:99']) {
      assert.equal(presentation.parseCalendarDateTimeInput(raw), null, raw);
    }
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});

test('editing unrelated fields preserves original timestamp precision and recurrence cutoff', () => {
  const original = { startAt: '2026-03-08T02:30:12.123-05:00', endAt: '2026-03-09T03:30:45.456-05:00', recurrence: 'WEEKLY', recurrenceEnd: '2026-09-30T15:30:00Z', isAllDay: false };
  const form = { ...presentation.getBogotaCalendarFormRange(original.startAt, original.endAt), recurrence: 'WEEKLY', recurrenceEnd: presentation.toBogotaCalendarDate(original.recurrenceEnd), isAllDay: false };
  assert.deepEqual(presentation.serializeBogotaCalendarEventDates(form, original), { startAt: original.startAt, endAt: original.endAt, recurrenceEnd: original.recurrenceEnd });
  assert.equal(presentation.serializeBogotaCalendarEventDates({ ...form, startTime: '04:00' }, original).startAt, '2026-03-08T04:00:00-05:00');
});

test('reentering a cleared time never grows the event duration from the Unix epoch', () => {
  const form = { ...presentation.getBogotaCalendarFormRange('2026-03-08T02:30:00-05:00', '2026-03-08T03:30:00-05:00'), startTime: '', isAllDay: false };
  const moved = presentation.moveBogotaCalendarStart(form, form.startAt, '02:30');
  assert.equal(presentation.combineBogotaDateAndTime(moved.endAt, moved.endTime), '2026-03-08T03:30:00-05:00');
});

test('new timed events cannot start before the current instant', () => {
  const form = { ...presentation.getBogotaCalendarFormRange('2026-09-07T14:00:00-05:00', '2026-09-07T15:00:00-05:00'), isAllDay: false };
  assert.equal(presentation.getCalendarStartValidationError(form, null, new Date('2026-09-07T14:01:00-05:00')), 'No puedes elegir una fecha y hora que ya pasó');
  assert.equal(presentation.getCalendarStartValidationError(form, null, new Date('2026-09-07T14:00:00-05:00')), '');
});

test('all-day creation accepts today in Bogota and rejects earlier dates', () => {
  const form = { ...presentation.getBogotaCalendarFormRange('2026-09-07T00:00:00-05:00', '2026-09-08T00:00:00-05:00'), isAllDay: true };
  assert.equal(presentation.getCalendarStartValidationError(form, null, new Date('2026-09-07T20:00:00-05:00')), '');
  assert.equal(presentation.getCalendarStartValidationError(form, null, new Date('2026-09-08T00:00:00-05:00')), 'No puedes elegir una fecha y hora que ya pasó');
});

test('historical edits preserve the original start and temporal type but reject changed past starts', () => {
  const original = { startAt: '2026-09-01T14:00:00-05:00', endAt: '2026-09-01T15:00:00-05:00', isAllDay: false };
  const form = { ...presentation.getBogotaCalendarFormRange(original.startAt, original.endAt), isAllDay: false };
  const now = new Date('2026-09-07T20:00:00-05:00');
  assert.equal(presentation.getCalendarStartValidationError(form, original, now), '');
  assert.equal(presentation.getCalendarStartValidationError({ ...form, startTime: '14:30' }, original, now), 'No puedes elegir una fecha y hora que ya pasó');
  assert.equal(presentation.getCalendarStartValidationError({ ...form, isAllDay: true }, original, now), 'No puedes elegir una fecha y hora que ya pasó');
});
