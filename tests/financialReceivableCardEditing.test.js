import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const dashboard = read('../src/components/modules/FinancialDashboard.jsx');

// Rodny, 30 de septiembre de 2026: «el comentario de seguimiento no debería aparecer aquí
// como editable sino como algo guardado, porque esto se guarda desde la sección de notas
// al registrar un pago».
test('the follow-up is read, not typed, on the card: it comes from the notes of each payment', () => {
    assert.doesNotMatch(dashboard, /placeholder="Comentario de seguimiento\.\.\."/);
    assert.doesNotMatch(dashboard, /scheduleReceivableNoteSave|receivableNoteValue|RECEIVABLE_NOTE_AUTOSAVE_MS/);
    // Each payment shows what was written in «Notas» when it was registered.
    assert.match(dashboard, /payment\.notes && <p data-receivable-payment-note/);
    // A comment the debt already had is still shown, read only.
    assert.match(dashboard, /\(debt\.comments \|\| debt\.notes\) && \([^]*?data-receivable-saved-comment/);
    // The payment form keeps its «Notas» field: that is where the follow-up is written now.
    assert.match(dashboard, /paymentForm[^]*?notes/);
});

test('the original amount of a debt can be corrected from its card', () => {
    assert.match(dashboard, /Editar valor/);
    assert.match(dashboard, /data-receivable-amount-editor/);
    assert.match(dashboard, /handleReceivableUpdate\(debt, \{ amount: Number\(amountDraft\) \}\)/);
    assert.doesNotMatch(dashboard, /no se reedita/, 'an issued account is corrected, not frozen (Rodny, 30 de septiembre de 2026)');
});

// Rodny, 30 de septiembre de 2026: «aunque la cta de cobro haya sido emitida, necesito
// que se pueda aún editar nuevamente y que eso remodifique el pdf».
test('an issued account opens the same form in correction mode and rebuilds its PDF', () => {
    // Both the pencil on the amount and a «Corregir» button next to «Ver PDF» open it.
    assert.match(dashboard, /const openCorrectDialog = \(debt\) =>/);
    assert.match(dashboard, /debt\.formattedNumber\s*\?[^]*?onClick=\{\(\) => openCorrectDialog\(debt\)\}/);
    assert.match(dashboard, /data-receivable-correct/);
    // Prefilled with what the account already says, not with the defaults of a new one.
    assert.match(dashboard, /concept: receivableConceptToHtml\(debt\.concept \|\| RECEIVABLE_CONCEPT_DEFAULT\)/);
    assert.match(dashboard, /servicePeriod: debt\.servicePeriod \|\| ''/);
    assert.match(dashboard, /debt\.items\?\.length/);
    // Same dialog, different endpoint: PUT on the document, never a second «issue».
    assert.match(dashboard, /axios\.put\(`\$\{baseUrl\}\/api\/financials\/receivables\/\$\{debtToIssue\.id\}\/document`/);
    assert.match(dashboard, /Corregir cuenta de cobro/);
    assert.match(dashboard, /Guardar y rehacer PDF/);
    // Identity is only asked when issuing; a correction never rewrites the client file.
    assert.match(dashboard, /const issueNeedsIdentity = !isCorrecting && /);
});

// Rodny, 30 de septiembre de 2026: «en concepto añadas la barra de formato que hemos
// estado trabajando, para poder poner viñetas, títulos, negrillas».
test('the concept is written with the shared formatting bar, without what the PDF cannot draw', () => {
    assert.match(dashboard, /import RichTextEditor from '@\/components\/ui\/RichTextEditor'/);
    assert.match(dashboard, /data-receivable-concept-editor[^]*?<RichTextEditor[^]*?toolbarAlwaysVisible[^]*?allowHighlight=\{false\}/);
    assert.doesNotMatch(dashboard, /<textarea required rows=\{6\} maxLength=\{4000\} value=\{issueForm\.concept\}/);
    // A new account starts from the usual paragraph, already as formatted text.
    assert.match(dashboard, /concept: receivableConceptToHtml\(RECEIVABLE_CONCEPT_DEFAULT\)/);
    const editor = read('../src/components/ui/RichTextEditor.jsx');
    assert.match(editor, /allowHighlight = true/);
    assert.match(editor, /\{allowHighlight && <button type="button" aria-label="Resaltado"/);
});
