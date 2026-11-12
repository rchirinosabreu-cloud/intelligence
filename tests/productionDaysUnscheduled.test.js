import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PRODUCTION_DAY_STATES, monthBoardRows, proposedJornadaDate } from '../src/lib/productionDays.js';

// Rodny, 12 de noviembre de 2026: «las que dice "por agendar" deberían estar en la misma tabla pero que diga "no
// agendado" … si le doy click a su estado podría abrirse allí el panel del calendario para seleccionar fecha».

test('what the contract asks and is not on the calendar is one "No agendada" row per jornada, after the scheduled ones', () => {
  const items = [{ id: 'a', state: 'REALIZADA', date: '2026-11-05', clientName: 'Félix Finas' }];
  const pending = [
    { client: { id: 'c2', name: 'Pablo Hoff', slug: 'pablo-hoff' }, contracted: 1, scheduled: 0, missing: 1 },
    { client: { id: 'c1', name: 'Bonsai', slug: 'bonsai' }, contracted: 2, scheduled: 0, missing: 2 },
    { client: { id: 'c3', name: 'Félix Finas', slug: 'felix' }, contracted: 2, scheduled: 1, missing: 1 },
  ];
  const rows = monthBoardRows(items, pending);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].id, 'a', 'lo agendado va primero, en su orden');
  assert.deepEqual(rows.slice(1).map((row) => [row.clientName, row.title]), [
    ['Bonsai', 'Jornada 1 de 2 del contrato'],
    ['Bonsai', 'Jornada 2 de 2 del contrato'],
    ['Félix Finas', 'Jornada 2 de 2 del contrato'],
    ['Pablo Hoff', 'Jornada del contrato'],
  ]);
  assert.ok(rows.slice(1).every((row) => row.state === 'NO_AGENDADA' && row.date === null && row.clientId));
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, 'cada fila tiene su propia clave');
  assert.equal(PRODUCTION_DAY_STATES.NO_AGENDADA.label, 'No agendada');
});

test('nothing pending means the table is just the scheduled ones', () => {
  assert.deepEqual(monthBoardRows([{ id: 'x' }], []), [{ id: 'x' }]);
  assert.deepEqual(monthBoardRows(), []);
});

test('the calendar proposes today for this month or a past one, and the first weekday of a coming month', () => {
  assert.equal(proposedJornadaDate('2026-11-01', '2026-11-12'), '2026-11-12');
  assert.equal(proposedJornadaDate('2026-10-01', '2026-11-12'), '2026-11-12', 'no se agenda en el pasado');
  assert.equal(proposedJornadaDate('2026-12-01', '2026-11-12'), '2026-12-01', 'martes');
  assert.equal(proposedJornadaDate('2027-08-01', '2026-11-12'), '2027-08-02', 'el 1 de agosto de 2027 es domingo');
});

test('the board schedules from the row with the calendar form itself, never a copy of it', async () => {
  const board = await readFile('src/components/modules/Clients/operations/ProductionDaysBoard.jsx', 'utf8');
  assert.match(board, /monthBoardRows\(/, 'una sola tabla');
  assert.doesNotMatch(board, /Por agendar este mes/, 'la lista aparte se retiró');
  assert.match(board, /OperationalCalendar/, 'el mismo formulario del calendario');
  assert.match(board, /createRequest=/);
  const calendar = await readFile('src/components/modules/Activity/OperationalCalendar.jsx', 'utf8');
  assert.match(calendar, /createRequest/);
  assert.match(calendar, /productionClientId: createRequest\.clientId/, 'llega con el cliente ya elegido');
  assert.match(calendar, /\['production-days-month'\]/, 'al guardar, la tabla de Jornadas se vuelve a leer');
});
