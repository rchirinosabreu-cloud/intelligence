import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFParse } from 'pdf-parse';
import { generateQuotationPdfBuffer } from '../src/services/quotationPdfService.js';
import { proposalDemo } from './fixtures/quotation-proposal-data.js';
const issuer = { razonSocial: 'Brainstudio · muestra local', nit: 'DEMO', email: 'demo@example.invalid', whatsapp: '0000000000' };
test('proposal PDF contains execution, all phases, installments and reference links without monthly zeroes', async () => {
  const buffer = generateQuotationPdfBuffer(proposalDemo, issuer);
  const reader = new PDFParse({ data: buffer });
  const { text } = await reader.getText(); await reader.destroy();
  for (const pattern of [/Sistema comercial/, /Desarrollo 2/, /Remisiones digitales/, /9.12 semanas/, /Etapas de implementación/, /Plan de pagos/, /8\.330\.000/, /4\.998\.000/, /3\.332\.000/, /Referencia ilustrativa/, /Licencias de terceros/]) assert.match(text, pattern);
  assert.doesNotMatch(text, /Inversión mensual/);
  assert.match(buffer.toString('latin1'), /https:\/\/example.com\//);
});
test('rich service content flows across pages without dropping the last paragraph', async () => {
  const data = { ...proposalDemo, items: [{ ...proposalDemo.items[0], descriptionHtml: '<p><strong>Inicio</strong></p>' + '<p>Descripción extensa con entregables y responsabilidades del proyecto.</p>'.repeat(110) + '<p>ÚLTIMO ENTREGABLE VERIFICADO</p>' }] };
  const reader = new PDFParse({ data: generateQuotationPdfBuffer(data, issuer) });
  const { text, total } = await reader.getText(); await reader.destroy();
  assert.match(text, /ÚLTIMO ENTREGABLE VERIFICADO/); assert.ok(total > 3);
});
test('a plain service longer than a page or with a long name flows across pages without cutting (27 de noviembre de 2026)', async () => {
  const name = 'Servicio con un nombre muy largo que describe el alcance completo del acompañamiento estratégico y creativo del cliente';
  const description = 'Entregable descrito en texto plano para el servicio. '.repeat(260) + 'CIERRE DEL SERVICIO';
  const data = { ...proposalDemo, proposal_details: null, items: [{ name, description, quantity: 1, price: 1000, billingType: 'ONE_TIME' }] };
  const reader = new PDFParse({ data: generateQuotationPdfBuffer(data, issuer) });
  const { text, total } = await reader.getText(); await reader.destroy();
  const flat = text.replace(/\s+/g, ' ');
  assert.match(flat, /CIERRE DEL SERVICIO/); assert.match(flat, /acompañamiento estratégico y creativo del cliente/); assert.ok(total > 2);
});
