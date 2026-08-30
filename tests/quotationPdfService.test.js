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

test('quotation PDF keeps descriptions visible when a service moves to a new page', async () => {
  const pdf = await import('../src/services/quotationPdfService.js');
  assert.equal(typeof pdf.getServiceTextLayout, 'function');
  assert.deepEqual(
    pdf.getServiceTextLayout(18, 2),
    { descriptionY: 40.5, extraTitleHeight: 5 }
  );

  const pageBreakQuotation = {
    ...quotation,
    items: [
      {
        name: 'Servicio Inicial Extenso',
        description: Array.from({ length: 34 }, () => 'Alcance detallado del primer servicio.').join(' '),
        quantity: 1,
        price: 1000000,
        billingType: 'ONE_TIME'
      },
      {
        name: 'Marketing Estándar – 12 Contenidos',
        description: 'DESCRIPCIÓN VISIBLE DESPUÉS DEL SALTO DE PÁGINA.',
        quantity: 1,
        price: 1580600,
        billingType: 'MONTHLY'
      }
    ]
  };
  const parser = new PDFParse({ data: generateQuotationPdfBuffer(pageBreakQuotation, issuer) });
  const { text } = await parser.getText();
  await parser.destroy();

  assert.match(text, /DESCRIPCIÓN VISIBLE DESPUÉS DEL SALTO DE PÁGINA/);
});

test('quotation PDF calculates compact service cards from the rendered line height', async () => {
  const pdf = await import('../src/services/quotationPdfService.js');
  assert.equal(typeof pdf.calculateServiceCardHeight, 'function');
  assert.equal(pdf.calculateServiceCardHeight({ titleLineCount: 1, descriptionLineCount: 0 }), 25);
  assert.equal(pdf.calculateServiceCardHeight({ titleLineCount: 1, descriptionLineCount: 10 }), 53.5);
  assert.equal(pdf.calculateServiceCardHeight({ titleLineCount: 2, descriptionLineCount: 15 }), 76);
});

test('quotation PDF starts every later scenario on a clean page with its first service', async () => {
  const scenarioQuotation = {
    ...quotation,
    subtotal: 0,
    tax_amount: 0,
    total_amount: 0,
    items: [
      { name: 'Servicio Web Principal', description: 'Alcance del primer escenario.', quantity: 1, price: 2400000, scenarioId: 'one', scenarioName: 'Escenario Editorial Uno', scenarioOrder: 0 },
      { name: 'Primer Servicio Del Segundo Escenario', description: 'Alcance del segundo escenario.', quantity: 1, price: 1580600, scenarioId: 'two', scenarioName: 'Escenario Editorial Dos', scenarioOrder: 1 }
    ]
  };
  const parser = new PDFParse({ data: generateQuotationPdfBuffer(scenarioQuotation, issuer) });
  const result = await parser.getText();
  await parser.destroy();

  const firstHeadingPage = result.pages.find(({ text }) => text.includes('Escenario Editorial Uno'))?.num;
  const headingPage = result.pages.find(({ text }) => text.includes('Escenario Editorial Dos'))?.num;
  const firstServicePage = result.pages.find(({ text }) => text.includes('Primer Servicio Del Segundo Escenario'))?.num;
  assert.ok(headingPage, 'the second scenario heading must be rendered');
  assert.ok(headingPage > firstHeadingPage, 'the second scenario must start on a clean page');
  assert.equal(headingPage, firstServicePage, 'the scenario heading cannot be orphaned from its first service');
});

test('quotation PDF renders discount labels as highlighted commercial rows', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(
    new URL('../src/services/quotationPdfService.js', import.meta.url),
    'utf8'
  ));

  assert.match(source, /isDiscount/);
  assert.match(source, /COLORS\.discount/);
  assert.match(source, /COLORS\.discountSoft/);
  assert.doesNotMatch(source, /doc\.line\(PAGE\.left, y - 2\.5, PDF_LAYOUT\.rightEdge, y - 2\.5\)/);
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
  assert.match(text, /Valor antes del descuento/i);
  assert.match(text, /Valor final con descuento/i);
  assert.doesNotMatch(text, /Subtotal contractual/i);
  assert.ok(text.indexOf('Inversión mensual') < text.indexOf('Valor antes del descuento'));
  assert.ok(text.indexOf('Valor antes del descuento') < text.indexOf('AHORRO · Descuento de lanzamiento'));
  assert.ok(text.indexOf('AHORRO · Descuento de lanzamiento') < text.indexOf('VALOR FINAL CON DESCUENTO'));
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
