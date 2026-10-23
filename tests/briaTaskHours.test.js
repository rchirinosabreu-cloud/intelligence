import test from 'node:test';
import assert from 'node:assert/strict';
import { briaAssistantTools, toolByName } from '../src/services/briaAssistantTools.js';
import { buildInstructions } from '../src/lib/briaAssistant.js';

// Las horas de cada trabajo, siempre las mismas (Rodny, 23 de octubre de 2026): Bria dio las horas de los trabajos de
// 2X Global en octubre en una tabla y, al pedírselas en lista, dijo que no las tenía. La herramienta de tareas trae
// ahora el tiempo registrado de cada una, la fecha de cierre, el filtro por mes y el total que suma la plataforma.

const H = 3_600_000, M = 60_000;
const admin = { userId: 'u-rodny', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true } };
const done = (id, title, closedAt, ms, extra = {}) => ({ id, title, status: 'REALIZADA', completedAt: new Date(closedAt), startedAt: null, accumulatedWorkMs: ms, client: { name: '2X Global' }, assignee: { name: 'Melissa Castaño' }, ...extra });
const tasks = [
  done('t1', 'Vídeo: Resilient Futures Fund (RFF) Cape Town con Amazon', '2026-10-16T20:00:00Z', 8 * H + 15 * M, { assignee: { name: 'Rodny Chirinos' } }),
  done('t2', 'Carrusel Why FIs', '2026-10-14T20:00:00Z', 5 * H + 10 * M),
  done('t3', 'Ajuste post 2X Global', '2026-10-19T20:00:00Z', H),
  done('t4', 'Annual Report', '2026-09-28T20:00:00Z', 6 * H),
  // Cerrada a las 22:00 del 31 de octubre en Bogotá: es de octubre, aunque en UTC ya sea noviembre.
  done('t5', 'Countdown · 2X Certification for FIs', '2026-11-01T03:00:00Z', 30_000),
  { id: 't6', title: 'Informe KORE', status: 'EN_CURSO', completedAt: null, startedAt: new Date('2026-10-23T15:00:00Z'), accumulatedWorkMs: H, client: { name: '2X Global' }, assignee: { name: 'Melissa Castaño' } }
];
const tool = toolByName;
const ctx = { user: admin, today: '2026-10-23', now: () => new Date('2026-10-23T16:00:00Z'), getTasks: async () => tasks };

test('las tareas cerradas de un mes traen el tiempo de cada una y el total que suma la plataforma', async () => {
  const { data } = await tool('tareas_de_cliente').run({ clientId: 'c-2x', mes: 10, anio: 2026 }, ctx);
  assert.equal(data.periodo, 'octubre de 2026');
  assert.deepEqual(data.tareas.map((row) => row.id), ['t1', 't2', 't3', 't5'], 'solo lo cerrado en octubre, en reloj de Bogotá');
  assert.deepEqual(data.tareas.map((row) => row.tiempoRegistrado), ['8 h 15 min', '5 h 10 min', '1 h', 'sin tiempo registrado']);
  assert.equal(data.tareas[0].cerrada, '2026-10-16');
  // 8 h 15 + 5 h 10 + 1 h + 30 s: el total es la suma exacta, redondeada al minuto.
  assert.deepEqual([data.total, data.tiempoTotal, data.minutosTotales, data.sinTiempo], [4, '14 h 26 min', 866, 1]);
  assert.match(data.instruccion, /mismas cifras/);
});

test('una tarea en proceso cuenta lo que lleva corriendo, igual que el historial de la tarea', async () => {
  const { data } = await tool('tareas_de_cliente').run({ clientId: 'c-2x', estado: 'en_proceso' }, ctx);
  assert.equal(data.tareas[0].tiempoRegistrado, '2 h', 'una hora acumulada más una que lleva corriendo');
});

test('Bria vuelve a consultar cuando le piden lo mismo en otro formato, y no usa los promedios de Ritmo para las horas de un trabajo', () => {
  const instructions = buildInstructions({ user: admin, tools: briaAssistantTools, today: '2026-10-23', person: { name: 'Rodny' } });
  assert.match(instructions, /vuelve a consultar con la misma herramienta y entrega las mismas cifras/);
  assert.match(instructions, /Nunca digas que un dato no está disponible si en esta conversación ya lo diste/);
  assert.match(instructions, /los promedios de Ritmo son otra cosa/);
});
