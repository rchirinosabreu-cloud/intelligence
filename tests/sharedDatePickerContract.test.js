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

test('the shared picker compiles as JSX', async () => {
  const file = 'src/components/ui/BrainDatePicker.jsx';
  await transformWithEsbuild(await readFile(file, 'utf8'), file, { loader: 'jsx', jsx: 'automatic' });
});
