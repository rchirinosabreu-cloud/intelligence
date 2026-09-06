import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMemberStatus } from '../src/services/activityStatusService.js';
import * as presentation from '../src/components/modules/Activity/calendarPresentation.js';

test('map event details retain the dates and all-day semantics needed by their preview', () => {
  const event = { id: 'absence', title: 'Permiso', type: 'ABSENCE', memberIds: ['member'],
    startAt: '2026-09-03T05:00:00.000Z', endAt: '2026-09-05T05:00:00.000Z', isAllDay: true, recurrence: 'NONE' };
  const result = calculateMemberStatus({ id: 'member' }, [event], new Date('2026-09-03T17:00:00Z'));
  assert.equal(result.status, 'AUSENTE');
  assert.equal(result.currentEvent.startAt, event.startAt);
  assert.equal(result.currentEvent.endAt, event.endAt);
  assert.equal(result.currentEvent.isAllDay, true);
});

test('popover dates are safe for partial or invalid payloads', () => {
  assert.equal(typeof presentation.formatActivityEventSchedule, 'function');
  for (const event of [{}, { startAt: null }, { startAt: 'broken' }]) {
    assert.equal(presentation.formatActivityEventSchedule(event), 'Horario no disponible');
  }
});

test('popover dates use Bogota time and exclusive all-day end dates', () => {
  assert.equal(typeof presentation.formatActivityEventSchedule, 'function');
  const format = presentation.formatActivityEventSchedule;
  assert.match(format({ startAt: '2026-09-03T15:00:00Z', endAt: '2026-09-03T16:30:00Z' }), /10:00.*11:30/);
  const allDay = format({ startAt: '2026-09-03T05:00:00Z', endAt: '2026-09-05T05:00:00Z', isAllDay: true });
  assert.match(allDay, /Todo el día.*3.*4/);
  assert.doesNotMatch(allDay, /5 sept/);
  assert.match(format({ startAt: '2026-08-03T15:00:00Z', endAt: '2026-08-03T16:00:00Z', recurrence: 'WEEKLY' }), /^Semanal.*10:00.*11:00/);
});

test('calendar previews stay inside a narrow viewport', () => {
  const position = presentation.getCalendarPopoverPosition({ left: 200, top: 10, bottom: 30 }, { width: 280, height: 500 });
  assert.ok(position.left >= 16);
});
