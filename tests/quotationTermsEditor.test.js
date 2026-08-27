import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('quotation form exposes applied terms and sends the reviewed snapshot', async () => {
  const [form, editor, controller] = await Promise.all([
    readFile(new URL('../src/components/modules/Quotations/QuotationForm.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/modules/Quotations/QuotationTermsEditor.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/quotationController.js', import.meta.url), 'utf8')
  ]);

  assert.match(form, /<QuotationTermsEditor/);
  assert.match(form, /terms_and_conditions:\s*contractTermsText/);
  assert.match(editor, /Términos aplicados/);
  assert.match(editor, /Recalcular automáticamente/);
  assert.match(editor, /Añadir desde la biblioteca/);
  assert.match(editor, /Cláusula personalizada/);
  assert.match(controller, /hasExplicitTerms/);
  assert.match(controller, /sanitizeContractTermsText\(terms_and_conditions\)/);
  assert.match(controller, /:\s*existing\.terms_and_conditions/);
});
