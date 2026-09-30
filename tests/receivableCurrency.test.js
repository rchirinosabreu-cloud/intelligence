import test from 'node:test';
import assert from 'node:assert/strict';
import {
    RECEIVABLE_CURRENCIES,
    normalizeReceivableCurrency,
    receivableAmountInWords,
    formatReceivableMoney,
    pesosFromRate,
    formatExchangeRate
} from '../src/lib/receivableCurrency.js';
import { amountInWords } from '../src/utils/amountInWords.js';

// Cuentas de cobro en dólares (Rodny, 30 de septiembre de 2026): «yo escoger la moneda,
// y que diga USD y el valor en letras sea, por ejemplo, "mil doscientos dólares"».

test('la cartera maneja pesos y dólares, y pesos es lo de siempre', () => {
    assert.deepEqual(RECEIVABLE_CURRENCIES.map((currency) => currency.value), ['COP', 'USD']);
    assert.equal(normalizeReceivableCurrency(undefined), 'COP');
    assert.equal(normalizeReceivableCurrency(''), 'COP');
    assert.equal(normalizeReceivableCurrency('usd'), 'USD');
    assert.equal(normalizeReceivableCurrency('COP'), 'COP');
    assert.equal(normalizeReceivableCurrency('EUR'), null, 'una moneda que no se maneja no se convierte en pesos en silencio');
});

test('el importe en letras dice dólares cuando la cuenta es en dólares', () => {
    assert.equal(receivableAmountInWords(1200, 'USD'), 'MIL DOSCIENTOS DÓLARES');
    assert.equal(receivableAmountInWords(1200.5, 'USD'), 'MIL DOSCIENTOS DÓLARES CON CINCUENTA CENTAVOS');
    assert.equal(receivableAmountInWords(1000000, 'USD'), 'UN MILLÓN DE DÓLARES');
    assert.equal(receivableAmountInWords(1200000, 'COP'), 'UN MILLÓN DOSCIENTOS MIL PESOS');
    assert.equal(receivableAmountInWords(1200000), 'UN MILLÓN DOSCIENTOS MIL PESOS');
});

test('uno va en singular: «un dólar», «un peso»', () => {
    assert.equal(receivableAmountInWords(1, 'USD'), 'UN DÓLAR');
    assert.equal(receivableAmountInWords(1, 'COP'), 'UN PESO');
    assert.equal(amountInWords(1), 'UN PESO');
    assert.equal(receivableAmountInWords(1.25, 'USD'), 'UN DÓLAR CON VEINTICINCO CENTAVOS');
    assert.equal(receivableAmountInWords(21, 'USD'), 'VEINTIÚN DÓLARES');
});

test('la cifra dice la moneda: «USD 1.200» frente a «$ 1.200.000»', () => {
    assert.equal(formatReceivableMoney(1200, 'USD'), 'USD 1.200');
    assert.equal(formatReceivableMoney(1200.5, 'USD'), 'USD 1.200,50');
    assert.equal(formatReceivableMoney(1200000, 'COP'), '$ 1.200.000');
    assert.equal(formatReceivableMoney(1200000), '$ 1.200.000');
});

// Rodny, 30 de septiembre de 2026: «en el financiero siempre registramos todo en pesos …
// puede registrarse en pesos haciendo la conversión que hacemos en cotización, usando el
// TRM oficial». La obligación entra a cartera con su equivalente en pesos.
test('el equivalente en pesos es el total en dólares por la TRM, al peso', () => {
    assert.equal(pesosFromRate(1200, 3912.45), 4694940);
    assert.equal(pesosFromRate(1200.5, 4000), 4802000);
    assert.equal(pesosFromRate(333.33, 3900.17), 1300044);
    assert.equal(pesosFromRate(1200, 0), null, 'sin TRM no hay valor en pesos');
    assert.equal(pesosFromRate(0, 4000), null);
    assert.equal(pesosFromRate('x', 4000), null);
});

test('la TRM se muestra con sus decimales', () => {
    assert.equal(formatExchangeRate(3912.45), 'TRM 3.912,45');
    assert.equal(formatExchangeRate(4000), 'TRM 4.000,00');
});
