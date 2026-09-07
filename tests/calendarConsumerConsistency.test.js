import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateMemberStatus, getTeamActivityStatus } from '../src/services/activityStatusService.js';
import { expandOperationalEventOccurrences } from '../src/services/operationalEventService.js';
import { buildPersonalDashboard } from '../src/services/personalDashboardService.js';
import { buildOperationalHealthSnapshot, getOperationalHealth } from '../src/services/operationalHealthService.js';

const member = { id: 'member', userId: 'user', name: 'Persona', role: 'Contadora', nativeTasks: [] };
const meeting = extra => ({ id: 'event', title: 'Reunión', type: 'MEETING', memberIds: ['member'], startAt: new Date('2026-09-07T14:00Z'), endAt: new Date('2026-09-07T15:00Z'), createdAt: new Date('2026-09-07T13:00Z'), createdById: 'user', recurrence: 'NONE', ...extra });

for (const hidden of [{ googleSyncStatus: 'DELETED' }, { googleSyncStatus: 'MERGED' }, { googleSyncStatus: 'PENDING_DELETE' }, { googleCancelled: true }]) {
  test(`office status ignores calendar tombstone ${JSON.stringify(hidden)}`, () => {
    assert.equal(calculateMemberStatus(member, [meeting(hidden)], new Date('2026-09-07T14:30Z')).status, 'LIBRE');
  });
}

test('an expanded Google recurrence is active using its actual occurrence interval', () => {
  const event = meeting({ recurrence: 'GOOGLE', isRecurrenceOccurrence: true, googleRecurrence: ['RRULE:FREQ=MONTHLY;COUNT=2'] });
  assert.equal(calculateMemberStatus(member, [event], new Date('2026-09-07T14:30Z')).status, 'REUNION');
});

test('an expanded overnight weekly occurrence is checked as one absolute interval', () => {
  const event = meeting({ recurrence: 'WEEKLY', isRecurrenceOccurrence: true, startAt: new Date('2026-09-08T04:00Z'), endAt: new Date('2026-09-08T06:00Z') });
  assert.equal(calculateMemberStatus(member, [event], new Date('2026-09-08T05:30Z')).status, 'REUNION');
});

test('team status uses the shared expanded calendar so cancelled instances do not occupy the office', async () => {
  assert.match(getTeamActivityStatus.toString(), /readEvents/, 'the status service must use the shared occurrence reader');
  let queries = 0;
  const now = new Date('2026-09-14T14:30Z');
  const series = meeting({ googleEventId: 'series', recurrence: 'WEEKLY' });
  const exception = meeting({ id: 'exception', googleRecurringEventId: 'series', googleOriginalStartAt: new Date('2026-09-14T14:00Z'), googleCancelled: true, startAt: new Date('2026-09-14T14:00Z'), endAt: new Date('2026-09-14T15:00Z') });
  const result = await getTeamActivityStatus({
    now, db: { teamMember: { findMany: async () => [member] } },
    readEvents: async (start, end) => { queries += 1; return expandOperationalEventOccurrences([series, exception], start, end); }
  });
  assert.equal(queries, 1);
  assert.equal(result[0].status, 'LIBRE');
});

test('calendar registration challenge excludes deleted, merged and cancelled events', () => {
  const events = [meeting({}), meeting({ googleSyncStatus: 'DELETED' }), meeting({ googleSyncStatus: 'MERGED', createdAt: new Date('2026-09-08T13:00Z') }), meeting({ googleCancelled: true, createdAt: new Date('2026-09-09T13:00Z') }), meeting({ googleSyncStatus: 'PENDING_DELETE', createdAt: new Date('2026-09-10T13:00Z') })];
  const dashboard = buildPersonalDashboard({ member: { ...member, authoredOperationalEvents: events }, now: new Date('2026-09-11T14:30Z') });
  assert.equal(dashboard.weeklyHabit.targetLabel, '1 de 10 eventos registrados esta semana');
});

test('operational health excludes tombstones from adoption and event action counts', () => {
  const snapshot = buildOperationalHealthSnapshot({
    now: new Date('2026-09-09T14:30Z'), users: [{ id: 'user', isActive: true }],
    operationalEvents: [meeting({}), meeting({ googleSyncStatus: 'DELETED' }), meeting({ googleSyncStatus: 'MERGED' }), meeting({ googleCancelled: true }), meeting({ googleSyncStatus: 'PENDING_DELETE' })]
  });
  assert.equal(snapshot.modules.find(module => module.id === 'actividad').current, 1);
});

test('dashboard and operational health queries share a nullable-safe visibility filter', async () => {
  const [dashboardSource, visibility] = await Promise.all([
    readFile(new URL('../src/services/personalDashboardService.js', import.meta.url), 'utf8'),
    import('../src/services/operationalEventVisibility.js').catch(() => ({}))
  ]);
  assert.equal(typeof visibility.getVisibleOperationalEventWhere, 'function');
  const where = visibility.getVisibleOperationalEventWhere();
  assert.equal(where.googleCancelled, false);
  assert.ok(where.OR.some(item => item.googleSyncStatus === null));
  assert.match(dashboardSource, /operationalEvent\.findMany\([\s\S]{0,160}getVisibleOperationalEventWhere\(\)/);
  let eventQuery;
  const db = Object.fromEntries(['user', 'task', 'taskComment', 'contentPlan', 'contentItem', 'quotation', 'globalAnnouncement', 'notification', 'flowMessage', 'client'].map(name => [name, { findMany: async () => [] }]));
  db.operationalEvent = { findMany: async query => { eventQuery = query; return []; } };
  await getOperationalHealth({ requester: { role: 'ADMIN' }, now: new Date('2026-09-09T14:30Z'), db });
  assert.equal(eventQuery.where.googleCancelled, false);
  assert.deepEqual(eventQuery.where.OR, where.OR);
});
