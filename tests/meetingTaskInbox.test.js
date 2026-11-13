// La bandeja de pendientes de reuniones (Rodny, 13 de noviembre de 2026: «yo quiero tener un lugar donde ya los tenga
// armados y yo los vea, confirme y apruebe o descarte … prefiero lo de que se reúna por reuniones de Fireflies … debe
// vivir en Manager»). Bria arma cada compromiso de la minuta con responsable, fecha, prioridad y cliente propuestos;
// la persona lo abre en el creador único de pendientes ya montado, lo despacha o lo descarta. Lógica pura compartida
// por pantalla y servidor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rankByName } from '../src/lib/fuzzyMatch.js';
import {
  buildMeetingInbox, discardProblem, markDiscarded, markCreated, inboxKey, sourceProblem, taskPrefillOf,
  INBOX_DISCARD_REASONS, INBOX_PRIORITIES, INBOX_NOTE_MAX, MINUTE_SOURCE_KIND
} from '../src/lib/meetingTaskInbox.js';

const today = '2026-11-13';
const members = [
  { id: 'm-kam', name: 'Kamila Pérez', userId: 'u-kam' },
  { id: 'm-jar', name: 'Jarlan Pérez', userId: 'u-jar' },
  { id: 'm-mel', name: 'Melissa Castaño', userId: 'u-mel' },
  { id: 'm-mro', name: 'Melissa Rojas', userId: 'u-mro' }
];
const clients = [{ id: 'c-end', name: 'Endova' }, { id: 'c-ari', name: 'Aristea' }];
const rank = (rows, term) => rankByName(rows, term, (row) => row.name);
const minute = (over = {}) => ({
  id: 'mm-1', title: 'Reunión Endova noviembre', meetingAt: new Date('2026-11-12T14:00:00Z'), status: 'READY',
  actionItems: [
    { task: 'Enviar el guion del reel de lanzamiento', owner: 'Kamila', dueDate: '2026-11-17', priority: 'alta' },
    { task: 'Revisar el logo nuevo con el cliente', owner: 'Jarlan Peres', dueDate: null, priority: null },
    { task: 'Definir quién lleva las historias', owner: 'Melissa', dueDate: 'viernes', priority: null },
    { task: 'Ya creado', owner: 'Kamila', dueDate: null, priority: null, taskId: 't-9' },
    { task: 'Descartado antes', owner: 'Kamila', dueDate: null, priority: null, discarded: { reason: 'YA_HECHO', at: '2026-11-12T20:00:00Z' } }
  ],
  ...over
});

test('the inbox proposes, never guesses: client by the title, owner only when unique, date parsed, created and discarded left out', () => {
  const inbox = buildMeetingInbox({ minutes: [minute()], clients, members, today, rank });
  assert.equal(inbox.length, 1);
  const [row] = inbox;
  assert.deepEqual([row.minuteId, row.label, row.clientId, row.clientName, row.clientNote], ['mm-1', '«Reunión Endova noviembre» del 12 de noviembre', 'c-end', 'Endova', 'por el título de la reunión']);
  assert.deepEqual(row.items.map((item) => [item.n, item.title, item.assigneeId, item.assigneeNote, item.dueDay, item.priority]), [
    [1, 'Enviar el guion del reel de lanzamiento', 'm-kam', null, '2026-11-17', 'ALTA'],
    [2, 'Revisar el logo nuevo con el cliente', 'm-jar', '«Jarlan Peres» lo entendí como Jarlan Pérez', null, 'NORMAL'],
    [3, 'Definir quién lleva las historias', null, '«Melissa» puede ser Melissa Castaño o Melissa Rojas', '2026-11-20', 'NORMAL']
  ], 'two Melissas is a question, never a guess; the created and the discarded are not in the tray');
  assert.equal(row.items[0].key, inboxKey('mm-1', 1));
  assert.equal(row.items[0].key, 'R:mm-1:1');
  assert.match(row.items[0].context, /De la reunión «Reunión Endova noviembre» del 12 de noviembre\. Responsable según la reunión: Kamila\. Compromiso: Enviar el guion/);
  assert.equal(row.pending, 3);
  assert.equal(row.created, 1);
  assert.equal(row.discardedCount, 1);
});

