// Descripción estructurada del alcance. Ningún campo de este objeto calcula el cupo ni el progreso:
// el objetivo medible sigue en ClientContract.deliverables, con las reglas nativas de operación.
export const SCOPE_FORMATS = ['Video', 'Reel', 'Carrusel', 'Post', 'Otro'];
export const SCOPE_RULES = ['EXACTA', 'MINIMO', 'MAXIMO'];
export const STORY_PERIODS = ['SEMANA', 'MES', 'DIAS_SEMANA'];
export const PRODUCTION_PERIODS = ['MES', 'CONTRATO'];
export const SERVICE_CATEGORIES = ['BLOG', 'WEB', 'COMUNIDAD', 'MARCAS', 'PERFILES', 'OTRO'];
export const SERVICE_FREQUENCIES = ['SEMANA', 'MES', 'CONTRATO', 'PUNTUAL'];
const PRODUCTION_RULES = ['EXACTA', 'MAXIMO'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** Null retira la ficha; omitirla se decide en normalizeOperationProfile, sin rellenar desde legado. */
export function normalizeContractScope(input) {
  const errors = {};
  const error = (field, message) => { errors[`contract.scopeDetails${field ? `.${field}` : ''}`] = message; };
  const result = value => ({ valid: Object.keys(errors).length === 0, value, errors });
  if (input === null) return result(null);
  if (!isObject(input)) { error('', 'El alcance debe ser una ficha válida.'); return result(null); }
  if (input.version !== undefined && input.version !== 1) error('version', 'Esta versión del alcance no es compatible.');
  const text = (value, field, max, required = false) => {
    if (value === undefined || value === null || value === '') {
      if (required) error(field, 'Completa este campo.');
      return null;
    }
    if (typeof value !== 'string' || value.trim().length > max) { error(field, `Usa texto de hasta ${max} caracteres.`); return null; }
    const clean = value.trim();
    if (required && !clean) error(field, 'Completa este campo.');
    return clean || null;
  };
  const number = (value, field, max, integer = true) => {
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return null;
    const numeric = typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()));
    const n = numeric ? Number(value) : NaN;
    if (!Number.isFinite(n) || n < 0 || n > max || (integer && !Number.isInteger(n))) {
      error(field, `Escribe ${integer ? 'un entero' : 'una cantidad'} de 0 a ${max}, o deja el dato pendiente.`); return null;
    }
    return n;
  };
  const choice = (value, options, field, fallback = null) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (!options.includes(value)) { error(field, 'Elige una de las opciones disponibles.'); return fallback; }
    return value;
  };
  const section = (value, field) => {
    if (value === undefined || value === null) return null;
    if (!isObject(value)) { error(field, 'Completa una sección válida.'); return null; }
    return value;
  };
  const rows = (value, field, max) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > max) { error(field, `Usa una lista de hasta ${max} elementos.`); return []; }
    return value;
  };

  const formats = new Set();
  const contentLimits = rows(input.contentLimits, 'contentLimits', SCOPE_FORMATS.length).map((raw, index) => {
    const field = `contentLimits.${index}`, row = section(raw, field) || {};
    const format = choice(row.format, SCOPE_FORMATS, `${field}.format`);
    if (!format || formats.has(format)) error(`${field}.format`, 'Elige un formato distinto para cada fila.');
    formats.add(format);
    return { format, quantity: number(row.quantity, `${field}.quantity`, 999), rule: choice(row.rule, SCOPE_RULES, `${field}.rule`, 'EXACTA') };
  });

  const rawStories = section(input.stories, 'stories');
  let stories = null;
  if (rawStories) {
    const period = choice(rawStories.period, STORY_PERIODS, 'stories.period');
    stories = { quantity: number(rawStories.quantity, 'stories.quantity', period === 'DIAS_SEMANA' ? 7 : 999), period,
      perOccasion: number(rawStories.perOccasion, 'stories.perOccasion', 999) };
  }

  const rawProduction = section(input.production, 'production');
  let production = null;
  if (rawProduction) {
    const included = rawProduction.included ?? null;
    if (included !== null && typeof included !== 'boolean') error('production.included', 'Indica si está incluida o si falta confirmarlo.');
    production = { included,
      quantity: number(rawProduction.quantity, 'production.quantity', 366),
      period: choice(rawProduction.period, PRODUCTION_PERIODS, 'production.period'),
      hours: number(rawProduction.hours, 'production.hours', 24, false),
      rule: choice(rawProduction.rule, PRODUCTION_RULES, 'production.rule', 'EXACTA'),
      hoursRule: choice(rawProduction.hoursRule, PRODUCTION_RULES, 'production.hoursRule', 'EXACTA'),
    };
    // Las horas son POR JORNADA. Un «no incluido» nunca borra en silencio los datos contradictorios.
    if (included === false && production.quantity > 0) error('production.quantity', 'No puede haber jornadas positivas si la producción no está incluida.');
    if (included === false && production.hours > 0) error('production.hours', 'No puede haber horas positivas si la producción no está incluida.');
  }

  const ids = new Set();
  const additionalServices = rows(input.additionalServices, 'additionalServices', 30).map((raw, index) => {
    const field = `additionalServices.${index}`, row = section(raw, field) || {};
    const id = text(row.id, `${field}.id`, 100, true);
    if (ids.has(id)) error(`${field}.id`, 'Cada servicio necesita un identificador distinto.');
    ids.add(id);
    const category = choice(row.category, SERVICE_CATEGORIES, `${field}.category`);
    if (!category) error(`${field}.category`, 'Elige una categoría.');
    return { id, category, label: text(row.label, `${field}.label`, 180, true), quantity: number(row.quantity, `${field}.quantity`, 99999, false),
      unit: text(row.unit, `${field}.unit`, 80), frequency: choice(row.frequency, SERVICE_FREQUENCIES, `${field}.frequency`),
      notes: text(row.notes, `${field}.notes`, 1000) };
  });
  return result({ version: 1, contentLimits, stories, production, additionalServices, reviewPending: text(input.reviewPending, 'reviewPending', 2000) });
}
