import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateMemberStatus } from '../services/activityStatusService.js';

describe('activityStatusService - calculateMemberStatus', () => {
  const mockMember = {
    id: '1',
    name: 'Test User',
    tasks: [],
    calendarEvents: []
  };

  test('should return OFFLINE when no events or tasks exist', () => {
    const status = calculateMemberStatus(mockMember, [], new Date());
    assert.strictEqual(status.status, 'OFFLINE');
  });

  test('should prioritize REUNION over everything', () => {
    const now = new Date();
    const startAt = new Date(now.getTime() - 1000 * 60 * 5).toISOString();
    const endAt = new Date(now.getTime() + 1000 * 60 * 30).toISOString();

    const events = [
      { type: 'JORNADA', startAt, endAt, memberIds: ['1'] },
      { type: 'MEETING', startAt, endAt, memberIds: ['1'], meetingLink: 'http://zoom.us' },
      { type: 'BREAK', startAt, endAt, memberIds: ['1'] }
    ];

    const status = calculateMemberStatus({ ...mockMember, nativeTasks: [{ status: 'EN_CURSO' }] }, events, now);
    assert.strictEqual(status.status, 'REUNION');
  });

  test('should prioritize BREAK (CAFÉ) over JORNADA and Tasks', () => {
    const now = new Date();
    const startAt = new Date(now.getTime() - 1000 * 60 * 5).toISOString();
    const endAt = new Date(now.getTime() + 1000 * 60 * 30).toISOString();

    const events = [
      { type: 'JORNADA', startAt, endAt, memberIds: ['1'] },
      { type: 'BREAK', startAt, endAt, memberIds: ['1'] }
    ];

    const status = calculateMemberStatus({ ...mockMember, nativeTasks: [{ status: 'EN_CURSO' }] }, events, now);
    assert.strictEqual(status.status, 'LIBRE'); // In logic, LIBRE is the zone for BREAK
  });

  test('should prioritize JORNADA over Tasks', () => {
    const now = new Date();
    const startAt = new Date(now.getTime() - 1000 * 60 * 5).toISOString();
    const endAt = new Date(now.getTime() + 1000 * 60 * 30).toISOString();

    const events = [
      { type: 'JORNADA', startAt, endAt, memberIds: ['1'] }
    ];

    const status = calculateMemberStatus({ ...mockMember, nativeTasks: [{ status: 'EN_CURSO' }] }, events, now);
    assert.strictEqual(status.status, 'OCUPADO'); // JORNADA maps to OCUPADO (Central Office)
  });

  test('should return PRODUCCION for Production events', () => {
    const now = new Date();
    const startAt = new Date(now.getTime() - 1000 * 60 * 5).toISOString();
    const endAt = new Date(now.getTime() + 1000 * 60 * 30).toISOString();

    const events = [
      { type: 'PRODUCTION', startAt, endAt, memberIds: ['1'] }
    ];

    const status = calculateMemberStatus(mockMember, events, now);
    assert.strictEqual(status.status, 'PRODUCCION');
  });
});
