import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFParse } from 'pdf-parse';

import {
  generateQuotationPdfBuffer,
  PDF_LAYOUT,
  splitServiceTime,
  splitTermColumns,
  splitTerms
} from '../src/services/quotationPdfService.js';

const quotation = {
  consecutive: 42,
  emisor_type: 'BRAIN_STUDIO',
  currency: 'COP',
  created_at: new Date('2026-08-26T12:00:00.000Z'),
  expires_at: new Date('2026-09-10T12:00:00.000Z'),
  client_name: 'María Cliente',
  client_company: 'Compañía Ejemplo',
  client_email: 'maria@example.com',
  client_phone: '+57 300 000 0000',
  subtotal: 2500000,
  tax_amount: 475000,
  total_amount: 2975000,
  is_tax_exempt: false,
  items: [{
    name: 'Estrategia digital',
    description: 'Diagnóstico, hoja de ruta y acompañamiento de implementación.',
    note: 'Incluye una sesión adicional con el equipo comercial.',
    quantity: 1,
    price: 2500000
  }],
  terms_and_conditions: Array.from(
    { length: 18 },
    (_, index) => `● Condición contractual ${index + 1} con alcance y responsabilidades claramente definidos.`
  ).join('\n')
};

const issuer = {
  razonSocial: 'BRAIN STUDIO AGENCIA CREATIVA S.A.S',
  nit: '901533409',
  email: 'social.brainstudio@gmail.com',
  whatsapp: '+57 300 4329276'
};

test('quotation PDF preserves service descriptions, notes and all contractual terms', async () => {
  const buffer = generateQuotationPdfBuffer(quotation, issuer);
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 10000);

  const parser = new PDFParse({ data: buffer });
  const { text, total: totalPages } = await parser.getText();
  await parser.destroy();

  assert.match(text, /Diagnóstico, hoja de ruta/);
  assert.match(text, /Incluye una sesión adicional/);
  assert.match(text, /Condición contractual 1/);
  assert.match(text, /Condición contractual\s+18/);
  assert.ok(totalPages >= 2, 'long terms should continue onto another page');
  assert.ok(totalPages <= 2, 'compact two-column terms should avoid an unnecessary third page');
});

test('quotation PDF splits contractual terms evenly by count', () => {
  assert.deepEqual(splitTermColumns(Array.from({ length: 9 }, (_, index) => index)).map((column) => column.length), [4, 5]);
  assert.deepEqual(splitTermColumns(Array.from({ length: 10 }, (_, index) => index)).map((column) => column.length), [5, 5]);
  assert.deepEqual(splitTermColumns(Array.from({ length: 13 }, (_, index) => index)).map((column) => column.length), [6, 7]);
});

test('quotation PDF removes repeated contractual clauses before rendering', () => {
  assert.deepEqual(
    splitTerms('● Una condición.\n•  Una   condición.  \n● Otra condición.'),
    ['Una condición.', 'Otra condición.']
  );
});

test('scenario quotation PDF compares options without inventing a grand total', async () => {
  const scenarioQuotation = {
    ...quotation,
    subtotal: 0,
    tax_amount: 0,
    total_amount: 0,
    items: [
      { name: 'Plan básico', description: 'Seis contenidos.', quantity: 1, price: 1000000, scenarioId: 'a', scenarioName: 'Reactivación básica', scenarioOrder: 0, scenarioExternalBudget: 400000, scenarioExternalBudgetNote: 'Pago directo a Meta.' },
      { name: 'Plan activo', description: 'Ocho contenidos.', quantity: 1, price: 1300000, scenarioId: 'b', scenarioName: 'Presencia activa', scenarioOrder: 1 }
    ]
  };
  const parser = new PDFParse({ data: generateQuotationPdfBuffer(scenarioQuotation, issuer) });
  const { text } = await parser.getText();
  await parser.destroy();

  assert.match(text, /ESCENARIOS DISPONIBLES/i);
  assert.match(text, /Reactivación básica/);
  assert.match(text, /Presencia activa/);
  assert.doesNotMatch(text, /SELECCIÓN PENDIENTE/i);
  assert.doesNotMatch(text, /El cliente elegirá una opción/i);
  assert.doesNotMatch(text, /INVERSIÓN TOTAL\s+\$\s*0/i);
});

