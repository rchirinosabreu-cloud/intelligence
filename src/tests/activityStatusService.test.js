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

describe('activityStatusService.calculateMemberStatus (BS-MAP-PRO-V3)', () => {
  it('prioriza PRODUCCION cuando el evento está activo', () => {
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

  it('usa color por actividad Kanban: ENFOCADO si tarea especial', () => {
    const now = new Date('2026-05-02T15:30:00.000Z');
    const member = { ...baseMember, nativeTasks: [{ id: 1, title: 'Deep task', isSpecial: true }] };

    const result = calculateMemberStatus(member, [], now);
    expect(result.status).toBe('ENFOCADO');
  });

  it('usa color por actividad Kanban: OCUPADO si tarea en progreso no especial', () => {
    const now = new Date('2026-05-02T15:30:00.000Z');
    const member = { ...baseMember, nativeTasks: [{ id: 2, title: 'Task en progreso', isSpecial: false }] };

    const result = calculateMemberStatus(member, [], now);
    expect(result.status).toBe('OCUPADO');
  });

  it('queda LIBRE cuando no hay evento ni tarea activa', () => {
    const now = new Date('2026-05-02T15:30:00.000Z');
    const result = calculateMemberStatus(baseMember, [], now);
    expect(result.status).toBe('LIBRE');
  });
});
