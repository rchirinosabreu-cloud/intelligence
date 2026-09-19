import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { catalogDescriptionToHtml, catalogServiceHtml, formatCatalogDescription, parseCatalogDescription, proposalHtmlToCatalogText, resolveCatalogDescriptionInput, splitEnumeration } from '../src/services/serviceCatalogDescription.js';
import { proposalRichTextBlocks, sanitizeProposalHtml } from '../src/services/quotationProposalDetails.js';
import { formatCatalogFile, formatStoredCatalogDescriptions } from '../scripts/format-service-catalog-descriptions.js';

const running = 'Concepto: evaluación de la identidad visual de la marca.\nIncluye: revisión de logotipo, colores, tipografías y tono de comunicación; diagnóstico con hallazgos principales y recomendaciones prácticas.\nNo incluye: rediseño de marca, naming, slogan ni implementación de ajustes.';
const formatted = [
  'Concepto: evaluación de la identidad visual de la marca.',
  'Incluye:', '- Revisión de logotipo', '- Colores', '- Tipografías', '- Tono de comunicación', '- Diagnóstico con hallazgos principales y recomendaciones prácticas',
  'No incluye:', '- Rediseño de marca', '- Naming', '- Slogan', '- Implementación de ajustes'
].join('\n');

test('running catalog text becomes labelled sections with one bullet per item', () => {
  assert.equal(formatCatalogDescription(running), formatted);
});
test('formatting is idempotent, so a second pass keeps hand-made bullets untouched', () => {
  assert.equal(formatCatalogDescription(formatted), formatted);
  const curated = 'Incluye:\n- Textos para inicio, nosotros, servicios y contacto\n- Enfoque claro, comercial y alineado a la marca';
  assert.equal(formatCatalogDescription(curated), curated);
});
test('sub-lists stay with the phrase that opened them', () => {
  assert.deepEqual(splitEnumeration('8 contenidos distribuidos en 3 reels, 4 piezas gráficas y 1 carrusel, 2 historias semanales y copies'), ['8 contenidos distribuidos en 3 reels, 4 piezas gráficas y 1 carrusel', '2 historias semanales', 'Copies']);
  assert.deepEqual(splitEnumeration('creación/configuración de Instagram, Facebook y TikTok, parrilla de contenidos e informe básico'), ['Creación/configuración de Instagram, Facebook y TikTok', 'Parrilla de contenidos', 'Informe básico']);
  assert.deepEqual(splitEnumeration('diseño para camisetas, mugs, gorras u otros elementos según formato; entrega de archivo digital'), ['Diseño para camisetas, mugs, gorras u otros elementos según formato', 'Entrega de archivo digital']);
  assert.deepEqual(splitEnumeration('anuncios, optimización y reporte de resultados para campañas de búsqueda, display o similares según objetivo'), ['Anuncios', 'Optimización', 'Reporte de resultados para campañas de búsqueda, display o similares según objetivo']);
  assert.deepEqual(splitEnumeration('20 contenidos mensuales entre posts, reels o carruseles, 5 historias semanales y copies'), ['20 contenidos mensuales entre posts, reels o carruseles', '5 historias semanales', 'Copies']);
  assert.deepEqual(splitEnumeration('pruebas; puede incluir clientes, tareas, inventario o reportes según alcance'), ['Pruebas', 'Puede incluir clientes, tareas, inventario o reportes según alcance']);
  assert.deepEqual(splitEnumeration('ajustes menores, revisión de enlaces y visualización general, hasta 3 horas de soporte'), ['Ajustes menores', 'Revisión de enlaces', 'Visualización general, hasta 3 horas de soporte']);
  assert.deepEqual(splitEnumeration('diagnóstico con hallazgos y recomendaciones prácticas'), ['Diagnóstico con hallazgos y recomendaciones prácticas']);
});
test('explanatory sentences after an enumeration become notes, not bullets', () => {
  const text = 'Incluye: impulsos, tráfico o conversiones según el objetivo. Este valor lo paga el cliente a la plataforma. Brain Studio no factura este valor, salvo acuerdo explícito.';
  assert.equal(formatCatalogDescription(text), 'Incluye:\n- Impulsos\n- Tráfico o conversiones según el objetivo\nEste valor lo paga el cliente a la plataforma.\nBrain Studio no factura este valor, salvo acuerdo explícito.');
  assert.equal(formatCatalogDescription(formatCatalogDescription(text)), formatCatalogDescription(text));
});
test('free text without labels is kept as paragraphs and never invented into lists', () => {
  assert.equal(formatCatalogDescription('Diseño de logo con tres propuestas.\nEntrega en una semana.'), 'Diseño de logo con tres propuestas.\nEntrega en una semana.');
  assert.equal(formatCatalogDescription(''), '');
  assert.equal(formatCatalogDescription(null), '');
  assert.deepEqual(parseCatalogDescription('Concepto: a, b y c.')[0], { label: 'Concepto', text: 'a, b y c.', items: [], notes: [] });
});
test('the HTML form survives the proposal sanitizer and renders bold labels with bullet blocks', () => {
  const html = catalogDescriptionToHtml(running);
  assert.equal(html, sanitizeProposalHtml(html));
  assert.match(html, /^<p><strong>Concepto:<\/strong> evaluación/);
  assert.match(html, /<p><strong>Incluye:<\/strong><\/p><ul><li>Revisión de logotipo<\/li>/);
  const blocks = proposalRichTextBlocks(html);
  assert.equal(blocks[0].runs[0].bold, true);
  assert.equal(blocks.filter(block => block.bullet).length, 9);
  assert.match(catalogDescriptionToHtml('Incluye: <script>, 2 & 3 y fin'), /&lt;script&gt;/);
});
test('editor HTML round-trips to the stored plain form and back without losing bullets or labels', () => {
  const html = catalogDescriptionToHtml(formatted);
  assert.equal(proposalHtmlToCatalogText(html), formatted);
  assert.equal(proposalHtmlToCatalogText('<p><strong>Incluye:</strong></p><ul><li><p>Diseño  de <em>logo</em></p></li><li><p>Entrega</p></li></ul><p>Nota final.</p>'), 'Incluye:\n- Diseño de logo\n- Entrega\nNota final.');
});
test('the catalog modal input keeps the rich version and derives the plain text from it', () => {
  const rich = resolveCatalogDescriptionInput({ descriptionHtml: '<p><strong>Incluye:</strong></p><ul><li>Logo <u>final</u></li></ul><script>alert(1)</script>' });
  assert.equal(rich.description, 'Incluye:\n- Logo final');
  assert.equal(rich.description_html, '<p><strong>Incluye:</strong></p><ul><li>Logo <u>final</u></li></ul>');
  assert.deepEqual(resolveCatalogDescriptionInput({ descriptionHtml: '<p></p>' }), { description: '', description_html: null });
  assert.deepEqual(resolveCatalogDescriptionInput({ description: 'Incluye: a, b y c.' }), { description: 'Incluye:\n- A\n- B\n- C', description_html: null });
  assert.deepEqual(resolveCatalogDescriptionInput({}), {});
  assert.throws(() => resolveCatalogDescriptionInput({ descriptionHtml: 'x'.repeat(20001) }), error => error.statusCode === 400);
});
test('a quotation item starts from the rich version when the service has one, otherwise from the rendered text', () => {
  assert.equal(catalogServiceHtml({ description: 'Incluye:\n- A', descriptionHtml: '<p><em>Propio</em></p>' }), '<p><em>Propio</em></p>');
  assert.equal(catalogServiceHtml({ description: 'Incluye:\n- A', descriptionHtml: null }), '<p><strong>Incluye:</strong></p><ul><li>A</li></ul>');
});
test('the script rewrites the catalog JSON in place and reports how many changed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-format-'));
  const file = path.join(dir, 'catalog.json');
  fs.writeFileSync(file, JSON.stringify([{ name: 'Auditoría', description: running }, { name: 'Curada', description: formatted }]));
  assert.deepEqual(formatCatalogFile(file), { total: 2, changed: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).map(row => row.description), [formatted, formatted]);
  assert.deepEqual(formatCatalogFile(file), { total: 2, changed: 0 });
});
test('the script prefers the curated JSON text, formats the rest, and writes nothing on a dry run', async () => {
  const rows = [
    { id: '1', name: 'Auditoría De Marca', description: running },
    { id: '2', name: 'Propio', description: 'Incluye: a, b y c.' },
    { id: '3', name: 'Listo', description: formatted }
  ];
  const writes = [];
  const database = {
    serviceCatalog: { findMany: async () => rows, update: async (args) => { writes.push(args); } },
    $transaction: async (run) => run(database)
  };
  // Stored names are title-cased; the JSON keeps sentence case and legacy names still match.
  const catalog = [{ name: 'Auditoría de marca', description: 'Concepto: versión curada.\nIncluye:\n- Solo esto' }];
  const dry = await formatStoredCatalogDescriptions(database, { dryRun: true, catalog });
  assert.equal(writes.length, 0);
  assert.deepEqual(dry.changes.map(change => [change.name, change.after]), [
    ['Auditoría De Marca', 'Concepto: versión curada.\nIncluye:\n- Solo esto'],
    ['Propio', 'Incluye:\n- A\n- B\n- C']
  ]);
  const applied = await formatStoredCatalogDescriptions(database, { catalog });
  assert.equal(applied.updated, 2);
  assert.deepEqual(writes.map(write => write.where.id), ['1', '2']);
});
