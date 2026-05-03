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
  it('no debe mover a REUNION si el evento es futuro', () => {
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

    expect(result.status).toBe('OFFLINE');
  });

  it('debe asignar OCUPADO para evento activo WORK_DAY/JORNADA', () => {
    const now = new Date('2026-05-02T15:30:00.000Z');
    const jornada = {
      type: 'JORNADA',
      title: 'Jornada Laboral',
      startAt: '2026-05-02T15:00:00.000Z',
      endAt: '2026-05-02T16:00:00.000Z',
      recurrence: 'NONE',
      memberIds: [7]
    };

    const result = calculateMemberStatus(baseMember, [jornada], now);

    expect(result.status).toBe('OCUPADO');
  });

  it('debe permanecer OFFLINE si no tiene eventos activos ni tareas EN_CURSO', () => {
    const now = new Date('2026-05-02T15:30:00.000Z');

    const result = calculateMemberStatus(baseMember, [], now);

    expect(result.status).toBe('OFFLINE');
  });
});
