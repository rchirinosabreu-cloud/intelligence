// El campo de dinero de la plataforma (Rodny, 30 de septiembre de 2026: «cuando se refleja
// un valor usa los puntos, pero cuando lo estoy escribiendo no hace los puntos de cada tres
// dígitos … esto debe ser GLOBAL»). Lógica pura: la usan `MoneyInput`, sus pruebas y el
// servidor cuando le llega un valor escrito a mano.
//
// Las reglas:
// - Los puntos de miles los pone la plataforma. Un punto escrito a mano se ignora, así la
//   costumbre de escribir «1.200.000» nunca convierte un millón en 1,20.
// - La coma abre los centavos, opcionales y como máximo dos: los extractos del banco los
//   traen (el 4×1000, los intereses) y un campo que los quitara borraría datos reales.
// - Lo que viaja al formulario y al servidor es el número limpio, «1200000.5»: nada de lo
//   que ya lee esos valores cambia.

export const AMOUNT_DECIMALS = 2;

/** Centavos opcionales en pesos y en dólares. Un solo sitio por si alguna moneda cambia. */
export const amountDecimalsFor = () => AMOUNT_DECIMALS;

const groupThousands = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const stripLeadingZeros = (digits) => {
    const trimmed = digits.replace(/^0+(?=\d)/, '');
    return trimmed;
};

// Un valor limpio tiene como mucho un punto decimal y nunca tres decimales exactos: esos
// son un punto de miles («1.200»), como los que dejaba un borrador escrito con puntos.
const CLEAN_VALUE = /^-?\d+(\.\d+)?$/;
const isCleanValue = (text) => CLEAN_VALUE.test(text) && !/\.\d{3}$/.test(text);

/**
 * Un valor (limpio «1200000.5», un número, o uno que ya venía con puntos) tal como se
 * ve: «1.200.000,5». Los ceros de más al final de los decimales no se muestran, y como
 * mucho van `decimals` cifras decimales.
 */
export const formatAmountDisplay = (value, { allowNegative = false, decimals = AMOUNT_DECIMALS } = {}) => {
    if (value === null || value === undefined || value === '') return '';
    const raw = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value).trim();
    if (!raw) return '';
    const text = isCleanValue(raw) ? raw : readPastedAmount(raw, { decimals, allowNegative: true });
    if (!text) return '';
    const negative = allowNegative && text.startsWith('-');
    const [intPart = '', fracPart = ''] = text.replace(/^-/, '').split('.');
    const digits = stripLeadingZeros(intPart.replace(/\D/g, '')) || '0';
    const fraction = fracPart.replace(/\D/g, '').slice(0, decimals).replace(/0+$/, '');
    return `${negative ? '-' : ''}${groupThousands(digits)}${fraction ? `,${fraction}` : ''}`;
};

/**
 * Lo que queda al escribir. Recibe el texto del campo tal como lo dejó la tecla y
 * devuelve el valor limpio y cómo mostrarlo. Solo la coma abre decimales; los puntos
 * se ignoran porque los vuelve a poner el formato.
 */
export const readTypedAmount = (text, { decimals = AMOUNT_DECIMALS, allowNegative = false } = {}) => {
    const raw = String(text ?? '');
    const negative = allowNegative && raw.trimStart().startsWith('-');
    const kept = raw.replace(/[^\d,]/g, '');
    const commaAt = kept.indexOf(',');
    // Sin decimales, lo que venga tras una coma no son cifras del entero: se descarta.
    const intSource = commaAt === -1 ? kept : kept.slice(0, commaAt);
    const fraction = commaAt === -1 || decimals === 0 ? '' : kept.slice(commaAt + 1).replace(/,/g, '').slice(0, decimals);
    const hasComma = commaAt !== -1 && decimals > 0;
    const intDigits = intSource ? stripLeadingZeros(intSource) : '';
    const sign = negative ? '-' : '';

    if (!intDigits && !hasComma) return { value: '', display: sign };
    const intShown = intDigits || '0';
    return {
        value: `${sign}${intShown}${fraction ? `.${fraction}` : ''}`,
        display: `${sign}${groupThousands(intShown)}${hasComma ? `,${fraction}` : ''}`
    };
};

/**
 * Un valor pegado desde Excel, un correo o un extracto, en el formato de donde venga:
 * «$ 1.200.000», «1,200,000.50», «4938,27». Devuelve el valor limpio o ''.
 * Con los dos separadores, el último es el decimal. Con uno solo repetido, son miles.
 * Con uno solo una vez, es de miles si lo siguen exactamente tres dígitos.
 */
export const readPastedAmount = (text, { decimals = AMOUNT_DECIMALS, allowNegative = false } = {}) => {
    const raw = String(text ?? '').trim();
    const negative = allowNegative && /^-|^\(|-\s*$/.test(raw.replace(/^[^\d(-]*/, ''));
    const kept = raw.replace(/[^\d.,]/g, '');
    if (!/\d/.test(kept)) return '';

    let decimalMark = null;
    const lastDot = kept.lastIndexOf('.');
    const lastComma = kept.lastIndexOf(',');
    if (lastDot !== -1 && lastComma !== -1) {
        decimalMark = lastDot > lastComma ? '.' : ',';
    } else {
        const mark = lastDot !== -1 ? '.' : lastComma !== -1 ? ',' : null;
        if (mark) {
            const occurrences = kept.split(mark).length - 1;
            const after = kept.slice(kept.lastIndexOf(mark) + 1);
            if (occurrences === 1 && after.length !== 3) decimalMark = mark;
        }
    }

    let intPart = kept;
    let fraction = '';
    if (decimalMark) {
        const at = kept.lastIndexOf(decimalMark);
        intPart = kept.slice(0, at);
        fraction = kept.slice(at + 1).replace(/\D/g, '').slice(0, decimals);
    }
    const digits = stripLeadingZeros(intPart.replace(/\D/g, '')) || '0';
    return `${negative ? '-' : ''}${digits}${decimals > 0 && fraction ? `.${fraction}` : ''}`;
};

/**
 * Lee un valor de dinero escrito a mano, venga del campo de dinero («1200000.5») o de
 * alguien que lo tecleó con puntos («1.200.000»). Devuelve un número o null.
 */
export const parseAmountText = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const clean = readPastedAmount(value, { allowNegative: true });
    if (!clean) return null;
    const number = Number(clean);
    return Number.isFinite(number) ? number : null;
};

const SIGNIFICANT = /[\d,-]/;

/**
 * Dónde queda el cursor después de reformatear: tras el mismo número de cifras (y coma)
 * que tenía antes, sin contar los puntos que el formato pone o quita.
 */
export const caretAfterFormat = (rawText, rawCaret, formatted) => {
    let wanted = 0;
    for (let index = 0; index < Math.min(rawCaret, rawText.length); index += 1) {
        if (SIGNIFICANT.test(rawText[index])) wanted += 1;
    }
    if (wanted === 0) return 0;
    let seen = 0;
    for (let index = 0; index < formatted.length; index += 1) {
        if (SIGNIFICANT.test(formatted[index])) seen += 1;
        if (seen === wanted) return index + 1;
    }
    return formatted.length;
};
