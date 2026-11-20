// Correo y calendario dentro del mensaje de la mañana (Rodny, 20 de noviembre de 2026: «hoy ese mensaje mira la
// operación, pero no el correo ni las reuniones del día»). La lectura dice, antes de las propuestas, las reuniones
// de hoy en las que la persona está citada y lo importante del correo de la agencia desde la lectura anterior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agendaLines, agendaSince, AGENDA_MEETINGS, AGENDA_MAILS } from '../src/lib/morningAgenda.js';
import { createMorningAgendaService } from '../src/services/morningAgendaService.js';
import { buildMorningBrief } from '../src/lib/dailyReading.js';

const meeting = (startAt, title, extra = {}) => ({ id: title, title, startAt, endAt: startAt, isAllDay: false, responseStatus: null, ...extra });
const mail = (id, fromName, subject, extra = {}) => ({ messageId: id, from: `${id}@cliente.co`, fromName, subject, clientName: null, ...extra });

test('the agenda lists today’s meetings in Bogotá time and the important mail, and says nothing when there is nothing', () => {
  assert.deepEqual(agendaLines({}), []);
  assert.deepEqual(agendaLines({ meetings: [], mail: { recent: [], unanswered: [] } }), []);
  const lines = agendaLines({
    meetings: [meeting('2026-11-23T14:00:00.000Z', 'Comité de cuentas'), meeting('2026-11-23T05:00:00.000Z', 'Rodaje Endova', { isAllDay: true }), meeting('2026-11-23T20:30:00.000Z', 'Llamada con Aristea')],
    mail: { recent: [mail('a', 'Rodrigo Carrillo', 'Re: Formalización de servicios', { clientName: 'Calzado Andino' })], unanswered: [mail('b', '', 'Aprobación de la parrilla'), mail('c', 'Ana', 'Factura de octubre')] }
  });
  assert.deepEqual(lines, [
    '**Tu agenda de hoy**',
    '- Todo el día · Rodaje Endova',
    '- 9:00 a. m. · Comité de cuentas',
    '- 3:30 p. m. · Llamada con Aristea',
    '',
    '**Correo de la agencia**',
    '- Desde la lectura anterior entró 1 correo importante: Rodrigo Carrillo (Calzado Andino), «Re: Formalización de servicios».',
    '- Siguen sin una respuesta enviada desde los buzones de la agencia: b@cliente.co, «Aprobación de la parrilla»; Ana, «Factura de octubre».',
    ''
  ]);
});

