import { describe, it, expect } from 'vitest';
import { calculateMemberStatus } from '../services/activityStatusService.js';

const baseMember = {
  id: 7,
  name: 'Camila',
  role: 'Analista',
  avatarUrl: null,
  desktopX: 0,
  desktopY: 0,
  statusMessage: '',
  nativeTasks: []
};

describe('activityStatusService.calculateMemberStatus', () => {
  it('prioriza PERMISSION/VACATION sobre cualquier otro evento', () => {
    const now = new Date('2026-05-02T15:30:00.000Z');
    const meeting = {
      type: 'MEETING',
      title: 'Sala de juntas',
      startAt: '2026-05-02T15:00:00.000Z',
      endAt: '2026-05-02T16:00:00.000Z',
      recurrence: 'NONE',
      memberIds: [7]
    };
    const permission = {
      type: 'PERMISSION',
      title: 'Cita médica',
      startAt: '2026-05-02T15:00:00.000Z',
      endAt: '2026-05-02T17:00:00.000Z',
      recurrence: 'NONE',
      memberIds: [7]
    };

    const result = calculateMemberStatus(baseMember, [meeting, permission], now);

    expect(result.status).toBe('AUSENTE');
  });

  it('asigna ENFOCADO para evento activo DEEP_WORK/FOCUS', () => {
    const now = new Date('2026-05-02T15:30:00.000Z');
    const focus = {
      type: 'FOCUS',
      title: 'Bloque de concentración',
      startAt: '2026-05-02T15:00:00.000Z',
      endAt: '2026-05-02T16:00:00.000Z',
      recurrence: 'NONE',
      memberIds: [7]
    };

    const result = calculateMemberStatus(baseMember, [focus], now);

    expect(result.status).toBe('ENFOCADO');
  });

  it('asigna LIBRE en oficina central cuando no hay evento activo', () => {
    const now = new Date('2026-05-02T15:30:00.000Z');

    const result = calculateMemberStatus(baseMember, [], now);

    expect(result.status).toBe('LIBRE');
  });

  it('no activa reunión futura', () => {
    const now = new Date('2026-05-02T15:00:00.000Z');
    const futureMeeting = {
      type: 'MEETING',
      title: 'Sala de juntas',
      startAt: '2026-05-04T15:00:00.000Z',
      endAt: '2026-05-04T16:00:00.000Z',
      recurrence: 'NONE',
      memberIds: [7]
    };

    const result = calculateMemberStatus(baseMember, [futureMeeting], now);

    expect(result.status).toBe('LIBRE');
  });
});
