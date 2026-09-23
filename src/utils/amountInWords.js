import { financialCents } from './financialMoney.js';

// El importe en letras de una cuenta de cobro: «UN MILLÓN QUINIENTOS CUARENTA MIL
// PESOS». Es la cifra que manda en el documento si alguna vez no coincide con la
// numérica, así que se construye desde centavos enteros, nunca desde un float.

const UNITS = [
    'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
    'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'
];
const TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

// Por encima de esto habría que escribir «mil millones» y una cuenta de cobro así
// merece que la mire una persona antes de salir. Se avisa en vez de escribirla mal.
export const AMOUNT_IN_WORDS_MAX = 999999999;

/** 0 a 999. `apocope` porque delante de un sustantivo es «un peso», no «uno peso». */
const underThousand = (value, apocope) => {
    if (value === 0) return '';
    if (value === 100) return 'cien';
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;
    const parts = [];
    if (hundreds) parts.push(HUNDREDS[hundreds]);
    if (rest === 0) return parts.join(' ');
    if (rest < 30) {
        if (apocope && rest === 1) parts.push('un');
        else if (apocope && rest === 21) parts.push('veintiún');
        else parts.push(UNITS[rest]);
    } else {
        const tens = Math.floor(rest / 10);
        const unit = rest % 10;
        if (unit === 0) parts.push(TENS[tens]);
        else parts.push(`${TENS[tens]} y ${apocope && unit === 1 ? 'un' : UNITS[unit]}`);
    }
    return parts.join(' ');
};

/** Un entero de pesos en palabras, sin la moneda. */
export const integerInWords = (value) => {
    if (!Number.isInteger(value) || value < 0) return null;
    if (value > AMOUNT_IN_WORDS_MAX) return null;
    if (value === 0) return 'cero';

    const millions = Math.floor(value / 1000000);
    const thousands = Math.floor((value % 1000000) / 1000);
    const rest = value % 1000;
    const parts = [];
    // «un millón», nunca «uno millón»; y «mil», nunca «un mil».
    if (millions === 1) parts.push('un millón');
    else if (millions > 1) parts.push(`${underThousand(millions, true)} millones`);
    if (thousands === 1) parts.push('mil');
    else if (thousands > 1) parts.push(`${underThousand(thousands, true)} mil`);
    if (rest) parts.push(underThousand(rest, true));
    return parts.join(' ');
};

/**
 * El importe completo como lo escribe la cuenta de cobro, en mayúsculas.
 * Devuelve null si no se puede escribir con certeza: es preferible que el documento
 * no salga a que salga con una cifra en letras que no es la que se está cobrando.
 */
// La moneda se guarda en minúsculas y las mayúsculas las pone el modo, no el dato:
// si no, pedir minúsculas devolvía «un millón doscientos mil PESOS».
export const amountInWords = (amount, { currency = 'pesos', uppercase = true } = {}) => {
    const cents = financialCents(amount);
    if (cents === null) return null;
    const units = Math.floor(cents / 100);
    const remainder = cents % 100;
    const unitsInWords = integerInWords(units);
    if (unitsInWords === null) return null;

    let phrase = `${unitsInWords} ${currency}`;
    if (remainder) {
        const centsInWords = integerInWords(remainder);
        if (centsInWords === null) return null;
        phrase += ` con ${centsInWords} ${remainder === 1 ? 'centavo' : 'centavos'}`;
    }
    return uppercase ? phrase.toUpperCase() : phrase;
};
