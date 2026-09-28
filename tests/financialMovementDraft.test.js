import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    MOVEMENT_DRAFT_VERSION,
    buildMovementDraft,
    clearMovementDraft,
    draftMatchesRecord,
    hasMeaningfulMovementDraft,
    movementDraftKey,
    readMovementDraft,
    writeMovementDraft
} from '../src/lib/financialMovementDraft.js';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const fakeStorage = () => {
    const map = new Map();
    return { getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), map };
};
const emptyForm = { type: 'EXPENSE', amount: '', date: '2026-09-28', category: 'OPERATIVO', scenario: 'ACTUAL', description: '', clientId: '', counterparty: '', reference: '', notes: '', accountId: '' };

test('a draft is meaningful only when the person wrote something: defaults alone are not a draft', () => {
    assert.equal(hasMeaningfulMovementDraft(buildMovementDraft({ form: emptyForm, allocations: [], pendingFiles: [], record: null })), false);
    // Changing the type, date, category or scenario is still just defaults: nothing to recover.
    assert.equal(hasMeaningfulMovementDraft(buildMovementDraft({ form: { ...emptyForm, type: 'INCOME', date: '2026-01-01', category: 'PAUTA', scenario: 'BUDGET' }, allocations: [], pendingFiles: [], record: null })), false);
    for (const field of ['amount', 'description', 'counterparty', 'reference', 'notes', 'clientId', 'accountId']) {
        assert.equal(hasMeaningfulMovementDraft(buildMovementDraft({ form: { ...emptyForm, [field]: 'x' }, allocations: [], pendingFiles: [], record: null })), true, field);
    }
    assert.equal(hasMeaningfulMovementDraft(buildMovementDraft({ form: { ...emptyForm, amount: '   ' }, allocations: [], pendingFiles: [], record: null })), false);
    assert.equal(hasMeaningfulMovementDraft(buildMovementDraft({ form: emptyForm, allocations: [{ amount: '1', category: 'OPERATIVO', description: 'x' }], pendingFiles: [], record: null })), true);
    assert.equal(hasMeaningfulMovementDraft(null), false);
    assert.equal(hasMeaningfulMovementDraft({ version: 99 }), false);
});

test('the draft carries the form, the breakdown, the edit target and only the names of pending files', () => {
    const file = { name: 'Factura.pdf', size: 1234, arrayBuffer: () => {} };
    const record = { id: 'rec-1', updatedAt: '2026-09-28T10:00:00.000Z', description: 'Préstamo' };
    const draft = buildMovementDraft({ form: { ...emptyForm, amount: '600000', description: 'IA' }, allocations: [{ amount: '600000', category: 'OPERATIVO', description: 'Claude' }], pendingFiles: [file], record, now: new Date('2026-09-28T12:00:00Z') });
    assert.equal(draft.version, MOVEMENT_DRAFT_VERSION);
    assert.equal(draft.mode, 'edit');
    assert.equal(draft.recordId, 'rec-1');
    assert.equal(draft.recordUpdatedAt, record.updatedAt);
    assert.equal(draft.recordLabel, 'Préstamo');
    assert.equal(draft.savedAt, '2026-09-28T12:00:00.000Z');
    assert.deepEqual(draft.pendingFileNames, [{ name: 'Factura.pdf', size: 1234 }]);
    assert.ok(!('arrayBuffer' in draft.pendingFileNames[0]), 'File objects never go to storage');
    assert.deepEqual(draft.form, { ...emptyForm, amount: '600000', description: 'IA' });
    assert.deepEqual(draft.allocations, [{ amount: '600000', category: 'OPERATIVO', description: 'Claude' }]);
    const created = buildMovementDraft({ form: emptyForm, allocations: [], pendingFiles: [], record: null });
    assert.equal(created.mode, 'create');
    assert.equal(created.recordId, null);
    // JSON round trip keeps it intact.
    assert.deepEqual(JSON.parse(JSON.stringify(draft)), draft);
});

