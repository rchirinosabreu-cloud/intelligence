import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from '../src/lib/xlsx.js';
import { buildCatalogWorkbook, readCatalogWorkbook, planCatalogImport, catalogChangeData, literalDescriptionHtml, CATALOG_SHEET } from '../src/services/serviceCatalogSpreadsheet.js';

// El catálogo en Excel (Elisa, 20 de noviembre de 2026): descargar, corregir y subir; valores cerrados y
// descripciones que se guardan como se escriben.
const catalog = () => [
  { id: 'a1', category: 'BRANDING', name: 'Manual de marca', description: 'Incluye:\n- Logo\n- Paleta', description_html: '<p><strong>Incluye:</strong></p><ul><li>Logo</li><li>Paleta</li></ul>', costo_real_estimado: 400000, valor_neto: 1201638.3, valor_neto_actual: 1201638.3, precio_comercial_sugerido: null, precio_variable: false, activo: true },
  { id: 'b2', category: 'ADS', name: 'Gestión de pauta', description: 'Pauta mensual', description_html: null, costo_real_estimado: 100000, valor_neto: 600300, valor_neto_actual: 600300, precio_comercial_sugerido: 650000, precio_variable: true, activo: true },
  { id: 'c3', category: 'WEB', name: 'Landing retirada', description: '', description_html: null, costo_real_estimado: 0, valor_neto: 1, valor_neto_actual: 1, precio_comercial_sugerido: null, precio_variable: false, activo: false }
];
const sheetRows = buffer => XLSX.utils.sheet_to_json(XLSX.read(buffer, { type: 'buffer' }).Sheets[CATALOG_SHEET], { defval: '' });
const rebuild = rows => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), CATALOG_SHEET);
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
};

test('el Excel trae todo el catálogo vigente, con categorías y descripciones legibles', () => {
  const rows = sheetRows(buildCatalogWorkbook(catalog().filter(s => s.activo)));
  assert.equal(rows.length, 2);
  const manual = rows.find(r => r['Servicio'] === 'Manual de marca');
  assert.equal(manual['Categoría'], 'Branding');
  assert.equal(manual['Descripción'], 'Incluye:\n- Logo\n- Paleta');
  assert.equal(manual['Precio final'], 1201638.3);
  assert.equal(manual['ID (no modificar)'], 'a1');
  assert.equal(rows.find(r => r['Servicio'] === 'Gestión de pauta')['Precio variable'], 'Sí');
});

test('subir el mismo archivo no cambia nada', () => {
  const buffer = buildCatalogWorkbook(catalog().filter(s => s.activo));
  const plan = planCatalogImport(catalog(), readCatalogWorkbook(buffer));
  assert.deepEqual(plan.changes, []);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.counts.unchanged, 2);
});

test('valores cerrados y descripción nueva salen como cambios, y la descripción se guarda como se escribió', () => {
  const rows = sheetRows(buildCatalogWorkbook(catalog().filter(s => s.activo)));
  rows[0 + rows.findIndex(r => r['Servicio'] === 'Gestión de pauta')]['Precio actual'] = '600.000';
  const manual = rows.find(r => r['Servicio'] === 'Manual de marca');
  manual['Precio final'] = 1200000; manual['Precio actual'] = 1200000;
  manual['Descripción'] = 'Concepto: identidad completa.\n\nIncluye:\n- Logo principal\n- Paleta de color';
  const plan = planCatalogImport(catalog(), readCatalogWorkbook(rebuild(rows)));
  assert.equal(plan.errors.length, 0);
  assert.equal(plan.counts.updates, 2);
  const change = plan.changes.find(c => c.id === 'a1');
  assert.deepEqual(change.fields.map(f => f.field).sort(), ['description', 'valor_neto', 'valor_neto_actual']);
  const data = catalogChangeData(change);
  assert.equal(data.valor_neto, 1200000);
  assert.equal(data.description_html, '<p>Concepto: identidad completa.</p><p>Incluye:</p><ul><li>Logo principal</li><li>Paleta de color</li></ul>');
  assert.equal(plan.changes.find(c => c.id === 'b2').fields[0].after, '$ 600.000');
});

test('una fila sin ID es un servicio nuevo; quitar una fila no borra nada', () => {
  const rows = sheetRows(buildCatalogWorkbook(catalog().filter(s => s.activo))).filter(r => r['Servicio'] !== 'Gestión de pauta');
  rows.push({ 'Categoría': 'Diseño', 'Servicio': 'Post estático', 'Descripción': 'Una pieza', 'Costo real estimado': 20000, 'Precio actual': 80000, 'Precio final': 80000, 'Precio comercial sugerido': '', 'Precio variable': 'No', 'ID (no modificar)': '' });
  const plan = planCatalogImport(catalog(), readCatalogWorkbook(rebuild(rows)));
  assert.equal(plan.errors.length, 0);
  assert.equal(plan.counts.creates, 1);
  const data = catalogChangeData(plan.changes[0]);
  assert.equal(data.category, 'DISENO');
  assert.equal(data.activo, true);
  assert.ok(!plan.changes.some(c => c.id === 'b2'));
});

test('las filas con problemas se nombran y bloquean el guardado', () => {
  const rows = sheetRows(buildCatalogWorkbook(catalog().filter(s => s.activo)));
  rows[0]['Categoría'] = 'Fotografía';
  rows[1]['Precio final'] = '600.300,555';
  rows.push({ ...rows[1], 'Precio final': 600000, 'Servicio': 'Otro' });
  rows.push({ 'Categoría': 'Web', 'Servicio': 'Gestión de pauta', 'Precio actual': 1, 'Precio final': 1, 'Costo real estimado': 0, 'ID (no modificar)': '' });
  rows.push({ 'Categoría': 'Web', 'Servicio': 'Fantasma', 'Precio actual': 1, 'Precio final': 1, 'ID (no modificar)': 'zz' });
  rows.push({ 'Categoría': 'Web', 'Servicio': 'Retirada', 'Precio actual': 1, 'Precio final': 1, 'ID (no modificar)': 'c3' });
  const plan = planCatalogImport(catalog(), readCatalogWorkbook(rebuild(rows)));
  const all = plan.errors.flatMap(e => e.problems).join(' | ');
  assert.match(all, /La categoría «Fotografía» no existe/);
  assert.match(all, /más de dos decimales/);
  assert.match(all, /aparece dos veces/);
  assert.match(all, /Ya existe otro servicio llamado «Gestión de pauta»|se repite con la fila/);
  assert.match(all, /no corresponde a ningún servicio/);
  assert.match(all, /fue eliminado/);
});

test('un archivo que no es el del catálogo se rechaza diciendo qué falta', () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ Nombre: 'x', Valor: 1 }]), 'Hoja1');
  assert.throws(() => readCatalogWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })), /Faltan columnas/);
  assert.throws(() => readCatalogWorkbook(Buffer.from('no soy un excel')), err => err.statusCode === 400);
});

test('la descripción se guarda literal: guiones a viñetas, lo demás en párrafos, sin HTML inyectado', () => {
  assert.equal(literalDescriptionHtml('Hola\nsegunda línea\n\n• uno\n- dos'), '<p>Hola<br>segunda línea</p><ul><li>uno</li><li>dos</li></ul>');
  assert.doesNotMatch(literalDescriptionHtml('<script>alert(1)</script>'), /<script/);
});
