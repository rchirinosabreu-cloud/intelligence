import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFParse } from 'pdf-parse';

import {
  generateQuotationPdfBuffer,
  PDF_LAYOUT,
  splitServiceTime,
  splitTermColumns
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
