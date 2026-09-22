import test from 'node:test';
import assert from 'node:assert/strict';
import { amountInWords, integerInWords, AMOUNT_IN_WORDS_MAX } from '../src/utils/amountInWords.js';

// La cifra en letras es la que manda en una cuenta de cobro si alguna vez no coincide
// con la numérica. Los dos primeros casos son cuentas de cobro reales de Brain Studio.

test('reproduce las cuentas de cobro reales', () => {
    // Cuenta de cobro No. 0366, Elvira Utria.
    assert.equal(amountInWords(1540000), 'UN MILLÓN QUINIENTOS CUARENTA MIL PESOS');
    // Cuenta de cobro No. 0389, Corporación Deportiva Los Titanes.
    assert.equal(amountInWords(1200000), 'UN MILLÓN DOSCIENTOS MIL PESOS');
});

test('un millón va en singular y dos en plural', () => {
    assert.equal(integerInWords(1000000), 'un millón');
    assert.equal(integerInWords(2000000), 'dos millones');
    assert.equal(integerInWords(21000000), 'veintiún millones');
});

test('mil no lleva «un» delante', () => {
    assert.equal(integerInWords(1000), 'mil');
    assert.equal(integerInWords(1001), 'mil un');
    assert.equal(integerInWords(2000), 'dos mil');
    assert.equal(integerInWords(21000), 'veintiún mil');
});

test('cien y ciento no son lo mismo', () => {
    assert.equal(integerInWords(100), 'cien');
    assert.equal(integerInWords(101), 'ciento un');
    assert.equal(integerInWords(115), 'ciento quince');
    assert.equal(integerInWords(100000), 'cien mil');
    assert.equal(integerInWords(100001), 'cien mil un');
});

test('las centenas irregulares se escriben como toca', () => {
    assert.equal(integerInWords(500), 'quinientos');
    assert.equal(integerInWords(700), 'setecientos');
    assert.equal(integerInWords(900), 'novecientos');
    assert.equal(integerInWords(200), 'doscientos');
});

test('los veintitantos van juntos y con tilde donde toca', () => {
    assert.equal(integerInWords(16), 'dieciséis');
    assert.equal(integerInWords(22), 'veintidós');
    assert.equal(integerInWords(26), 'veintiséis');
    assert.equal(integerInWords(21), 'veintiún');
});

test('a partir de treinta se separa con «y»', () => {
    assert.equal(integerInWords(31), 'treinta y un');
    assert.equal(integerInWords(45), 'cuarenta y cinco');
    assert.equal(integerInWords(90), 'noventa');
    assert.equal(integerInWords(99), 'noventa y nueve');
});

test('una cifra compuesta encadena los tres grupos', () => {
    assert.equal(integerInWords(123456789), 'ciento veintitrés millones cuatrocientos cincuenta y seis mil setecientos ochenta y nueve');
    assert.equal(integerInWords(1540000), 'un millón quinientos cuarenta mil');
});

test('cero es cero, no una cadena vacía', () => {
    assert.equal(integerInWords(0), 'cero');
    assert.equal(amountInWords(0), 'CERO PESOS');
});

test('los centavos se escriben cuando los hay, y en singular si es uno', () => {
    assert.equal(amountInWords(1500.5), 'MIL QUINIENTOS PESOS CON CINCUENTA CENTAVOS');
    assert.equal(amountInWords(1500.01), 'MIL QUINIENTOS PESOS CON UN CENTAVO');
    assert.equal(amountInWords(1500), 'MIL QUINIENTOS PESOS');
});

// Preferimos que el documento no salga a que salga con una cifra en letras
// que no es la que se está cobrando.
test('por encima del rango soportado devuelve null en vez de inventar', () => {
    assert.equal(integerInWords(AMOUNT_IN_WORDS_MAX), 'novecientos noventa y nueve millones novecientos noventa y nueve mil novecientos noventa y nueve');
    assert.equal(integerInWords(AMOUNT_IN_WORDS_MAX + 1), null);
    assert.equal(amountInWords(AMOUNT_IN_WORDS_MAX + 1), null);
});

test('un importe que no es dinero devuelve null', () => {
    assert.equal(amountInWords('no-es-dinero'), null);
    assert.equal(amountInWords(null), null);
    assert.equal(amountInWords(-100), null);
    // Tres decimales no son centavos: no se redondean en silencio.
    assert.equal(amountInWords(1.005), null);
});

test('se puede pedir en minúsculas y con otra moneda', () => {
    assert.equal(amountInWords(1200000, { uppercase: false }), 'un millón doscientos mil pesos');
    assert.equal(amountInWords(50, { currency: 'DÓLARES' }), 'CINCUENTA DÓLARES');
});

// La cifra en letras y la numérica del documento tienen que ser la misma.
test('lo escrito coincide con lo cobrado en un barrido de importes', () => {
    const parse = (words) => {
        const scale = { 'mil': 1000, 'millón': 1000000, 'millones': 1000000 };
        let total = 0, group = 0;
        for (const word of words.split(' ')) {
            if (word === 'y') continue;
            if (scale[word]) { group = (group || 1) * scale[word]; total += group; group = 0; continue; }
            group += VALUES[word] ?? 0;
        }
        return total + group;
    };
    const VALUES = {
        cero: 0, un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
        diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, 'dieciséis': 16, diecisiete: 17,
        dieciocho: 18, diecinueve: 19, veinte: 20, 'veintiún': 21, veintiuno: 21, 'veintidós': 22, 'veintitrés': 23,
        veinticuatro: 24, veinticinco: 25, 'veintiséis': 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
        treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
        cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
        seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900
    };
    for (const amount of [1, 15, 21, 100, 101, 999, 1000, 1540000, 1200000, 800000, 400000, 2850000, 33334977, 901378858]) {
        assert.equal(parse(integerInWords(amount)), amount, `«${integerInWords(amount)}» no vuelve a ser ${amount}`);
    }
});
