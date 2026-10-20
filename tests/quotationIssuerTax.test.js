import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  quotationTaxExemptionReason,
  resolveQuotationTaxExemption
} from '../src/services/quotationDomainService.js';

// Elisa, reunión «Actualizaciones Plataforma» (20 de octubre de 2026): «cuando uno entra a hacer
// las cotizaciones y pone a nombre de Francisco, ahí no debería aparecer la opción de IVA … el IVA
// solamente es para el tema de Brain». Francisco Villa emite como persona natural: la cotización
// sale exenta siempre, y el interruptor de IVA no se dibuja con él como emisor.

test('con Francisco Villa como emisor la cotización es exenta aunque alguien marque IVA', () => {
  assert.equal(resolveQuotationTaxExemption({ currency: 'COP', emisorType: 'FRANCISCO_VILLA', clientType: 'EMPRESA', manualTaxExempt: false }), true);
  assert.equal(resolveQuotationTaxExemption({ currency: 'COP', emisorType: 'FRANCISCO_VILLA', clientType: 'EMPRESA' }), true);
  assert.equal(resolveQuotationTaxExemption({ currency: 'COP', emisorType: 'FRANCISCO_VILLA', clientType: 'PERSONA_NATURAL', manualTaxExempt: false }), true);
});

test('con Brain Studio como emisor el IVA sigue siendo decisión de quien cotiza', () => {
  assert.equal(resolveQuotationTaxExemption({ currency: 'COP', emisorType: 'BRAIN_STUDIO', clientType: 'EMPRESA', manualTaxExempt: false }), false);
  assert.equal(resolveQuotationTaxExemption({ currency: 'COP', emisorType: 'BRAIN_STUDIO', clientType: 'EMPRESA', manualTaxExempt: true }), true);
  assert.equal(resolveQuotationTaxExemption({ currency: 'COP', emisorType: 'BRAIN_STUDIO', clientType: 'EMPRESA' }), false, 'empresa sin decisión: aplica IVA');
  assert.equal(resolveQuotationTaxExemption({ currency: 'COP', emisorType: 'BRAIN_STUDIO', clientType: 'PERSONA_NATURAL' }), true, 'persona natural sin decisión: exenta');
  assert.equal(resolveQuotationTaxExemption({ currency: 'COP', emisorType: 'BRAIN_STUDIO', clientType: 'PERSONA_NATURAL', manualTaxExempt: false }), false, 'persona natural con IVA marcado a mano: se respeta');
});

test('la razón por la que el IVA no se puede tocar es una sola, y la comparten pantalla y servidor', () => {
  assert.equal(quotationTaxExemptionReason({ currency: 'USD', emisorType: 'BRAIN_STUDIO' }), 'USD');
  assert.equal(quotationTaxExemptionReason({ currency: 'COP', emisorType: 'FRANCISCO_VILLA' }), 'ISSUER');
  assert.equal(quotationTaxExemptionReason({ currency: 'USD', emisorType: 'FRANCISCO_VILLA' }), 'USD', 'en dólares la razón es la moneda, que ya quita el IVA del PDF');
  assert.equal(quotationTaxExemptionReason({ currency: 'COP', emisorType: 'BRAIN_STUDIO' }), null);
});

test('el formulario no dibuja el interruptor de IVA cuando el emisor es Francisco Villa', () => {
  const form = fs.readFileSync(new URL('../src/components/modules/Quotations/QuotationForm.jsx', import.meta.url), 'utf8');
  assert.match(form, /quotationTaxExemptionReason\(/, 'la pantalla lee la misma regla que el servidor');
  assert.doesNotMatch(form, /currency === 'USD' \|\| isTaxExempt/, 'la exención efectiva se calcula una vez, no en cada uso');
  assert.doesNotMatch(form, /is_tax_exempt: currency === 'USD' \? true : isTaxExempt/, 'lo que viaja al servidor es la exención efectiva');
  assert.match(form, /data-quotation-tax-locked/, 'con el IVA bloqueado se dice por qué, en vez de un interruptor');
  assert.match(form, /Francisco Villa emite como persona natural/, 'el motivo se dice con palabras');
  assert.doesNotMatch(form, /<option value="EMPRESA">Para Empresa \(Aplica IVA 19%\)<\/option>/, 'la ayuda del IVA en «Tipo de propuesta» depende del emisor');
});
