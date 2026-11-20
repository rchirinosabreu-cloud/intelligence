// El catálogo de servicios en Excel: se descarga entero, se corrige en la hoja y se vuelve a subir
// (Elisa y Rodny, 20 de noviembre de 2026: «quiero todo el catálogo … descargar el documento para yo modificar
// sobre ese que ya está»; dejar los valores cerrados, sin «pesitos», y descripciones que se lean claras).
//
// Una fila es un servicio y la columna «ID» la une con el de la plataforma: una fila sin ID es un servicio
// nuevo. Quitar una fila no borra nada; para retirar un servicio se usa el catálogo. La descripción se guarda tal
// como se escribe: las líneas que empiezan por «-» o «•» salen como viñetas y el resto como párrafos, sin
// reacomodar el texto. Subir el archivo primero muestra lo que va a cambiar; nada se guarda sin confirmar.
import { createHash } from 'node:crypto';
import XLSX from '../lib/xlsx.js';
import { parseAmountText } from '../lib/amountInput.js';
import { proposalHtmlToCatalogText } from './serviceCatalogDescription.js';
import { sanitizeProposalHtml } from './quotationProposalDetails.js';

export const CATALOG_CATEGORIES = Object.freeze([
  ['BRANDING', 'Branding'], ['DISENO', 'Diseño'], ['COMUNICACION_CORPORATIVA', 'Comunicación Corporativa'],
  ['PRODUCCION_AUDIOVISUAL', 'Producción Audiovisual'], ['MARKETING', 'Marketing'], ['ADS', 'Ads'],
  ['EDITORIAL', 'Editorial'], ['WEB', 'Web'], ['DESARROLLO', 'Desarrollo'], ['MERCHANDISING_IMPRESION', 'Merchandising / Impresión']
]);
const CATEGORY_LABEL = new Map(CATALOG_CATEGORIES);
const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const CATEGORY_BY_TEXT = new Map(CATALOG_CATEGORIES.flatMap(([id, label]) => [[normalize(id), id], [normalize(label), id]]));

export const CATALOG_SHEET = 'Catálogo';
const COLUMNS = [
  ['category', 'Categoría'], ['name', 'Servicio'], ['description', 'Descripción'],
  ['costo_real_estimado', 'Costo real estimado'], ['valor_neto_actual', 'Precio actual'], ['valor_neto', 'Precio final'],
  ['precio_comercial_sugerido', 'Precio comercial sugerido'], ['precio_variable', 'Precio variable'], ['id', 'ID (no modificar)']
];
const LABEL = Object.fromEntries(COLUMNS);
const MONEY_FIELDS = ['costo_real_estimado', 'valor_neto_actual', 'valor_neto', 'precio_comercial_sugerido'];
const MAX_ROWS = 2000;

const money = value => (value === null || value === undefined || value === '' ? null : Math.round(Number(value) * 100) / 100);

/** El texto de la descripción como se ve en la cotización: viñetas con «- » y párrafos en líneas. */
export const catalogDescriptionText = service => (service.description_html ? proposalHtmlToCatalogText(service.description_html) : String(service.description || '')).trim();

const cleanText = value => String(value ?? '').replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const BULLET = /^[-•*·]\s*/;

/** La descripción tal como se escribió: viñetas para las líneas con guion y párrafos para lo demás. */
export function literalDescriptionHtml(text) {
  const html = [];
  let list = [], paragraph = [];
  const flushList = () => { if (list.length) html.push(`<ul>${list.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`); list = []; };
  const flushParagraph = () => { if (paragraph.length) html.push(`<p>${paragraph.map(escapeHtml).join('<br>')}</p>`); paragraph = []; };
  for (const line of cleanText(text).split('\n')) {
    if (!line) { flushList(); flushParagraph(); continue; }
    if (BULLET.test(line)) { flushParagraph(); list.push(line.replace(BULLET, '')); continue; }
    flushList(); paragraph.push(line);
  }
  flushList(); flushParagraph();
  return sanitizeProposalHtml(html.join(''));
}

