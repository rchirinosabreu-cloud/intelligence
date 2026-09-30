import test from 'node:test';
import assert from 'node:assert/strict';
import { isReceivableConceptHtml, receivableConceptToHtml } from '../src/lib/receivableDocument.js';
import { normalizeReceivableConcept } from '../src/services/receivableDocumentService.js';

// El concepto de una cuenta de cobro se escribe con la barra de formato de la plataforma
// (Rodny, 30 de septiembre de 2026). Las cuentas anteriores lo guardaron en texto plano,
// con un guion al comienzo de cada viñeta.

test('distingue el concepto con formato del texto plano de antes', () => {
    assert.equal(isReceivableConceptHtml('<p>Hola</p>'), true);
    assert.equal(isReceivableConceptHtml('<h2>Título</h2><ul><li>x</li></ul>'), true);
    assert.equal(isReceivableConceptHtml('Prestación de servicios <3 para la marca'), false);
    assert.equal(isReceivableConceptHtml('- Planeación'), false);
    assert.equal(isReceivableConceptHtml(null), false);
});

test('un concepto viejo abre en el editor con sus viñetas como lista de verdad', () => {
    const html = receivableConceptToHtml('Este servicio incluye:\n- Planeación mensual\n- 4 historias\n\nCierre del mes');
    assert.equal(html, '<p>Este servicio incluye:</p><ul><li><p>Planeación mensual</p></li><li><p>4 historias</p></li></ul><p>Cierre del mes</p>');
});

test('el texto plano se escapa al pasarlo a formato', () => {
    assert.equal(receivableConceptToHtml('A <b>y</b> & B'), '<p>A &lt;b&gt;y&lt;/b&gt; &amp; B</p>');
});

test('un concepto que ya tiene formato no se toca al abrirlo', () => {
    const html = '<h2>Plan</h2><p><strong>Incluye</strong></p>';
    assert.equal(receivableConceptToHtml(html), html);
});

test('al guardar se limpia el formato: sin código, sin enlaces, sin resaltado', () => {
    const clean = normalizeReceivableConcept('<h2>Plan</h2><p onclick="x()"><strong>Incluye</strong> <mark>esto</mark> <a href="https://x.co">aquí</a><script>alert(1)</script></p><ol><li><p>Uno</p></li></ol>');
    assert.match(clean, /^<h2>Plan<\/h2>/);
    assert.match(clean, /<strong>Incluye<\/strong>/);
    assert.match(clean, /<ol><li><p>Uno<\/p><\/li><\/ol>/);
    assert.doesNotMatch(clean, /script|alert|onclick|<a|<mark|href/);
    assert.match(clean, /esto/);
    assert.match(clean, /aquí/);
});

test('un concepto con formato pero vacío se rechaza como un concepto vacío', () => {
    assert.throws(() => normalizeReceivableConcept('<p></p><p>  </p>'), (error) => error.code === 'RECEIVABLE_CONCEPT_REQUIRED');
    assert.throws(() => normalizeReceivableConcept('   '), (error) => error.code === 'RECEIVABLE_CONCEPT_REQUIRED');
});

test('el tope se mide sobre el texto que se lee, no sobre las etiquetas', () => {
    const long = `<p>${'a'.repeat(3990)}</p><ul><li><p>fin</p></li></ul>`;
    assert.ok(normalizeReceivableConcept(long).length > 4000);
    assert.throws(() => normalizeReceivableConcept(`<p>${'a'.repeat(4001)}</p>`), (error) => error.code === 'RECEIVABLE_CONCEPT_REQUIRED_TOO_LONG');
});

test('el texto plano de siempre se sigue aceptando tal cual', () => {
    assert.equal(normalizeReceivableConcept('  Servicios de septiembre\n- Parrilla  '), 'Servicios de septiembre\n- Parrilla');
});