test('quotation PDF separates service time so its label can be emphasized', () => {
  assert.deepEqual(
    splitServiceTime('Alcance completo. Tiempo de servicio: 15 días.'),
    { body: 'Alcance completo.', serviceTime: '15 días.' }
  );
});

test('quotation PDF reserves space between descriptions and right-aligned commercial metadata', () => {
  assert.equal(PDF_LAYOUT.serviceDescriptionWidth, 112);
  assert.equal(PDF_LAYOUT.rightEdge, 192);
});

test('quotation PDF limits long service titles to two lines without invading commercial metadata', async () => {
  const pdf = await import('../src/services/quotationPdfService.js');
  assert.equal(typeof pdf.limitServiceTitleLines, 'function');
  assert.deepEqual(
    pdf.limitServiceTitleLines(['Evolución Integral De Identidad', 'Visual Y Aplicaciones De Marca']),
    ['Evolución Integral De Identidad', 'Visual Y Aplicaciones De Marca']
  );
  assert.deepEqual(
    pdf.limitServiceTitleLines(['Primera línea', 'Segunda línea', 'Tercera línea']),
    ['Primera línea', 'Segunda línea…']
  );
  assert.ok(PDF_LAYOUT.serviceTitleWidth < PDF_LAYOUT.serviceDescriptionWidth);
});

test('quotation PDF renders discount labels as highlighted commercial rows', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(
    new URL('../src/services/quotationPdfService.js', import.meta.url),
    'utf8'
  ));

  assert.match(source, /isDiscount/);
  assert.match(source, /COLORS\.discount/);
  assert.match(source, /COLORS\.discountSoft/);
});

test('quotation PDF explains monthly, one-time and discounted contractual totals', async () => {
  const commercialQuotation = {
    ...quotation,
    duration_months: 3,
    discount_type: 'PERCENTAGE',
    discount_value: 10,
    discount_label: 'Descuento de lanzamiento',
    discount_amount: 350000,
    subtotal: 3150000,
    tax_amount: 598500,
    total_amount: 3748500,
    items: [
      { name: 'Acompañamiento', description: 'Gestión continua.', quantity: 1, price: 1000000, billingType: 'MONTHLY' },
      { name: 'Configuración inicial', description: 'Implementación.', quantity: 1, price: 500000, billingType: 'ONE_TIME' }
    ]
  };
  const parser = new PDFParse({ data: generateQuotationPdfBuffer(commercialQuotation, issuer) });
  const { text } = await parser.getText();
  await parser.destroy();

  assert.match(text, /3 meses/i);
  assert.match(text, /mensual/i);
  assert.match(text, /pago [uú]nico/i);
  assert.match(text, /Descuento de lanzamiento/i);
  assert.match(text, /Subtotal contractual/i);
});

test('scenario PDF shows each discounted three-month option independently', async () => {
  const scenarioQuotation = {
    ...quotation,
    duration_months: 3,
    subtotal: 0,
    tax_amount: 0,
    total_amount: 0,
    items: [
      { name: 'Plan A', quantity: 1, price: 1000000, billingType: 'MONTHLY', scenarioId: 'a', scenarioName: 'Base', scenarioOrder: 0, scenarioDiscountType: 'PERCENTAGE', scenarioDiscountValue: 10, scenarioDiscountLabel: 'Lanzamiento' },
      { name: 'Plan B', quantity: 1, price: 1500000, billingType: 'MONTHLY', scenarioId: 'b', scenarioName: 'Pro', scenarioOrder: 1, scenarioDiscountType: 'FIXED', scenarioDiscountValue: 200000, scenarioDiscountLabel: 'Beneficio comercial' }
    ]
  };
  const parser = new PDFParse({ data: generateQuotationPdfBuffer(scenarioQuotation, issuer) });
  const { text } = await parser.getText();
  await parser.destroy();

  assert.match(text, /Lanzamiento/);
  assert.match(text, /Beneficio comercial/);
  assert.match(text, /3 meses/i);
  assert.doesNotMatch(text, /INVERSIÓN TOTAL\s+\$\s*0/i);
});
