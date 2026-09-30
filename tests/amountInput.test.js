import test from 'node:test';
import assert from 'node:assert/strict';
import {
    formatAmountDisplay,
    readTypedAmount,
    readPastedAmount,
    parseAmountText,
    caretAfterFormat,
    amountDecimalsFor
} from '../src/lib/amountInput.js';

// Campo de dinero global (Rodny, 30 de septiembre de 2026: «cuando se refleja un valor
// usa los puntos, pero cuando lo estoy escribiendo no hace los puntos de cada tres
// dígitos»). Los puntos los pone la plataforma; la coma es para los centavos.

test('lo guardado se muestra con puntos de miles y coma decimal', () => {
    assert.equal(formatAmountDisplay('1200000'), '1.200.000');
    assert.equal(formatAmountDisplay(1200000), '1.200.000');
    assert.equal(formatAmountDisplay('4938.27'), '4.938,27');
    assert.equal(formatAmountDisplay('1200000.5'), '1.200.000,5');
    assert.equal(formatAmountDisplay('0'), '0');
    assert.equal(formatAmountDisplay(''), '');
    assert.equal(formatAmountDisplay(null), '');
    assert.equal(formatAmountDisplay('-250000', { allowNegative: true }), '-250.000');
    assert.equal(formatAmountDisplay('999'), '999');
});

// Valores que ya venían escritos con puntos (un borrador guardado antes) o con ceros de
// más desde la base de datos («350000.00»): se muestran bien, no como decimales.
test('un valor que ya traía puntos o ceros de más se muestra bien', () => {
    assert.equal(formatAmountDisplay('8.000.000'), '8.000.000');
    assert.equal(formatAmountDisplay('1.200'), '1.200');
    assert.equal(formatAmountDisplay('350000.00'), '350.000');
    assert.equal(formatAmountDisplay('3912.4500'), '3.912,45');
    assert.equal(formatAmountDisplay('1200000.50'), '1.200.000,5');
});

test('al escribir, los puntos aparecen solos cada tres dígitos', () => {
    assert.deepEqual(readTypedAmount('1200000'), { value: '1200000', display: '1.200.000' });
    assert.deepEqual(readTypedAmount('1.2000'), { value: '12000', display: '12.000' });
    assert.deepEqual(readTypedAmount(''), { value: '', display: '' });
});

// La costumbre de escribir los puntos a mano no puede convertir un millón en un peso.
test('un punto escrito a mano se ignora: «1.200.000» es un millón doscientos mil', () => {
    assert.deepEqual(readTypedAmount('1.200.000'), { value: '1200000', display: '1.200.000' });
    assert.deepEqual(readTypedAmount('1.200'), { value: '1200', display: '1.200' });
});

test('la coma abre los centavos, como máximo dos', () => {
    assert.deepEqual(readTypedAmount('4.938,'), { value: '4938', display: '4.938,' });
    assert.deepEqual(readTypedAmount('4.938,2'), { value: '4938.2', display: '4.938,2' });
    assert.deepEqual(readTypedAmount('4.938,27'), { value: '4938.27', display: '4.938,27' });
    assert.deepEqual(readTypedAmount('4.938,279'), { value: '4938.27', display: '4.938,27' });
    assert.deepEqual(readTypedAmount('4,93,8'), { value: '4.93', display: '4,93' }, 'una segunda coma no abre otro decimal');
    assert.deepEqual(readTypedAmount(',5'), { value: '0.5', display: '0,5' });
});

test('un campo sin decimales no deja escribir la coma', () => {
    assert.deepEqual(readTypedAmount('1.200,5', { decimals: 0 }), { value: '1200', display: '1.200' });
});

test('letras y símbolos no entran; el signo menos solo si el campo lo permite', () => {
    assert.deepEqual(readTypedAmount('$ 1a2b3'), { value: '123', display: '123' });
    assert.deepEqual(readTypedAmount('-500'), { value: '500', display: '500' });
    assert.deepEqual(readTypedAmount('-500', { allowNegative: true }), { value: '-500', display: '-500' });
    assert.deepEqual(readTypedAmount('-', { allowNegative: true }), { value: '', display: '-' });
});

test('los ceros a la izquierda sobran', () => {
    assert.deepEqual(readTypedAmount('0001200'), { value: '1200', display: '1.200' });
    assert.deepEqual(readTypedAmount('0,5'), { value: '0.5', display: '0,5' });
});

// Pegar desde Excel, un correo o un extracto: el formato de origen varía.
test('al pegar se entiende el formato de donde venga', () => {
    assert.equal(readPastedAmount('$ 1.200.000'), '1200000');
    assert.equal(readPastedAmount('1.200.000,50'), '1200000.50');
    assert.equal(readPastedAmount('1,200,000.50'), '1200000.50');
    assert.equal(readPastedAmount('1,200,000'), '1200000');
    assert.equal(readPastedAmount('1200000'), '1200000');
    assert.equal(readPastedAmount('4938,27'), '4938.27');
    assert.equal(readPastedAmount('4938.27'), '4938.27');
    // Un solo separador seguido de exactamente tres dígitos es de miles.
    assert.equal(readPastedAmount('1.200'), '1200');
    assert.equal(readPastedAmount('1,200'), '1200');
    assert.equal(readPastedAmount('USD 1,200.00'), '1200.00');
    assert.equal(readPastedAmount('texto'), '');
    assert.equal(readPastedAmount('-45.000', { allowNegative: true }), '-45000');
    assert.equal(readPastedAmount('-45.000'), '45000');
});

// El servidor lee con la misma regla lo que llegue escrito a mano (CRM la usaba mal:
// «1.200» se guardaba como 1,20 y «1.200.000» daba error).
test('parseAmountText lee un valor escrito en el formato de aquí o de fuera', () => {
    assert.equal(parseAmountText('1.200'), 1200);
    assert.equal(parseAmountText('1.200.000'), 1200000);
    assert.equal(parseAmountText('1.200.000,50'), 1200000.5);
    assert.equal(parseAmountText('1200000'), 1200000);
    assert.equal(parseAmountText(1200000), 1200000);
    assert.equal(parseAmountText('1200000.5'), 1200000.5, 'el valor limpio que manda el campo de dinero');
    assert.equal(parseAmountText(''), null);
    assert.equal(parseAmountText('abc'), null);
});

test('el cursor se queda donde se estaba escribiendo aunque aparezcan puntos', () => {
    // Escribiendo «1200000» de corrido: tras el último cero el cursor queda al final.
    assert.equal(caretAfterFormat('1200000', 7, '1.200.000'), 9);
    // Insertar un dígito en medio: «1.2|00» → «1.25|00» → «12.5|00».
    assert.equal(caretAfterFormat('1.2500', 4, '12.500'), 4);
    // Al principio.
    assert.equal(caretAfterFormat('91.200', 1, '91.200'), 1);
    // Con decimales.
    assert.equal(caretAfterFormat('4938,2', 6, '4.938,2'), 7);
});

test('los decimales por moneda: pesos y dólares llevan centavos opcionales', () => {
    assert.equal(amountDecimalsFor('COP'), 2);
    assert.equal(amountDecimalsFor('USD'), 2);
    assert.equal(amountDecimalsFor(undefined), 2);
});