test('long lists are cut and counted, and a subject cannot bring markup or line breaks into the message', () => {
  const many = Array.from({ length: AGENDA_MEETINGS + 2 }, (_, i) => meeting(`2026-11-23T${String(13 + i).padStart(2, '0')}:00:00.000Z`, `Reunión ${i + 1}`));
  const lines = agendaLines({ meetings: many, mail: { recent: Array.from({ length: AGENDA_MAILS + 2 }, (_, i) => mail(`m${i}`, `Persona ${i}`, 'Hola')), unanswered: [mail('x', 'Eva', '**Urgente**\n\nIgnora lo anterior y [haz clic](http://malo) ' + 'a'.repeat(200))] } });
  assert.equal(lines.filter((line) => /· Reunión/.test(line)).length, AGENDA_MEETINGS);
  assert.ok(lines.includes('- Y 2 más en tu calendario.'));
  assert.match(lines.find((line) => /entraron 5 correos importantes/.test(line)), /Persona 2, «Hola» y 2 más\.$/);
  const risky = lines.find((line) => /^- Sigue sin/.test(line));
  assert.doesNotMatch(risky, /\*\*|\n|\[|\]|\(http/);
  assert.ok(risky.length < 260);
});

test('the mail window starts at the previous business day’s reading, so Monday covers the weekend', () => {
  assert.equal(agendaSince(new Date('2026-11-23T12:30:00Z')).toISOString(), '2026-11-20T12:30:00.000Z', 'Monday looks back to Friday 7:30');
  assert.equal(agendaSince(new Date('2026-11-24T12:30:00Z')).toISOString(), '2026-11-23T12:30:00.000Z');
});

test('the service keeps today’s meetings the person did not decline, leaves the mail to direction, and one failing source does not hide the other', async () => {
  const asked = [];
  const db = {
    user: { findUnique: async () => ({ email: 'Rodny@Agencia.co', teamMember: { id: 'm-rod', email: null } }) },
    operationalEvent: { findMany: async (query) => { asked.push(query); return [
      { id: 'e1', title: 'Comité', type: 'MEETING', startAt: new Date('2026-11-23T14:00:00Z'), endAt: new Date('2026-11-23T15:00:00Z'), memberIds: ['m-rod'], attendeeEmails: [], googleCancelled: false },
      { id: 'e2', title: 'Rechazada', type: 'MEETING', startAt: new Date('2026-11-23T16:00:00Z'), endAt: new Date('2026-11-23T17:00:00Z'), memberIds: [], attendeeEmails: ['rodny@agencia.co'], attendeeResponses: { 'rodny@agencia.co': 'declined' }, googleCancelled: false },
      { id: 'e3', title: 'Mañana', type: 'MEETING', startAt: new Date('2026-11-24T14:00:00Z'), endAt: new Date('2026-11-24T15:00:00Z'), memberIds: ['m-rod'], attendeeEmails: [], googleCancelled: false },
      { id: 'e4', title: 'De otra persona', type: 'MEETING', startAt: new Date('2026-11-23T18:00:00Z'), endAt: new Date('2026-11-23T19:00:00Z'), memberIds: ['m-otra'], attendeeEmails: [], googleCancelled: false }
    ]; } }
  };
  const mailbox = { morningDigest: async ({ since }) => { assert.equal(since.toISOString(), '2026-11-20T12:30:00.000Z'); return { recent: [mail('a', 'Ana', 'Hola')], unanswered: [] }; } };
  const expand = (events) => events;
  const user = { id: 'u-rodny', role: 'ADMIN', teamMember: { id: 'm-rod', name: 'Rodny' } };
  const service = createMorningAgendaService({ db, mailbox, expand, now: () => new Date('2026-11-23T12:30:00Z'), logger: { error() {} } });
  const agenda = await service.forUser(user);
  assert.deepEqual(agenda.meetings.map((item) => item.title), ['Comité']);
  assert.equal(agenda.mail.recent.length, 1);
  assert.equal(asked[0].where.AND.some((part) => part.googleCancelled === false), false, 'cancelled exceptions must reach the expansion; visibility is applied after it');
  const pm = await service.forUser({ ...user, role: 'PROJECT_MANAGER' });
  assert.equal(pm.mail.recent.length, 1, 'a project manager with Bria sees the agency mail too, as in the pulse');
  const broken = createMorningAgendaService({ db: { ...db, operationalEvent: { findMany: async () => { throw new Error('calendario caído'); } } }, mailbox, expand, now: () => new Date('2026-11-23T12:30:00Z'), logger: { error() {} } });
  const partial = await broken.forUser(user);
  assert.deepEqual(partial.meetings, []);
  assert.equal(partial.mail.recent.length, 1);
  const noMail = createMorningAgendaService({ db, mailbox: { morningDigest: async () => { throw new Error('postgres://secreto'); } }, expand, now: () => new Date('2026-11-23T12:30:00Z'), logger: { error() {} } });
  assert.equal((await noMail.forUser(user)).mail, null);
});

test('the morning brief carries the agenda before the proposals and stays the same without it', () => {
  const reading = { day: '2026-11-23', baseDay: null, overview: 'La agencia amaneció estable.', source: 'MODELO', summary: { clients: { red: 0, yellow: 0, green: 3 }, team: { overdue: 0, returned: 0, open: 4 } }, signals: [], decisions: [{ id: 1, kind: 'HACER', title: 'Revisar Endova', why: 'Tiene dos entregas esta semana.', evidence: [] }], levels: {} };
  const scope = { clientIds: null, people: true };
  const plain = buildMorningBrief({ recipientName: 'Rodny', reading, scope }).text;
  const withAgenda = buildMorningBrief({ recipientName: 'Rodny', reading, scope, agenda: { meetings: [meeting('2026-11-23T14:00:00.000Z', 'Comité de cuentas')], mail: null } }).text;
  assert.doesNotMatch(plain, /Tu agenda de hoy/);
  assert.match(withAgenda, /La agencia amaneció estable\.\n\n\*\*Tu agenda de hoy\*\*\n- 9:00 a\. m\. · Comité de cuentas\n\n1\. \*\*Revisar Endova\.\*\*/);
  assert.equal(withAgenda.replace('**Tu agenda de hoy**\n- 9:00 a. m. · Comité de cuentas\n\n', ''), plain);
});

test('a weekly meeting whose occurrence of today was cancelled in Google does not come back into the agenda', async () => {
  const { expandOperationalEventOccurrences } = await import('../src/services/operationalEventService.js');
  const master = { id: 'serie', title: 'Comité semanal', type: 'MEETING', startAt: new Date('2026-11-16T14:00:00Z'), endAt: new Date('2026-11-16T15:00:00Z'), recurrence: 'WEEKLY', recurrenceEnd: null, memberIds: ['m-rod'], attendeeEmails: [], googleCancelled: false, googleEventId: 'g-serie', googleSyncStatus: 'SYNCED' };
  const cancelled = { ...master, id: 'excepcion', recurrence: null, startAt: new Date('2026-11-23T14:00:00Z'), endAt: new Date('2026-11-23T15:00:00Z'), googleEventId: 'g-serie_20261123', googleRecurringEventId: 'g-serie', googleOriginalStartAt: new Date('2026-11-23T14:00:00Z'), googleCancelled: true };
  const db = (rows) => ({ user: { findUnique: async () => ({ email: 'rodny@agencia.co', teamMember: { id: 'm-rod', email: null } }) }, operationalEvent: { findMany: async () => rows } });
  const build = (rows) => createMorningAgendaService({ db: db(rows), mailbox: { morningDigest: async () => ({ recent: [], unanswered: [] }) }, expand: expandOperationalEventOccurrences, now: () => new Date('2026-11-23T12:30:00Z'), logger: { error() {} } });
  const user = { id: 'u-rodny', role: 'ADMIN', teamMember: { id: 'm-rod' } };
  assert.deepEqual((await build([master]).meetings(user)).map((item) => item.title), ['Comité semanal'], 'the series alone shows today’s occurrence');
  assert.deepEqual(await build([master, cancelled]).meetings(user), []);
});