test('drafts are stored per person, survive a reload, and a corrupt entry is dropped instead of crashing', () => {
    const storage = fakeStorage();
    assert.equal(movementDraftKey('user-1'), 'brain.financial.movementDraft.v1.user-1');
    assert.notEqual(movementDraftKey('user-1'), movementDraftKey('user-2'));
    assert.equal(readMovementDraft(storage, 'user-1'), null);
    const draft = buildMovementDraft({ form: { ...emptyForm, amount: '10' }, allocations: [], pendingFiles: [], record: null });
    writeMovementDraft(storage, 'user-1', draft);
    assert.deepEqual(readMovementDraft(storage, 'user-1'), draft);
    assert.equal(readMovementDraft(storage, 'user-2'), null, 'another person never sees it');
    // A draft with nothing meaningful is not stored at all.
    writeMovementDraft(storage, 'user-1', buildMovementDraft({ form: emptyForm, allocations: [], pendingFiles: [], record: null }));
    assert.equal(readMovementDraft(storage, 'user-1'), null);
    storage.setItem(movementDraftKey('user-1'), '{not json');
    assert.equal(readMovementDraft(storage, 'user-1'), null);
    assert.equal(storage.map.has(movementDraftKey('user-1')), false, 'the corrupt entry is removed');
    storage.setItem(movementDraftKey('user-1'), JSON.stringify({ version: 0, form: { amount: '1' } }));
    assert.equal(readMovementDraft(storage, 'user-1'), null, 'an older version is ignored');
    writeMovementDraft(storage, 'user-1', draft);
    clearMovementDraft(storage, 'user-1');
    assert.equal(readMovementDraft(storage, 'user-1'), null);
    // A storage that throws (private mode, quota) never breaks the form.
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); } };
    assert.equal(readMovementDraft(broken, 'user-1'), null);
    assert.doesNotThrow(() => writeMovementDraft(broken, 'user-1', draft));
    assert.doesNotThrow(() => clearMovementDraft(broken, 'user-1'));
    assert.equal(readMovementDraft(null, 'user-1'), null);
});

test('an edit draft only applies to the same movement in the same version it was opened', () => {
    const record = { id: 'rec-1', updatedAt: '2026-09-28T10:00:00.000Z' };
    const draft = buildMovementDraft({ form: { ...emptyForm, amount: '5' }, allocations: [], pendingFiles: [], record });
    assert.equal(draftMatchesRecord(draft, record), true);
    assert.equal(draftMatchesRecord(draft, { ...record, updatedAt: '2026-09-28T11:00:00.000Z' }), false, 'someone else saved it meanwhile');
    assert.equal(draftMatchesRecord(draft, { id: 'rec-2', updatedAt: record.updatedAt }), false);
    assert.equal(draftMatchesRecord(buildMovementDraft({ form: { ...emptyForm, amount: '5' }, allocations: [], pendingFiles: [], record: null }), record), false);
    assert.equal(draftMatchesRecord(null, record), false);
});

test('the ledger autosaves the movement form, restores it, clears it only after the server confirmed, and shows the person it exists', () => {
    const ledger = read('../src/components/modules/financial/FinancialLedger.jsx');
    assert.match(ledger, /from '@\/lib\/financialMovementDraft'/);
    assert.match(ledger, /writeMovementDraft\(/);
    assert.match(ledger, /readMovementDraft\(/);
    // Cleared right after the confirmed save, before the dialog closes; never on cancel.
    assert.match(ledger, /await refreshFinancialData\(\);\s*clearMovementDraft\([^)]*\);\s*setIsEditorOpen\(false\);/);
    assert.match(ledger, /Borrador restaurado/);
    assert.match(ledger, /data-movement-draft-pill/);
    assert.match(ledger, /Descartar borrador/);
    assert.match(ledger, /Continuar/);
    assert.match(ledger, /Vuelve a adjuntar/, 'pending files cannot be persisted: the person is told which ones to attach again');
    assert.match(ledger, /draftHydratedRef/, 'the empty form never overwrites a stored draft while the dialog is opening');
});
