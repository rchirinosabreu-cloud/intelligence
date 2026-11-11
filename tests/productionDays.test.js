import test from 'node:test';
import assert from 'node:assert/strict';
import {
  productionDayState, evidenceProblem, evidenceReminderDue, suggestedClientIds, summarizeProductionDays,
} from '../src/lib/productionDays.js';
import { createProductionDayService, calendarLinkFor } from '../src/services/productionDayService.js';
import { evaluateClientOperation } from '../src/lib/clientOperations.js';

// Reunión de Rodny con su jefe (10 de noviembre de 2026): «no solamente es hacer la jornada, es subir las evidencias …
// se pudo haber registrado en el calendario y él no haber ido».

test('a production day is done only with its evidence, not by being on the calendar', () => {
  assert.equal(productionDayState({ date: '2026-11-12' }, '2026-11-11'), 'AGENDADA');
  assert.equal(productionDayState({ date: '2026-11-11' }, '2026-11-11'), 'AGENDADA', 'the same day is still on time');
  assert.equal(productionDayState({ date: '2026-11-06' }, '2026-11-11'), 'SIN_EVIDENCIA');
  assert.equal(productionDayState({ date: '2026-11-06', evidenceUrl: 'https://drive.google.com/x' }, '2026-11-11'), 'REALIZADA');
});

test('the evidence is an https link and the reason is said in Spanish', () => {
  assert.match(evidenceProblem({ url: '' }), /enlace de la carpeta de Drive/);
  assert.match(evidenceProblem({ url: 'carpeta de fotos' }), /no parece un enlace/);
  assert.match(evidenceProblem({ url: 'http://drive.google.com/x' }), /https/);
  assert.equal(evidenceProblem({ url: 'https://drive.google.com/drive/folders/abc' }), null, 'a Drive folder is the natural evidence');
  assert.match(evidenceProblem({ url: 'https://drive.google.com/x', note: 'a'.repeat(501) }), /500/);
});

test('the reminder goes the day after and once more three days later, never more', () => {
  const day = { date: '2026-11-06', reminders: 0 };
  assert.equal(evidenceReminderDue(day, '2026-11-06'), false);
  assert.equal(evidenceReminderDue(day, '2026-11-07'), true);
  const once = { ...day, reminders: 1, remindedAt: '2026-11-07T14:00:00.000Z' };
  assert.equal(evidenceReminderDue(once, '2026-11-09'), false);
  assert.equal(evidenceReminderDue(once, '2026-11-10'), true);
  assert.equal(evidenceReminderDue({ ...once, reminders: 2 }, '2026-11-20'), false);
  assert.equal(evidenceReminderDue({ ...day, evidenceUrl: 'https://x.y' }, '2026-11-20'), false);
});

test('the event title only suggests a client; it never links one by itself', () => {
  const clients = [{ id: 'm', name: 'Multik' }, { id: 'd', name: 'Desarrollo Económico' }, { id: 'p', name: 'Promo Group / Endova' }];
  assert.deepEqual(suggestedClientIds('Jornada de producción Multik | Casa de Francisco', clients), ['m']);
  assert.deepEqual(suggestedClientIds('Jornada desarrollo economico - Turbaco', clients), ['d']);
  assert.deepEqual(suggestedClientIds('Jornada de Producción Endova / Promo Group', clients), ['p']);
  assert.deepEqual(suggestedClientIds('Revisión plataforma Brain', clients), []);
});

test('the cycle counts its production days against the contract', () => {
  const cycle = { start: '2026-11-01', end: '2026-11-30' };
  const summary = summarizeProductionDays([
    { id: 'a', date: '2026-11-06', evidenceUrl: 'https://drive.google.com/a' },
    { id: 'b', date: '2026-11-09' },
    { id: 'c', date: '2026-11-20' },
    { id: 'old', date: '2026-10-30' },
  ], cycle, { contracted: 2, today: '2026-11-11' });
  assert.equal(summary.contracted, 2);
  assert.equal(summary.scheduled, 3);
  assert.equal(summary.done, 1);
  assert.deepEqual(summary.missingEvidence.map((day) => day.id), ['b']);
  assert.deepEqual(summary.items.map((day) => day.state), ['REALIZADA', 'SIN_EVIDENCIA', 'AGENDADA']);
});

