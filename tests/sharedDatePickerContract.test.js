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

// El campo «Periodo» de una cuenta por cobrar pasaba `brainDatePickerProps` y aun así
// abría una rejilla de meses sin estilo, con el calendario flotando sobre el
// formulario (Rodny, 22 de septiembre de 2026). Pasar los props compartidos no basta:
// estos cambian **qué calendario es**, y quien los necesite tiene que añadir la
// variante al componente compartido, no inventarla en su módulo.
const CALENDAR_VARIANT_PROPS = ['showMonthYearPicker', 'showYearPicker', 'showQuarterYearPicker', 'showTimeSelect', 'showTimeSelectOnly', 'selectsRange', 'selectsMultiple'];

test('only the shared calendar decides what kind of calendar opens', async () => {
  const shared = path.join(SRC, 'components', 'ui', 'BrainDatePicker.jsx');
  const offenders = [];
  for (const file of await walk(SRC)) {
    if (file === shared) continue;
    const source = await readFile(file, 'utf8');
    for (const prop of CALENDAR_VARIANT_PROPS) {
      if (new RegExp(`\\b${prop}\\b`).test(source)) offenders.push(`${path.relative(process.cwd(), file)} → ${prop}`);
    }
  }
  assert.deepEqual(offenders, [], 'Añade la variante a BrainDatePicker.jsx y úsala desde el módulo');
});

// Trinquete: la lista de módulos que todavía dibujan su propio DatePicker está
// congelada. Migrarlos es trabajo aparte, pero **no se añade ninguno nuevo**: quien
// necesite una fecha usa BrainDatePicker, BrainMonthPicker o BrainDateTimePicker.
const MODULES_WITH_RAW_PICKER = [
  'src/components/modules/Activity/CalendarDateTimePicker.jsx',
  'src/components/modules/Activity/OperationalCalendar.jsx',
  'src/components/modules/ContentPlanDetail.jsx',
  'src/components/modules/TaskCreateModal.jsx',
  'src/components/modules/TaskEditModal.jsx',
  'src/components/modules/financial/ReceivablePaymentDialog.jsx'
];

test('no module starts drawing its own calendar', async () => {
  // El componente compartido y el módulo de props/locale que lo acompaña.
  const shared = [
    path.join(SRC, 'components', 'ui', 'BrainDatePicker.jsx'),
    path.join(SRC, 'lib', 'brainDatePicker.js')
  ];
  const found = [];
  for (const file of await walk(SRC)) {
    if (shared.includes(file)) continue;
    const source = await readFile(file, 'utf8');
    if (/from ['"]react-datepicker['"]/.test(source)) found.push(path.relative(process.cwd(), file).replace(/\\/g, '/'));
  }
  assert.deepEqual(found.sort(), [...MODULES_WITH_RAW_PICKER].sort(),
    'Si añadiste uno, usa el componente compartido; si migraste uno, quítalo de MODULES_WITH_RAW_PICKER.');
});

test('the month picker keeps the shared look and a plain date value', async () => {
  const picker = await readFile('src/components/ui/BrainDatePicker.jsx', 'utf8');
  assert.match(picker, /export function BrainMonthPicker/);
  // Las dos clases: sin la base, el panel pierde borde, sombra y cabecera.
  assert.match(picker, /calendarClassName="brain-datepicker brain-datepicker-months"/);
  // El valor sigue siendo una fecha normal, para que nada aguas abajo cambie.
  assert.match(picker, /-01`/);
  const css = await readFile('src/index.css', 'utf8');
  assert.match(css, /\.brain-datepicker-months \.react-datepicker__month-text\b/);
  assert.match(css, /\.dark \.brain-datepicker-months \.react-datepicker__month-text\b/, 'la rejilla también existe en modo oscuro');
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

test('the shared picker compiles as JSX', async () => {
  const file = 'src/components/ui/BrainDatePicker.jsx';
  await transformWithEsbuild(await readFile(file, 'utf8'), file, { loader: 'jsx', jsx: 'automatic' });
});
