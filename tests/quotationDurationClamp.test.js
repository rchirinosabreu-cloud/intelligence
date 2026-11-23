import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateQuotationTotals, clampQuotationDuration } from '../src/services/quotationDomainService.js';

test('la duración de la pantalla siempre es un entero válido, venga lo que venga del campo o del borrador', () => {
  for (const [value, expected] of [[1.5, 2], ['2.4', 2], ['', 1], [null, 1], ['abc', 1], [0, 1], [-3, 1], [999, 60], [12, 12]]) {
    assert.equal(clampQuotationDuration(value), expected, String(value));
    assert.doesNotThrow(() => calculateQuotationTotals([], false, { durationMonths: clampQuotationDuration(value) }));
  }
  assert.equal(clampQuotationDuration('', 3), 3);
});

test('el formulario de cotización no calcula en el render sin protección', () => {
  const source = fs.readFileSync(new URL('../src/components/modules/Quotations/QuotationForm.jsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('const QuotationForm'));
  const direct = [...body.matchAll(/calculateQuotation(Totals|Economics)\(/g)];
  assert.equal(direct.length, 0, 'usar safeTotals / safeEconomics');
  assert.match(source, /clampQuotationDuration\(draftDurationMonths/);
});
