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

// Rodny, 30 de septiembre de 2026: «emitir cuentas de cobro en dólares … yo escoger la
// moneda» y «en el financiero siempre registramos todo en pesos … usando el TRM oficial,
// sin embargo ese valor en pesos obviamente puede ser editado».
test('the document currency is chosen in the form, and a dollar account keeps a peso value in cartera', () => {
    // The same COP / USD switch as Cotizaciones, with the field border (Rodny, 30 de septiembre de 2026).
    assert.match(dashboard, /<CurrencyToggle bordered value=\{issueForm\.currency \|\| 'COP'\} onChange=\{setIssueCurrency\} ariaLabel="Moneda de la cuenta de cobro" \/>/);
    assert.match(read('../src/components/modules/Quotations/QuotationForm.jsx'), /<CurrencyToggle value=\{currency\} onChange=\{handleCurrencyChange\}/);
    assert.match(read('../src/components/ui/CurrencyToggle.jsx'), /bordered && 'border border-zinc-200 dark:border-white\/10'/);
    // Official TRM from Financiero's own route, editable by hand, with its origin shown.
    assert.match(dashboard, /\/api\/financials\/exchange-rate/);
    assert.match(dashboard, /aria-label="TRM para pasar a pesos"/);
    assert.match(dashboard, /exchangeRateSource: 'MANUAL'/);
    assert.match(dashboard, /Usar la TRM oficial/);
    // The peso value defaults to total × TRM and can be written by hand.
    assert.match(dashboard, /pesosFromRate\(issueTotal, issueForm\?\.exchangeRate\)/);
    assert.match(dashboard, /aria-label="Valor en pesos en cartera"/);
    assert.match(dashboard, /amountCopEdited: true/);
    // The payload is explicit: no stray form fields reach the server.
    assert.doesNotMatch(dashboard, /issue`, \{\s*\.\.\.issueForm/);
    assert.match(dashboard, /\.\.\.issueMoneyPayload\(\)/);
    // On the card, a dollar account shows its document in USD and its pencil edits the peso value.
    assert.match(dashboard, /data-receivable-usd-summary/);
    assert.match(dashboard, /debt\.formattedNumber && debt\.currency !== 'USD'/);
    const paymentDialog = read('../src/components/modules/financial/ReceivablePaymentDialog.jsx');
    assert.match(paymentDialog, /Registra los pesos que entraron/);
});

// Rodny, 30 de septiembre de 2026: «Cuenta de Cobro No. 0396 - Fundación Grit - Septiembre
// 2026». La pantalla nombra el archivo con la misma función que el servidor.
test('the downloaded PDF is named with number, client and month, like the server names it', () => {
    assert.match(dashboard, /const name = receivableDocumentFilename\(\{ number: debt\.number, clientName: debt\.clientName, period: debt\.period \}\)/);
    assert.match(read('../src/services/receivablePdfService.js'), /receivableDocumentFilename\(/);
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
