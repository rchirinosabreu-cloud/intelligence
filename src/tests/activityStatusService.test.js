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

describe('activityStatusService.calculateMemberStatus (BS-MAP-REBORN)', () => {
  it('asigna PRODUCCION por evento activo tipo PRODUCTION', () => {
    const now = new Date('2026-05-02T15:30:00.000Z');
    const production = {
      type: 'PRODUCTION',
      title: 'Grabación de contenido',
      startAt: '2026-05-02T15:00:00.000Z',
      endAt: '2026-05-02T17:00:00.000Z',
      recurrence: 'NONE',
      memberIds: [7]
    };

    const result = calculateMemberStatus(baseMember, [production], now);
    expect(result.status).toBe('PRODUCCION');
  });

  it('asigna PRODUCCION por tarea técnica activa', () => {
    const now = new Date('2026-05-02T15:30:00.000Z');
    const member = { ...baseMember, nativeTasks: [{ id: 1, title: 'Infra deploy', isSpecial: false, isTechnical: true }] };

    const result = calculateMemberStatus(member, [], now);
    expect(result.status).toBe('PRODUCCION');
  });

  it('asigna ENFOCADO por tarea especial en foco', () => {
    const now = new Date('2026-05-02T15:30:00.000Z');
    const member = { ...baseMember, nativeTasks: [{ id: 2, title: 'Deep task', isSpecial: true, isTechnical: false }] };

    const result = calculateMemberStatus(member, [], now);
    expect(result.status).toBe('ENFOCADO');
  });

  it('asigna OCUPADO por tarea en progreso no especial', () => {
    const now = new Date('2026-05-02T15:30:00.000Z');
    const member = { ...baseMember, nativeTasks: [{ id: 3, title: 'Task en progreso', isSpecial: false, isTechnical: false }] };

    const result = calculateMemberStatus(member, [], now);
    expect(result.status).toBe('OCUPADO');
  });

  it('queda LIBRE sin tareas ni eventos', () => {
    const now = new Date('2026-05-02T15:30:00.000Z');
    const result = calculateMemberStatus(baseMember, [], now);
    expect(result.status).toBe('LIBRE');
  });
});
