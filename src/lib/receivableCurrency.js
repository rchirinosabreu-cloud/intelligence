import { amountInWords } from '../utils/amountInWords.js';

// La moneda del documento de una cuenta de cobro (Rodny, 30 de septiembre de 2026: «yo
// escoger la moneda, y que diga USD y el valor en letras sea "mil doscientos dólares"»).
// Vive aquí para que la pantalla, el servidor y el PDF digan lo mismo.
//
// Lo que no cambia: **el financiero se lleva en pesos** («solo registramos lo que entra
// a nuestra cuenta»). Una cuenta en dólares es un documento en dólares; en cartera la
// obligación vale su equivalente en pesos con la TRM oficial, y ese valor se puede
// editar después para dejar el que de verdad entró. Nada en dólares se suma con pesos.

export const RECEIVABLE_CURRENCIES = [
    { value: 'COP', name: 'Pesos (COP)', words: { plural: 'pesos', singular: 'peso' } },
    { value: 'USD', name: 'Dólares (USD)', words: { plural: 'dólares', singular: 'dólar' } }
];

export const DEFAULT_RECEIVABLE_CURRENCY = 'COP';

const byCode = new Map(RECEIVABLE_CURRENCIES.map((currency) => [currency.value, currency]));

/**
 * La moneda tal como se guarda. Vacío es pesos, que es lo que ha sido siempre; una
 * moneda que no se maneja devuelve null para que quien llama la rechace, en vez de
 * guardarla como pesos sin decir nada.
 */
export const normalizeReceivableCurrency = (value) => {
    if (value === undefined || value === null || String(value).trim() === '') return DEFAULT_RECEIVABLE_CURRENCY;
    const code = String(value).trim().toUpperCase();
    return byCode.has(code) ? code : null;
};

export const isForeignCurrency = (currency) => normalizeReceivableCurrency(currency) === 'USD';

/** «MIL DOSCIENTOS DÓLARES», «UN MILLÓN DE PESOS», «UN DÓLAR». */
export const receivableAmountInWords = (amount, currency = DEFAULT_RECEIVABLE_CURRENCY, options = {}) => {
    const words = (byCode.get(normalizeReceivableCurrency(currency)) || byCode.get(DEFAULT_RECEIVABLE_CURRENCY)).words;
    return amountInWords(amount, { ...options, currency: words.plural, currencySingular: words.singular });
};

const groupedNumber = (value, decimals) => new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
}).format(value);

/**
 * La cifra con su moneda: «$ 1.200.000» para pesos y «USD 1.200» para dólares. Los
 * centavos solo aparecen cuando los hay, como en los documentos que ya se mandan.
 */
export const formatReceivableMoney = (amount, currency = DEFAULT_RECEIVABLE_CURRENCY) => {
    const value = Number(amount) || 0;
    const hasCents = Math.round(Math.abs(value) * 100) % 100 !== 0;
    const number = groupedNumber(value, hasCents ? 2 : 0);
    return normalizeReceivableCurrency(currency) === 'USD' ? `USD ${number}` : `$ ${number}`;
};

/**
 * Lo que vale en pesos un total en dólares con una TRM, redondeado al peso: es el valor
 * con el que la obligación entra a la cartera. Devuelve null si falta algo, para que
 * nadie guarde un cero o un NaN como si fuera plata.
 */
export const pesosFromRate = (total, rate) => {
    const amount = Number(total);
    const trm = Number(rate);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(trm) || trm <= 0) return null;
    return Math.round(amount * trm);
};

/** «TRM 3.912,45», para la tarjeta y el diálogo. */
export const formatExchangeRate = (rate) => `TRM ${groupedNumber(Number(rate) || 0, 2)}`;
