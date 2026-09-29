import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const dashboard = read('../src/components/modules/FinancialDashboard.jsx');

// Rodny, 29 de septiembre de 2026: «¿estos comentarios se guardan? ¿no corren riesgo de borrarse?»
test('the follow-up note of a debt is kept in state, saved as the person types and never silently lost', () => {
    // Controlled, not defaultValue: collapsing the client or a refetch cannot wipe what was typed.
    assert.doesNotMatch(dashboard, /<textarea\s+defaultValue=\{debt\.comments/);
    assert.match(dashboard, /value=\{receivableNoteValue\(debt\)\}/);
    // Saved on its own shortly after the last keystroke and again on blur, so closing the tab or an expired session loses seconds, not the note.
    assert.match(dashboard, /RECEIVABLE_NOTE_AUTOSAVE_MS = 1500/);
    assert.match(dashboard, /scheduleReceivableNoteSave\(/);
    assert.match(dashboard, /onBlur=\{\(\) => flushReceivableNote\(debt\)\}/);
    // A failed save keeps the text in the box and offers a retry, instead of a global error that scrolls away.
    assert.match(dashboard, /No se guardó el comentario/);
    assert.match(dashboard, /Reintentar/);
    assert.match(dashboard, /data-receivable-note-status/);
    // The quiet autosave does not spam «Cartera actualizada.» on every pause.
    assert.match(dashboard, /handleReceivableUpdate\(debt, \{ comments: text \}, \{ quiet: true \}\)/);
});

test('the original amount of a debt can be corrected from its card, except once the account was issued', () => {
    assert.match(dashboard, /Editar valor/);
    assert.match(dashboard, /data-receivable-amount-editor/);
    assert.match(dashboard, /handleReceivableUpdate\(debt, \{ amount: Number\(amountDraft\) \}\)/);
    // An issued account is frozen: the control explains instead of opening an editor the server will refuse.
    assert.match(dashboard, /debt\.formattedNumber[^]*?no se reedita/);
    assert.match(read('../src/services/financialReceivableService.js'), /RECEIVABLE_ISSUED_IMMUTABLE/);
});
