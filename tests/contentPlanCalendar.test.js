import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WEEKDAY_LABELS, buildMonthGrid, groupItemsByDay, publishDayKey } from '../src/lib/contentPlanCalendar.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Rodny, 24 de septiembre de 2026: el calendario dice cuándo publica cada pieza, que es lo único que
// una lista no puede enseñar — los días vacíos y los días con tres piezas encima.

test('la semana empieza en lunes y el mes queda cuadrado', () => {
  assert.equal(WEEKDAY_LABELS[0], 'LUN');
  assert.equal(WEEKDAY_LABELS[6], 'DOM');

  // El 1 de septiembre de 2026 cae en martes, así que la rejilla arranca el lunes 31 de agosto.
  const weeks = buildMonthGrid(2026, 9);
  assert.equal(weeks[0][0].day, 31);
  assert.equal(weeks[0][0].inMonth, false);
  assert.equal(weeks[0][1].day, 1);
  assert.equal(weeks[0][1].inMonth, true);
  assert.ok(weeks.every(week => week.length === 7), 'todas las semanas tienen siete días');

  const inMonth = weeks.flat().filter(cell => cell.inMonth);
  assert.equal(inMonth.length, 30, 'septiembre tiene treinta días y salen los treinta');
  assert.equal(inMonth.at(-1).key, '2026-09-30');

  // Febrero de un año bisiesto que empieza en domingo es el caso que más semanas necesita.
  const febrero = buildMonthGrid(2026, 2);
  assert.equal(febrero.flat().filter(cell => cell.inMonth).length, 28);
});

test('el día se lee en UTC, nunca en la hora del navegador', () => {
  // La plataforma guarda la publicación al mediodía UTC justamente para esto: leerlo en local
  // devolvería el día anterior en Bogotá, que es el error que la regla del calendario evita.
  assert.equal(publishDayKey('2026-09-24T12:00:00.000Z'), '2026-09-24');
  assert.equal(publishDayKey('2026-09-01T12:00:00.000Z'), '2026-09-01');
  assert.equal(publishDayKey(null), null);
  assert.equal(publishDayKey('no es una fecha'), null);
});

test('cada día conoce sus piezas, y las que no tienen fecha se apartan', () => {
  const items = [
    { id: 'a', publishDate: '2026-09-24T12:00:00.000Z' },
    { id: 'b', publishDate: '2026-09-24T12:00:00.000Z' },
    { id: 'c', publishDate: '2026-09-28T12:00:00.000Z' },
    { id: 'd', publishDate: null }
  ];

  const { byDay, undated } = groupItemsByDay(items);
  assert.deepEqual(byDay.get('2026-09-24').map(item => item.id), ['a', 'b'], 'un día puede acumular varias');
  assert.deepEqual(byDay.get('2026-09-28').map(item => item.id), ['c']);
  assert.equal(byDay.has('2026-09-25'), false, 'un día sin piezas no inventa una entrada');
  assert.deepEqual(undated.map(item => item.id), ['d'], 'sin fecha no significa perdida');

  assert.deepEqual(groupItemsByDay().undated, [], 'sin piezas no revienta');
});

test('el editor ofrece el calendario como otra forma de mirar el mismo mes', async () => {
  const editor = await read('src/components/modules/ContentPlanDetail.jsx');

  assert.match(editor, /const PlanCalendar/);
  assert.match(editor, /planView/, 'hay un modo de vista');
  // Los dos modos salen de una lista, así que el estado pulsado se compara contra la opción.
  assert.match(editor, /aria-pressed=\{planView === option\.key\}/, 'el selector dice cuál vista está activa');
  assert.match(editor, /planView === 'calendar' \?/, 'el calendario sustituye al editor, no se apila debajo');
  // Tocar una pieza en el calendario la abre en el editor: son dos vistas del mismo mes, no dos sitios.
  assert.match(editor, /setPlanView\('editor'\)/);
  assert.match(editor, /Sin fecha todavía/, 'lo que no tiene fecha se ve, no se esconde');
});