test('a minute with nothing pending is not in the tray; the newest meeting goes first; a READY status is required', () => {
  const done = minute({ id: 'mm-0', actionItems: [{ task: 'Hecho', owner: 'Kamila', taskId: 't-1' }] });
  const older = minute({ id: 'mm-2', title: 'Comité', meetingAt: new Date('2026-11-05T14:00:00Z') });
  const raw = minute({ id: 'mm-3', status: 'PROCESSING' });
  const inbox = buildMeetingInbox({ minutes: [done, older, minute(), raw], clients, members, today, rank });
  assert.deepEqual(inbox.map((row) => row.minuteId), ['mm-1', 'mm-2']);
  assert.equal(inbox[1].clientId, null, 'a title without a client proposes none');
});

test('opening a card hands the single task creator everything already assembled, with the mark of where it comes from', () => {
  const inbox = buildMeetingInbox({ minutes: [minute()], clients, members, today, rank });
  const [row] = inbox;
  const first = taskPrefillOf(row, row.items[0]);
  assert.deepEqual(first, {
    title: 'Enviar el guion del reel de lanzamiento', clientId: 'c-end', assigneeId: 'm-kam', collaboratorIds: [], dueDate: '2026-11-17', priority: 'ALTA',
    comments: [row.items[0].context], source: { kind: MINUTE_SOURCE_KIND, minuteId: 'mm-1', n: 1 }
  });
  assert.match(first.comments[0], /De la reunión «Reunión Endova noviembre»/);
  const third = taskPrefillOf(row, row.items[2]);
  assert.deepEqual([third.assigneeId, third.dueDate, third.priority, third.source.n], ['', '2026-11-20', 'NORMAL', 3], 'two Melissas: no assignee for the person to choose; «viernes» is the next Friday');
  const second = taskPrefillOf(row, row.items[1]);
  assert.deepEqual([second.assigneeId, second.dueDate], ['m-jar', ''], 'what the meeting did not say stays empty');
  const noClient = taskPrefillOf({ ...row, clientId: null }, row.items[0]);
  assert.equal(noClient.clientId, '', 'a meeting without a client proposes none; the panel asks for one');
  assert.deepEqual(INBOX_PRIORITIES.map((p) => p.value), ['NORMAL', 'ALTA', 'URGENTE']);
});

test('the source mark of a new task must point at a commitment of a minute', () => {
  assert.equal(sourceProblem({ kind: 'MINUTE', minuteId: 'mm-1', n: 2 }), null);
  assert.match(sourceProblem(null), /reunión/);
  assert.match(sourceProblem({ kind: 'CHAT', minuteId: 'mm-1', n: 1 }), /origen/);
  assert.match(sourceProblem({ kind: 'MINUTE', minuteId: ' ', n: 1 }), /reunión/);
  assert.match(sourceProblem({ kind: 'MINUTE', minuteId: 'mm-1', n: 0 }), /compromiso/);
  assert.match(sourceProblem({ kind: 'MINUTE', minuteId: 'mm-1', n: '2.5' }), /compromiso/);
});

test('discarding needs a reason from the list; «Otro motivo» needs the note; nothing is deleted, the item keeps who and why', () => {
  assert.equal(discardProblem({ minuteId: 'mm-1', n: 2, motivo: 'YA_HECHO' }), null);
  assert.match(discardProblem({ minuteId: 'mm-1', n: 0, motivo: 'YA_HECHO' }), /compromiso/);
  assert.match(discardProblem({ minuteId: 'mm-1', n: 2, motivo: 'PORQUE_SI' }), /motivo/);
  assert.match(discardProblem({ minuteId: 'mm-1', n: 2, motivo: 'OTRO' }), /cuéntame/);
  assert.match(discardProblem({ minuteId: 'mm-1', n: 2, motivo: 'OTRO', nota: 'x'.repeat(INBOX_NOTE_MAX + 1) }), /nota/);
  assert.deepEqual(INBOX_DISCARD_REASONS.map((r) => r.value), ['YA_HECHO', 'NO_ES_PENDIENTE', 'DEL_CLIENTE', 'OTRO']);
  const at = '2026-11-13T15:00:00.000Z';
  const next = markDiscarded(minute().actionItems, 2, { reason: 'DEL_CLIENTE', note: '', by: 'u-rod', byName: 'Rodny', at });
  assert.equal(next[1].task, 'Revisar el logo nuevo con el cliente', 'the text stays');
  assert.deepEqual(next[1].discarded, { reason: 'DEL_CLIENTE', note: null, by: 'u-rod', byName: 'Rodny', at });
  assert.equal(minute().actionItems[1].discarded, undefined, 'the original array is not mutated');
  const created = markCreated(minute().actionItems, 1, 't-77');
  assert.equal(created[0].taskId, 't-77');
  assert.equal(created[0].task, 'Enviar el guion del reel de lanzamiento');
});
