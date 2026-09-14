import test from 'node:test';
import assert from 'node:assert/strict';
import { announcementsInWeek, getAnnouncementWeek } from '../src/lib/announcementWeek.js';

test('the announcement week starts on Monday at midnight in Bogota, not UTC', () => {
  const sunday = getAnnouncementWeek(new Date('2026-09-14T04:59:59.999Z'));
  const monday = getAnnouncementWeek(new Date('2026-09-14T05:00:00.000Z'));
  assert.equal(new Date(sunday.start).toISOString(), '2026-09-07T05:00:00.000Z');
  assert.equal(sunday.end, monday.start);
  assert.equal(new Date(monday.end).toISOString(), '2026-09-21T05:00:00.000Z');
});

test('weekly announcements handle year boundaries, both scopes and immutable history', () => {
  const week = getAnnouncementWeek(new Date('2027-01-01T17:00:00Z'));
  assert.equal(new Date(week.start).toISOString(), '2026-12-28T05:00:00.000Z');
  const history = [
    { id: 'before', scope: 'GLOBAL', createdAt: '2026-12-28T04:59:59Z' },
    { id: 'first', scope: 'GLOBAL', createdAt: '2026-12-28T05:00:00Z' },
    { id: 'personal', scope: 'MEMBER', createdAt: '2027-01-04T04:59:59Z' },
    { id: 'next-week', scope: 'GLOBAL', createdAt: '2027-01-04T05:00:00Z' },
    { id: 'invalid', createdAt: 'not-a-date' },
  ];
  const copy = structuredClone(history);
  assert.deepEqual(announcementsInWeek(history, week).map(item => item.id), ['first', 'personal']);
  assert.deepEqual(history, copy);
});
