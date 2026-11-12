import test from 'node:test';
import assert from 'node:assert/strict';
import { monthOptions, monthLabel } from '../src/lib/monthOptions.js';

// Rodny, 12 de noviembre de 2026: «quiero un estilo global y prefiero el desplegable como en las parrillas».
// Todo selector de mes es una lista «Noviembre 2026», del más reciente al más antiguo.

test('a month reads like Parrillas: capitalised name and year, no «de»', () => {
  assert.equal(monthLabel('2026-11-01'), 'Noviembre 2026');
  assert.equal(monthLabel('2027-01-01'), 'Enero 2027');
  assert.equal(monthLabel(''), '');
});

test('the list goes from the newest month to the oldest, around today by default', () => {
  const options = monthOptions({ today: '2026-11-12', before: 2, after: 1 });
  assert.deepEqual(options.map((o) => o.label), ['Diciembre 2026', 'Noviembre 2026', 'Octubre 2026', 'Septiembre 2026']);
  assert.equal(options[1].value, '2026-11-01');
});

test('min and max bound the list, and a value outside the window is never lost', () => {
  assert.deepEqual(monthOptions({ today: '2026-11-12', min: '2026-10-01', max: '2026-11-30' }).map((o) => o.value), ['2026-11-01', '2026-10-01']);
  const options = monthOptions({ today: '2026-11-12', value: '2024-03-01', before: 1, after: 0 });
  assert.ok(options.some((o) => o.value === '2024-03-01'), 'el valor guardado sigue elegible');
  assert.deepEqual(monthOptions({ today: '2026-12-15', before: 0, after: 1 }).map((o) => o.value), ['2027-01-01', '2026-12-01'], 'cruza el año');
});
