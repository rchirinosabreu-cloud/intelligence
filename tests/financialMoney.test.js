import test from 'node:test';
import assert from 'node:assert/strict';
import { financialCents, financialAmountFromCents } from '../src/utils/financialMoney.js';

test('financial money accepts exact cents and harmless IEEE754 arithmetic noise', () => {
    assert.equal(financialCents(0.1 + 0.2), 30);
    assert.equal(financialCents('1234.50'), 123450);
    assert.equal(financialCents('1.2300'), 123);
    assert.equal(financialCents({ toString: () => '45.67' }), 4567);
    assert.equal(financialCents(0), 0);
    assert.equal(financialAmountFromCents(20), 0.2);
});

test('financial money does not round non-cent amounts or accept nonfinite/negative values', () => {
    for (const value of [1.001, 1.005, 0.009, '1.001', 'NaN', NaN, Infinity, -0.01, '', null, undefined]) {
        assert.equal(financialCents(value), null, `must reject ${String(value)}`);
    }
});

test('the upper bound is exact safe cents, with a decimal string when Number cannot preserve the final cent', () => {
    assert.equal(financialCents('90071992547409.91'), Number.MAX_SAFE_INTEGER);
    assert.equal(financialAmountFromCents(Number.MAX_SAFE_INTEGER), '90071992547409.91');
    assert.equal(financialCents('90071992547409.92'), null);
    assert.equal(financialCents(Number.MAX_SAFE_INTEGER), null);
    assert.throws(() => financialAmountFromCents(Number.MAX_SAFE_INTEGER + 1), RangeError);
});
