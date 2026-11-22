// El cierre del día, el foco de la semana y la revisión del mes viven cada uno en su chat fijo, igual que la lectura
// de la mañana (Rodny, 20 de noviembre de 2026: «qué otras cosas pueden funcionar siempre en un solo chat» y
// «ok, trabájalo así»). La primera entrega abre el chat; las siguientes entran como un mensaje más de Bria.
import test from 'node:test';
import assert from 'node:assert/strict';
import { leaveThreadNote, DAILY_CLOSE_THREAD_TITLE, WEEKLY_FOCUS_THREAD_TITLE, MONTHLY_REVIEW_THREAD_TITLE } from '../src/lib/briaThreadNotes.js';
import { createDailyCloseService } from '../src/services/dailyCloseService.js';
import { createWeeklyFocusService } from '../src/services/weeklyFocusService.js';
import { createMonthlyReviewService } from '../src/services/monthlyReviewService.js';

const quiet = { error() {}, log() {} };
const threadStore = (notes) => ({
  postAssistantNote: async () => { throw new Error('no debe abrir un chat suelto'); },
  postThreadNote: async (actor, note) => { notes.push(note); return { id: `hilo-${note.metadata.note}` }; }
});

test('leaveThreadNote uses the fixed thread with its fixed title, and a store without threads keeps the dated chat', async () => {
  const seen = [];
  const withThreads = { marker: 'a', async postThreadNote(actor, note) { seen.push([this.marker, 'thread', note.title]); return { id: 'x' }; }, async postAssistantNote() { seen.push(['a', 'loose']); } };
  const without = { marker: 'b', async postAssistantNote(actor, note) { seen.push([this.marker, 'loose', note.title]); return { id: 'y' }; } };
  const note = { threadTitle: 'Cierre del día', title: 'Cierre del día · 13 de octubre', text: 'x', metadata: { note: 'CIERRE_DIA' } };
  assert.equal((await leaveThreadNote(withThreads, { ref: 'u' }, note)).id, 'x');
  assert.equal((await leaveThreadNote(without, { ref: 'u' }, note)).id, 'y');
  assert.deepEqual(seen, [['a', 'thread', 'Cierre del día'], ['b', 'loose', 'Cierre del día · 13 de octubre']]);
  assert.deepEqual([DAILY_CLOSE_THREAD_TITLE, WEEKLY_FOCUS_THREAD_TITLE, MONTHLY_REVIEW_THREAD_TITLE], ['Cierre del día', 'Foco de la semana', 'Revisión del mes']);
});

test('the daily close goes into its fixed chat and the notice points to that chat', async () => {
  const notes = [], notices = [], deliveries = new Map();
  const user = { id: 'u-kamila', name: 'Kamila Pérez', role: 'PROJECT_MANAGER', modulePermissions: { bria: true }, teamMember: { id: 'm-kam', name: 'Kamila Pérez' } };
  const service = createDailyCloseService({
    db: { teamMember: { findMany: async () => [{ id: 'm-kam', name: 'Kamila Pérez', user: { role: 'PROJECT_MANAGER' } }] }, task: { findMany: async () => [] } },
    repository: { dailyCloseDelivery: async (day, ref) => deliveries.get(`${day}:${ref}`) || null, recordDailyCloseDelivery: async (day, ref, id) => { deliveries.set(`${day}:${ref}`, { conversationId: id }); return { dayKey: day, userRef: ref, conversationId: id }; } },
    conversations: threadStore(notes), now: () => new Date('2026-10-13T22:05:00Z'), notify: async (notice) => { notices.push(notice); },
    listPeople: async () => [user], logger: quiet, whatsapp: () => {}
  });
  await service.runAutomatic();
  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, 'Cierre del día');
  assert.deepEqual([notes[0].metadata.note, notes[0].metadata.dayKey], ['CIERRE_DIA', '2026-10-13']);
  assert.equal(notices[0].relatedId, 'hilo-CIERRE_DIA');
  assert.equal([...deliveries.values()][0].conversationId, 'hilo-CIERRE_DIA');
});

test('the weekly focus goes into its fixed chat', async () => {
  const notes = [], deliveries = new Map();
  const user = { id: 'u-kamila', name: 'Kamila Pérez', role: 'PROJECT_MANAGER', modulePermissions: { bria: true }, teamMember: { id: 'm-kam', name: 'Kamila Pérez' } };
  const service = createWeeklyFocusService({
    db: { task: { findMany: async () => [] } }, conversations: threadStore(notes),
    repository: { focusDelivery: async (week, ref) => deliveries.get(`${week}:${ref}`) || null, recordFocusDelivery: async (week, ref, id) => { deliveries.set(`${week}:${ref}`, { conversationId: id }); return { weekKey: week, userRef: ref, conversationId: id }; } },
    load: { get: async () => ({ signals: [] }) }, now: () => new Date('2026-10-12T13:00:00Z'), notify: async () => {}, listPeople: async () => [user], logger: quiet
  });
  const delivery = await service.deliver(user, { weekKey: '2026-W42' });
  assert.equal(notes[0].title, 'Foco de la semana');
  assert.deepEqual([notes[0].metadata.note, notes[0].metadata.weekKey], ['FOCO_SEMANAL', '2026-W42']);
  assert.equal(delivery.conversationId, 'hilo-FOCO_SEMANAL');
});

test('the monthly review goes into its fixed chat', async () => {
  const notes = [], deliveries = new Map();
  const month = (label) => ({ period: { label }, clients: [], totals: {} });
  const service = createMonthlyReviewService({
    db: {}, now: () => new Date('2026-10-01T14:00:00Z'), listPeople: async () => [], logger: quiet, conversations: threadStore(notes),
    profitability: { read: async () => month('septiembre de 2026') },
    repository: { monthlyReviewDelivery: async (key, ref) => deliveries.get(`${key}:${ref}`) || null, recordMonthlyReviewDelivery: async (key, ref, id) => { deliveries.set(`${key}:${ref}`, { conversationId: id }); return { monthKey: key, userRef: ref, conversationId: id }; } },
    notify: async () => {}, whatsapp: () => {}
  });
  const admin = { id: 'u-rodny', name: 'Rodny Chirinos', role: 'ADMIN', teamMember: { id: 'm1', name: 'Rodny Chirinos' } };
  const delivery = await service.deliver(admin, { current: month('septiembre de 2026'), previous: null }, '2026-09');
  assert.equal(notes[0].title, 'Revisión del mes');
  assert.deepEqual([notes[0].metadata.note, notes[0].metadata.monthKey], ['REVISION_MES', '2026-09']);
  assert.equal(delivery.conversationId, 'hilo-REVISION_MES');
});