const exportRow = service => ({
  category: CATEGORY_LABEL.get(service.category) || service.category,
  name: service.name,
  description: catalogDescriptionText(service),
  costo_real_estimado: money(service.costo_real_estimado),
  valor_neto_actual: money(service.valor_neto_actual),
  valor_neto: money(service.valor_neto),
  precio_comercial_sugerido: money(service.precio_comercial_sugerido),
  precio_variable: service.precio_variable ? 'Sí' : 'No',
  id: service.id
});

/** La huella del catálogo vigente: si alguien lo cambia entre revisar y confirmar, se vuelve a revisar. */
export const catalogRevision = services => createHash('sha256').update(JSON.stringify(
  [...services].sort((a, b) => a.id.localeCompare(b.id)).map(exportRow)
)).digest('hex').slice(0, 24);

export function buildCatalogWorkbook(services) {
  const rows = [...services]
    .sort((a, b) => (CATEGORY_LABEL.get(a.category) || '').localeCompare(CATEGORY_LABEL.get(b.category) || '', 'es') || a.name.localeCompare(b.name, 'es'))
    .map(exportRow);
  const sheet = XLSX.utils.json_to_sheet(rows.map(row => Object.fromEntries(COLUMNS.map(([key, label]) => [label, row[key] ?? '']))), { header: COLUMNS.map(([, label]) => label) });
  sheet['!cols'] = [{ wch: 24 }, { wch: 40 }, { wch: 80 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 38 }];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let r = 1; r <= range.e.r; r++) {
    for (let c = 3; c <= 6; c++) { const cell = sheet[XLSX.utils.encode_cell({ r, c })]; if (cell && cell.t === 'n') cell.z = '#,##0.##'; }
  }
  sheet['!autofilter'] = { ref: sheet['!ref'] };
  const help = XLSX.utils.aoa_to_sheet([
    ['Cómo usar este archivo'],
    ['Corrige lo que necesites en la hoja «Catálogo» y súbela en Cotizaciones → Catálogo → «Subir Excel».'],
    ['Antes de guardar, la plataforma te muestra servicio por servicio lo que va a cambiar.'],
    ['No cambies ni borres la columna «ID»: es la que une cada fila con su servicio.'],
    ['Para crear un servicio nuevo, agrega una fila y deja el ID vacío.'],
    ['Quitar una fila no borra el servicio. Para retirarlo, usa la papelera en el catálogo.'],
    ['Descripción: cada línea que empieza con «-» sale como viñeta; las demás, como párrafo. Una línea en blanco separa bloques.'],
    ['Valores: escríbelos como número (1200000 o 1.200.000). Se aceptan hasta dos decimales.'],
    ['Precio variable: «Sí» o «No».'],
    [`Categorías válidas: ${CATALOG_CATEGORIES.map(([, label]) => label).join(', ')}.`],
    ['Las cotizaciones ya hechas no cambian; el catálogo corregido se usa en las nuevas.']
  ]);
  help['!cols'] = [{ wch: 120 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, CATALOG_SHEET);
  XLSX.utils.book_append_sheet(book, help, 'Instrucciones');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

const readMoney = (value, label, problems, { required = false } = {}) => {
  if (value === null || value === undefined || String(value).trim() === '') {
    if (required) problems.push(`«${label}» está vacío.`);
    return null;
  }
  const text = typeof value === 'number' ? null : String(value).replace(/\$/g, '').trim();
  if (text && /,\d{3,}$/.test(text)) { problems.push(`«${label}» tiene más de dos decimales (${value}).`); return null; }
  const number = parseAmountText(text ?? value);
  if (number === null || number < 0) { problems.push(`«${label}» no es un valor válido (${value}).`); return null; }
  if (Math.round(number * 100) !== Math.round(number * 10000) / 100) { problems.push(`«${label}» tiene más de dos decimales (${value}).`); return null; }
  return Math.round(number * 100) / 100;
};
const readFlag = (value, problems) => {
  const text = normalize(value);
  if (!text || text === 'no' || text === 'false' || text === '0') return false;
  if (text === 'si' || text === 'true' || text === '1') return true;
  problems.push(`«Precio variable» debe ser Sí o No (${value}).`);
  return false;
};

/** Lee la hoja «Catálogo» (o la primera) y devuelve filas con sus problemas por fila. */
export function readCatalogWorkbook(buffer) {
  let book;
  try { book = XLSX.read(buffer, { type: 'buffer' }); } catch { throw Object.assign(new Error('El archivo no se pudo leer como Excel.'), { statusCode: 400 }); }
  const sheet = book.Sheets[CATALOG_SHEET] || book.Sheets[book.SheetNames[0]];
  if (!sheet) throw Object.assign(new Error('El archivo no tiene hojas.'), { statusCode: 400 });
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const byLabel = new Map(COLUMNS.map(([key, label]) => [normalize(label), key]));
  byLabel.set(normalize('ID'), 'id');
  const headers = Object.keys(raw[0] || {});
  const missing = ['name', 'category', 'id'].filter(key => !headers.some(header => byLabel.get(normalize(header)) === key));
  if (!raw.length) throw Object.assign(new Error('La hoja «Catálogo» está vacía.'), { statusCode: 400 });
  if (missing.length) throw Object.assign(new Error(`Faltan columnas: ${missing.map(key => `«${LABEL[key]}»`).join(', ')}. Usa el archivo que descarga la plataforma.`), { statusCode: 400 });
  if (raw.length > MAX_ROWS) throw Object.assign(new Error(`El archivo tiene más de ${MAX_ROWS} filas.`), { statusCode: 400 });
  return raw.map((cells, index) => {
    const value = key => { const header = headers.find(h => byLabel.get(normalize(h)) === key); return header === undefined ? undefined : cells[header]; };
    const problems = [];
    const name = String(value('name') ?? '').replace(/\s+/g, ' ').trim();
    const categoryText = String(value('category') ?? '').trim();
    const category = CATEGORY_BY_TEXT.get(normalize(categoryText)) || null;
    if (!name) problems.push('Falta el nombre del servicio.');
    if (!category) problems.push(categoryText ? `La categoría «${categoryText}» no existe.` : 'Falta la categoría.');
    const has = key => value(key) !== undefined;
    const row = {
      row: index + 2,
      id: String(value('id') ?? '').trim() || null,
      name, category,
      description: has('description') ? cleanText(value('description')) : undefined,
      costo_real_estimado: has('costo_real_estimado') ? readMoney(value('costo_real_estimado'), LABEL.costo_real_estimado, problems) : undefined,
      valor_neto_actual: has('valor_neto_actual') ? readMoney(value('valor_neto_actual'), LABEL.valor_neto_actual, problems) : undefined,
      valor_neto: has('valor_neto') ? readMoney(value('valor_neto'), LABEL.valor_neto, problems) : undefined,
      precio_comercial_sugerido: has('precio_comercial_sugerido') ? readMoney(value('precio_comercial_sugerido'), LABEL.precio_comercial_sugerido, problems) : undefined,
      precio_variable: has('precio_variable') ? readFlag(value('precio_variable'), problems) : undefined,
      problems
    };
    const empty = !row.id && !name && !categoryText && !row.description;
    return empty ? null : row;
  }).filter(Boolean);
}

const show = (field, value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (MONEY_FIELDS.includes(field)) return `$ ${Number(value).toLocaleString('es-CO', { maximumFractionDigits: 2 })}`;
  if (field === 'category') return CATEGORY_LABEL.get(value) || value;
  if (field === 'precio_variable') return value ? 'Sí' : 'No';
  return String(value);
};

/**
 * Compara el archivo con el catálogo vigente. Devuelve qué servicios cambian y en qué, qué servicios nuevos se
 * crean y qué filas tienen problemas. No guarda nada.
 */
export function planCatalogImport(services, rows) {
  const active = services.filter(service => service.activo !== false);
  const byId = new Map(services.map(service => [service.id, service]));
  const errors = [], changes = [];
  const seenIds = new Set(), seenNames = new Map();
  for (const row of rows) {
    const problems = [...row.problems];
    if (row.id && !byId.has(row.id)) problems.push('El ID no corresponde a ningún servicio del catálogo. No lo modifiques; para uno nuevo deja el ID vacío.');
    if (row.id && byId.get(row.id)?.activo === false) problems.push('Ese servicio fue eliminado del catálogo.');
    if (row.id && seenIds.has(row.id)) problems.push('Este servicio aparece dos veces en el archivo.');
    if (row.id) seenIds.add(row.id);
    const key = normalize(row.name);
    if (key && seenNames.has(key)) problems.push(`El nombre se repite con la fila ${seenNames.get(key)}.`);
    if (key) seenNames.set(key, row.row);
    const clash = key && active.find(service => normalize(service.name) === key && service.id !== row.id);
    if (clash && !rows.some(other => other.id === clash.id && normalize(other.name) !== key)) problems.push(`Ya existe otro servicio llamado «${clash.name}».`);
    if (!row.id) {
      if (row.valor_neto_actual === null || row.valor_neto_actual === undefined) problems.push('Un servicio nuevo necesita «Precio actual».');
      if (row.valor_neto === null || row.valor_neto === undefined) problems.push('Un servicio nuevo necesita «Precio final».');
      if (row.costo_real_estimado === null || row.costo_real_estimado === undefined) problems.push('Un servicio nuevo necesita «Costo real estimado».');
    } else {
      if (row.valor_neto_actual === null) problems.push('«Precio actual» no puede quedar vacío.');
      if (row.valor_neto === null) problems.push('«Precio final» no puede quedar vacío.');
    }
    if (problems.length) { errors.push({ row: row.row, name: row.name || '(sin nombre)', problems }); continue; }
    const current = row.id ? exportRow(byId.get(row.id)) : null;
    const before = current ? { ...current, category: byId.get(row.id).category, precio_variable: Boolean(byId.get(row.id).precio_variable) } : {};
    const fields = [];
    for (const field of ['category', 'name', 'description', ...MONEY_FIELDS, 'precio_variable']) {
      const after = row[field];
      if (after === undefined) continue;
      const old = before[field] ?? null;
      const same = MONEY_FIELDS.includes(field) ? money(old) === money(after) : (old ?? '') === (after ?? '');
      if (row.id && same) continue;
      fields.push({ field, label: field === 'category' ? 'Categoría' : field === 'name' ? 'Servicio' : LABEL[field], before: row.id ? show(field, old) : null, after: show(field, after), value: after });
    }
    if (row.id && !fields.length) continue;
    changes.push({ kind: row.id ? 'UPDATE' : 'CREATE', id: row.id, row: row.row, name: row.name, fields });
  }
  return {
    revision: catalogRevision(active),
    changes,
    errors,
    counts: { rows: rows.length, updates: changes.filter(c => c.kind === 'UPDATE').length, creates: changes.filter(c => c.kind === 'CREATE').length, unchanged: rows.length - changes.length - errors.length }
  };
}

/** Los datos a guardar de un cambio, con la descripción tal como se escribió. */
export function catalogChangeData(change) {
  const data = {};
  for (const { field, value } of change.fields) {
    if (field === 'description') {
      data.description = value;
      data.description_html = value ? literalDescriptionHtml(value) : null;
    } else data[field] = value;
  }
  if (change.kind === 'CREATE') {
    data.description ??= '';
    data.activo = true;
    data.precio_variable = Boolean(data.precio_variable);
  }
  return data;
}
