import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformWithEsbuild } from 'vite';
import { dateKeyToPickerDate, pickerDateToKey, splitDateTimeKey, joinDateTimeKey, parseDateTimeText, formatDateTimeText } from '../src/lib/brainDatePicker.js';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

const walk = async dir => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.(jsx?|tsx?)$/.test(entry.name) ? [full] : [];
  }));
  return files.flat();
};

test('the platform has exactly one calendar: no native date inputs in the app', async () => {
  const offenders = [];
  for (const file of await walk(SRC)) {
    const source = await readFile(file, 'utf8');
    if (/<input[^>]*\btype=["'](date|datetime-local|time|month|week)["']/s.test(source)) offenders.push(path.relative(process.cwd(), file));
  }
  assert.deepEqual(offenders, [], 'Use BrainDatePicker / BrainDateTimePicker from src/components/ui/BrainDatePicker.jsx');
});

test('every direct react-datepicker usage carries the shared brain props', async () => {
  const offenders = [];
  for (const file of await walk(SRC)) {
    const source = await readFile(file, 'utf8');
    if (/from ['"]react-datepicker['"]/.test(source) && !/brainDatePickerProps|registerLocale/.test(source)) offenders.push(path.relative(process.cwd(), file));
  }
  assert.deepEqual(offenders, []);
});

test('the rule is written down for future work', async () => {
  const agents = await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8');
  assert.match(agents, /BrainDatePicker/);
  assert.match(agents, /type="date"/);
});

test('date keys round-trip through the picker without timezone drift', () => {
  const date = dateKeyToPickerDate('2026-07-08');
  assert.equal(date.getDate(), 8);
  assert.equal(date.getMonth(), 6);
  assert.equal(date.getHours(), 12);
  assert.equal(pickerDateToKey(date), '2026-07-08');
  assert.equal(pickerDateToKey(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
  assert.equal(pickerDateToKey(null), '');
  assert.equal(dateKeyToPickerDate(''), null);
  assert.equal(dateKeyToPickerDate('hoy'), null);
  assert.deepEqual(splitDateTimeKey('2026-07-08T08:00'), { dateKey: '2026-07-08', time: '08:00' });
  assert.deepEqual(splitDateTimeKey('2026-07-08'), { dateKey: '2026-07-08', time: '' });
  assert.deepEqual(splitDateTimeKey(''), { dateKey: '', time: '' });
  assert.equal(joinDateTimeKey('2026-07-08', '08:00'), '2026-07-08T08:00');
  assert.equal(joinDateTimeKey('', '08:00'), '');
  assert.equal(formatDateTimeText('2026-07-08', '08:00'), '08/07/2026 08:00');
  assert.deepEqual(parseDateTimeText('08/07/2026 08:00'), { dateKey: '2026-07-08', time: '08:00' });
  assert.deepEqual(parseDateTimeText('08/07/2026'), { dateKey: '2026-07-08', time: '' });
  assert.equal(parseDateTimeText('31/02/2026'), null, 'impossible days are rejected');
});

test('the hour column scrolls with the wheel even inside a modal dialog', async () => {
  // Rodny, 21 September 2026: "cuando abro el selector de hora, la rueda del mouse no me deja subir y bajar".
  // A modal dialog's scroll lock cancels the wheel for anything drawn outside it, and this list is portaled.
  const picker = await readFile('src/components/ui/BrainDatePicker.jsx', 'utf8');
  assert.match(picker, /element\.addEventListener\('wheel', onWheel, \{ passive: false \}\)/, 'a native non-passive listener: React attaches onWheel as passive, so preventDefault there is a no-op');
  assert.match(picker, /event\.preventDefault\(\);\s*element\.scrollTop \+= event\.deltaY;/, 'the list scrolls itself exactly once per wheel event');
  assert.match(picker, /return \(\) => element\.removeEventListener\('wheel', onWheel\);/, 'and cleans up');
});

test('the calendar opens outside the panel, so a modal never clips it', async () => {
  // Rodny, 23 de septiembre de 2026: «cuando abro una tarea, no me deja colocar fecha». El cuerpo de los
  // paneles tiene scroll propio, así que el calendario en línea quedaba recortado y los días no se podían pulsar.
  const props = await readFile('src/lib/brainDatePicker.js', 'utf8');
  assert.match(props, /export const BRAIN_DATEPICKER_PORTAL_ID = 'brain-datepicker-portal';/);
  assert.match(props, /portalId: BRAIN_DATEPICKER_PORTAL_ID/, 'todo calendario de la plataforma se dibuja en el portal');
  assert.doesNotMatch(props, /popperProps/, 'nada de posicionamiento fijo: los modales llevan transform y lo fijo vuelve a quedar atrapado');

  const css = await readFile('src/index.css', 'utf8');
  assert.match(css, /#brain-datepicker-portal \{[\s\S]*?z-index: 220;/, 'por encima de cualquier diálogo (los existentes llegan a 210)');
  assert.match(css, /#brain-datepicker-portal,\s*\.brain-datepicker-popper \{\s*pointer-events: auto;/, 'un modal apaga los clics del resto del documento');

  const dialog = await readFile('src/components/ui/dialog.jsx', 'utf8');
  assert.match(dialog, /target\.closest\('#brain-datepicker-portal'\)/, 'elegir un día es interactuar «fuera» del diálogo');
  assert.match(dialog, /onPointerDownOutside=\{keepOpenForCalendar\(onPointerDownOutside\)\}/, 'y no puede cerrarlo');
  assert.match(dialog, /onFocusOutside=\{keepOpenForCalendar\(onFocusOutside\)\}/);
  assert.match(dialog, /onInteractOutside=\{keepOpenForCalendar\(onInteractOutside\)\}/);
});

test('the shared picker compiles as JSX', async () => {
  const file = 'src/components/ui/BrainDatePicker.jsx';
  await transformWithEsbuild(await readFile(file, 'utf8'), file, { loader: 'jsx', jsx: 'automatic' });
});