test('the client traffic light says which production day is missing its evidence', () => {
  const client = { contract: { serviceType: 'SERVICIOS', status: 'ACTIVO', startDate: '2026-01-19' }, openTasks: [{ overdue: false }], production: { missingEvidence: [{ date: '2026-11-06' }] } };
  const evaluation = evaluateClientOperation(client, { today: '2026-11-11' });
  assert.equal(evaluation.level, 'yellow');
  assert.match(evaluation.reasons.map((r) => r.text).join(' '), /La jornada del 6 nov no tiene evidencia/);
});

// --- Servicio, con una base en memoria ---
const NOW = new Date('2026-11-11T15:00:00.000Z'); // 10:00 en Bogotá, miércoles
const memoryDb = () => {
  const state = {
    users: [
      { id: 'u-pm', name: 'Kamila', role: 'PROJECT_MANAGER', isActive: true },
      { id: 'u-prod', name: 'Brayan', role: 'EDITOR', isActive: true },
      { id: 'u-other', name: 'Otra', role: 'EDITOR', isActive: true },
    ],
    members: [{ id: 'm-pm', userId: 'u-pm', isActive: true }, { id: 'm-prod', userId: 'u-prod', isActive: true }, { id: 'm-other', userId: 'u-other', isActive: true }],
    events: [
      { id: 'ev-past', title: 'Jornada de producción Multik', type: 'PRODUCTION', startAt: new Date('2026-11-06T14:00:00.000Z'), memberIds: ['m-prod'], createdById: 'u-pm' },
      { id: 'ev-future', title: 'Jornada Multik', type: 'PRODUCTION', startAt: new Date('2026-11-20T14:00:00.000Z'), memberIds: ['m-prod'], createdById: 'u-pm' },
      { id: 'ev-meeting', title: 'Tráfico', type: 'MEETING', startAt: NOW, memberIds: [], createdById: 'u-pm' },
    ],
    clients: [{ id: 'c-multik', name: 'Multik', slug: 'multik', isArchived: false, projectManager: { userId: 'u-pm', isActive: true } }, { id: 'c-old', name: 'Tambores', isArchived: true }],
    days: [],
  };
  const withClient = (day) => ({ ...day, client: state.clients.find((c) => c.id === day.clientId), event: state.events.find((e) => e.id === day.eventId) });
  const db = {
    user: { findUnique: async ({ where }) => state.users.find((u) => u.id === where.id) || null },
    teamMember: {
      findFirst: async ({ where }) => state.members.find((m) => m.userId === where.userId) || null,
      findMany: async ({ where }) => state.members.filter((m) => where.id.in.includes(m.id)),
    },
    operationalEvent: { findUnique: async ({ where }) => state.events.find((e) => e.id === where.id) || null },
    client: {
      findMany: async () => state.clients.filter((c) => !c.isArchived),
      findUnique: async ({ where }) => state.clients.find((c) => c.id === where.id) || null,
    },
    productionDay: {
      findUnique: async ({ where }) => { const day = state.days.find((d) => d.eventId === where.eventId); return day ? withClient(day) : null; },
      findMany: async ({ where }) => state.days.filter((d) => d.evidenceUrl === null && d.date < where.date.lt).map(withClient),
      create: async ({ data }) => { const day = { id: `pd-${state.days.length + 1}`, evidenceUrl: null, reminders: 0, remindedAt: null, ...data }; state.days.push(day); return day; },
      update: async ({ where, data }) => Object.assign(state.days.find((d) => d.id === where.id), data),
      updateMany: async ({ where, data }) => {
        const day = state.days.find((d) => d.id === where.id && d.reminders === where.reminders && d.evidenceUrl === null);
        if (!day) return { count: 0 };
        Object.assign(day, data); return { count: 1 };
      },
      delete: async ({ where }) => { state.days = state.days.filter((d) => d.id !== where.id); },
    },
  };
  return { db, state };
};

