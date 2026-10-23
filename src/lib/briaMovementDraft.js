// Registrar un movimiento conversando (Rodny, 22 de octubre de 2026: «que incluso la contadora pueda enviar una imagen
// por WhatsApp y decir: registra este movimiento, este es el comprobante … que se sienta natural, rápido, fluido,
// intuitivo»). Regla pura: cómo se entiende lo que la persona dice o lo que Bria leyó en el comprobante, y el párrafo
// que se lee antes de confirmar. La acción (preparar y registrar) vive en briaActionService.
import { FINANCIAL_CATEGORY_OPTIONS } from './financialCategories.js';
import { parseAmountText } from './amountInput.js';
import { humanDate } from './briaAssistant.js';

const fold = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const movementType = (value) => {
  const text = fold(value);
  if (!text) return null;
  if (text === 'income' || /\b(ingreso|entrada|cobro|cobramos|nos pagaron|recibimos|recibido|abono)\b/.test(text)) return 'INCOME';
  if (text === 'expense' || /\b(egreso|gasto|pago|pagamos|pague|salida|compra|compramos)\b/.test(text)) return 'EXPENSE';
  return null;
};

// Lo que se dice en vez del nombre de la categoría. Solo lo inequívoco: lo demás se pregunta.
const CATEGORY_WORDS = [
  [/\b(impuesto|impuestos|dian|iva|retencion|ica|predial)\b/, 'TAX'],
  [/(4x1000|4 x 1000|cuatro por mil|gmf|comision bancaria|cuota de manejo|intereses|\bbanco\b)/, 'FINANCIAL'],
  [/\b(nomina|sueldo|sueldos|salario|quincena|prestaciones)\b/, 'NOMINA'],
  [/\b(pauta|ads|anuncios|publicidad pagada)\b/, 'PAUTA'],
  [/\b(prestamo|prestamos)\b/, 'PRESTAMO'],
  [/\b(donacion|donaciones)\b/, 'DONACION'],
  [/\b(membresia|suscripcion)\b/, 'MEMBRESIA'],
  [/\b(logistica|transporte|envio|mensajeria|domicilio)\b/, 'LOGISTICA']
];
export const MOVEMENT_CATEGORY_LABELS = FINANCIAL_CATEGORY_OPTIONS.map(([, label]) => label);
export const movementCategoryLabel = (value) => FINANCIAL_CATEGORY_OPTIONS.find(([key]) => key === value)?.[1] || value;
export const movementCategory = (value) => {
  const text = fold(value);
  if (!text) return null;
  const exact = FINANCIAL_CATEGORY_OPTIONS.find(([key, label]) => fold(key) === text || fold(label) === text);
  if (exact) return exact[0];
  return CATEGORY_WORDS.find(([pattern]) => pattern.test(text))?.[1] || null;
};

/** Un valor positivo: el tipo dice si entra o sale. */
export const movementAmount = (value) => {
  const number = parseAmountText(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : null;
};

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const validDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const shift = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** La fecha de un movimiento mira hacia atrás: ya pasó. Una fecha que caería en el futuro no se acepta. */
export const movementDate = (value, today) => {
  const text = fold(value).replace(/^(el|este|pasado|del)\s+/, '').replace(/\s+pasado$/, '');
  if (!text || !validDay(today)) return null;
  if (validDay(text)) return text <= today ? text : null;
  if (text === 'hoy') return today;
  if (text === 'ayer') return shift(today, -1);
  if (['antier', 'anteayer', 'antes de ayer'].includes(text)) return shift(today, -2);
  const weekday = WEEKDAYS.indexOf(text);
  if (weekday >= 0) return shift(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() - weekday + 7) % 7));
  const written = text.match(/^(\d{1,2}) (?:de )?([a-z]+)(?: (?:de )?(\d{4}))?$/);
  if (!written || !MONTHS.includes(written[2])) return null;
  const build = (year) => `${year}-${String(MONTHS.indexOf(written[2]) + 1).padStart(2, '0')}-${written[1].padStart(2, '0')}`;
  if (written[3]) { const day = build(written[3]); return validDay(day) && day <= today ? day : null; }
  const thisYear = build(today.slice(0, 4));
  if (!validDay(thisYear)) return null;
  return thisYear <= today ? thisYear : build(Number(today.slice(0, 4)) - 1);
};

const RECEIPT_KINDS = new Set(['IMAGE', 'PDF']);
const LAST = /^(el |la )?(ultim[oa]|anterior|ese|esa|este|esta|si|true)$/;
/**
 * Qué archivo del chat es el comprobante: el que se nombra, o «el último», o —sin decir nada— el que llegó con este
 * mismo mensaje. Solo una imagen o un PDF, que es lo que admite un movimiento. `files` va del más reciente al más viejo.
 */
export const pickReceipt = (files = [], wanted = null) => {
  const usable = files.filter((file) => RECEIPT_KINDS.has(file.status));
  const text = fold(wanted);
  if (!text) return usable.find((file) => file.current) || null;
  if (LAST.test(text)) return usable[0] || null;
  return usable.find((file) => fold(file.name).includes(text)) || null;
};

// Pesos como se escriben en Colombia: puntos de mil y, solo si hay centavos, dos cifras tras la coma.
const money = (amount) => `$${new Intl.NumberFormat('es-CO', Number.isInteger(amount) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

/** El párrafo que se lee antes de confirmar: en palabras, sin nombres de campos ni ids. */
export const movementParagraph = ({ type, amount, date, accountName, category, concept, counterparty, clientName, receiptName }) => {
  const kind = type === 'INCOME' ? 'un ingreso' : 'un egreso';
  const whom = clientName || counterparty;
  const who = whom ? `, ${type === 'INCOME' ? 'de' : 'a'} ${whom}` : '';
  const what = concept ? `: ${concept}` : '';
  const receipt = receiptName ? ` Le pego el comprobante ${receiptName}.` : '';
  return `Registro ${kind} de ${money(amount)} del ${humanDate(date)} en ${accountName}, categoría ${movementCategoryLabel(category)}${what}${who}.${receipt}`;
};