test('only managers link a production day to a client, with the title suggestion first', async () => {
  const { db } = memoryDb();
  const service = createProductionDayService({ db, now: () => NOW });
  const view = await service.getByEvent('ev-past', { userId: 'u-pm' });
  assert.equal(view.canLink, true);
  assert.deepEqual(view.clients.map((c) => [c.name, c.suggested]), [['Multik', true]], 'archived clients are not offered');
  await assert.rejects(service.linkClient('ev-past', 'c-multik', { userId: 'u-prod' }), { status: 403 });
  await assert.rejects(service.linkClient('ev-meeting', 'c-multik', { userId: 'u-pm' }), { code: 'NOT_PRODUCTION' });
  await assert.rejects(service.linkClient('ev-past', 'c-old', { userId: 'u-pm' }), { status: 404 });
  const linked = await service.linkClient('ev-past', 'c-multik', { userId: 'u-pm' });
  assert.equal(linked.productionDay.client.name, 'Multik');
  assert.equal(linked.productionDay.date, '2026-11-06');
  assert.equal(linked.productionDay.state, 'SIN_EVIDENCIA');
});

test('who was there uploads the evidence; nobody can before the day or without a client', async () => {
  const { db } = memoryDb();
  const service = createProductionDayService({ db, now: () => NOW });
  await assert.rejects(service.setEvidence('ev-past', { url: 'https://drive.google.com/a' }, { userId: 'u-prod' }), { code: 'NOT_LINKED' });
  await service.linkClient('ev-past', 'c-multik', { userId: 'u-pm' });
  await service.linkClient('ev-future', 'c-multik', { userId: 'u-pm' });
  await assert.rejects(service.setEvidence('ev-past', { url: 'https://drive.google.com/a' }, { userId: 'u-other' }), { status: 403 });
  await assert.rejects(service.setEvidence('ev-future', { url: 'https://drive.google.com/a' }, { userId: 'u-prod' }), { code: 'NOT_YET' });
  await assert.rejects(service.setEvidence('ev-past', { url: 'fotos' }, { userId: 'u-prod' }), { code: 'INVALID_EVIDENCE' });
  const done = await service.setEvidence('ev-past', { url: ' https://drive.google.com/drive/folders/abc ', note: 'Fotos y videos' }, { userId: 'u-prod' });
  assert.equal(done.productionDay.state, 'REALIZADA');
  assert.equal(done.productionDay.evidenceUrl, 'https://drive.google.com/drive/folders/abc');
  assert.equal(done.productionDay.evidenceBy, 'Brayan');
  await assert.rejects(service.linkClient('ev-past', null, { userId: 'u-pm' }), { code: 'HAS_EVIDENCE' }, 'evidence is never lost by unlinking');
});

test('the reminder reaches who was there and the client PM, once per step', async () => {
  const { db } = memoryDb();
  const sent = [];
  const service = createProductionDayService({ db, now: () => NOW, notify: async (data) => { sent.push(data); return data; } });
  await service.linkClient('ev-past', 'c-multik', { userId: 'u-pm' });
  const first = await service.runReminders();
  assert.equal(first.sent, 2);
  assert.deepEqual(sent.map((n) => n.userId).sort(), ['u-pm', 'u-prod']);
  assert.equal(sent[0].type, 'PRODUCTION_EVIDENCE_MISSING');
  assert.match(sent[0].message, /La jornada de Multik del 6\/11 no tiene evidencia/);
  assert.equal(sent[0].url, calendarLinkFor('ev-past', '2026-11-06'));
  const again = await service.runReminders();
  assert.equal(again.sent, 0, 'the same day it is not repeated');
});
