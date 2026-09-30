import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    RECEIVABLE_DRAFT_MAX_AGE_MS,
    MAX_RECEIVABLE_DRAFTS,
    clearReceivableDraft,
    readReceivableDraft,
    receivableDraftFingerprint,
    receivableDraftKey,
    receivableDraftSlot,
    saveReceivableDraft
} from '../src/lib/receivableDraft.js';

// Borrador de la cuenta de cobro (Rodny, 30 de septiembre de 2026: «estaba emitiendo una
// cuenta de cobro e hice click afuera, y se me borró todo»).

const memoryStorage = () => {
    const map = new Map();
    return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: (key) => map.delete(key),
        map
    };
};

const debt = { id: 'r1', number: null, issuedAt: null, amount: 1500000, currency: 'COP', concept: null, items: [] };
const baseline = { concept: '<p>Servicios</p>', servicePeriod: '', items: [{ description: '', amount: '1500000' }] };
const typed = { ...baseline, servicePeriod: 'Septiembre 2026', items: [{ description: 'Fee mensual', amount: '1500000' }] };

test('lo escrito se guarda por persona y por cuenta, y vuelve al reabrir', () => {
    const storage = memoryStorage();
    const slot = receivableDraftSlot('issue', 'r1');
    const fingerprint = receivableDraftFingerprint(debt);
    saveReceivableDraft(storage, 'u1', slot, { form: typed, baseline, fingerprint });
    assert.deepEqual(readReceivableDraft(storage, 'u1', slot, { fingerprint })?.form, typed);
    assert.equal(readReceivableDraft(storage, 'u2', slot, { fingerprint }), null, 'otra persona no ve el borrador');
    assert.equal(readReceivableDraft(storage, 'u1', receivableDraftSlot('issue', 'r2'), { fingerprint }), null, 'otra cuenta tampoco');
    assert.equal(receivableDraftSlot('new'), 'new');
    assert.ok(receivableDraftKey('u1').includes('u1'));
});

test('un formulario sin tocar no deja borrador, y volver al punto de partida lo borra', () => {
    const storage = memoryStorage();
    const slot = receivableDraftSlot('issue', 'r1');
    saveReceivableDraft(storage, 'u1', slot, { form: { ...baseline }, baseline });
    assert.equal(readReceivableDraft(storage, 'u1', slot), null);
    saveReceivableDraft(storage, 'u1', slot, { form: typed, baseline });
    saveReceivableDraft(storage, 'u1', slot, { form: { ...baseline }, baseline });
    assert.equal(readReceivableDraft(storage, 'u1', slot), null);
});

test('si la cuenta cambió desde que se escribió, el borrador ya no sirve y se descarta', () => {
    const storage = memoryStorage();
    const slot = receivableDraftSlot('correct', 'r1');
    saveReceivableDraft(storage, 'u1', slot, { form: typed, baseline, fingerprint: receivableDraftFingerprint(debt) });
    const corrected = { ...debt, number: 396, issuedAt: '2026-09-30T00:00:00.000Z', items: [{ description: 'Otro', amount: 10 }] };
    assert.equal(readReceivableDraft(storage, 'u1', slot, { fingerprint: receivableDraftFingerprint(corrected) }), null);
    assert.equal(readReceivableDraft(storage, 'u1', slot, { fingerprint: receivableDraftFingerprint(debt) }), null, 'se borró, no se esconde');
});

test('solo se limpia cuando se pide (tras el guardado confirmado), sin tocar los demás', () => {
    const storage = memoryStorage();
    saveReceivableDraft(storage, 'u1', 'new', { form: { amount: '5' }, baseline: { amount: '' } });
    saveReceivableDraft(storage, 'u1', 'issue:r1', { form: typed, baseline });
    clearReceivableDraft(storage, 'u1', 'new');
    assert.equal(readReceivableDraft(storage, 'u1', 'new'), null);
    assert.ok(readReceivableDraft(storage, 'u1', 'issue:r1'));
});

test('los borradores viejos caducan y no se acumulan sin techo', () => {
    const storage = memoryStorage();
    const old = new Date(Date.now() - RECEIVABLE_DRAFT_MAX_AGE_MS - 1000);
    saveReceivableDraft(storage, 'u1', 'issue:viejo', { form: typed, baseline, now: old });
    assert.equal(readReceivableDraft(storage, 'u1', 'issue:viejo'), null);
    for (let index = 0; index < MAX_RECEIVABLE_DRAFTS + 5; index += 1) {
        saveReceivableDraft(storage, 'u1', `issue:r${index}`, { form: typed, baseline, now: new Date(Date.now() + index) });
    }
    const stored = JSON.parse(storage.getItem(receivableDraftKey('u1')));
    assert.equal(Object.keys(stored.drafts).length, MAX_RECEIVABLE_DRAFTS);
    assert.ok(stored.drafts[`issue:r${MAX_RECEIVABLE_DRAFTS + 4}`], 'se quedan los más recientes');
});

test('un almacenamiento bloqueado o corrupto nunca rompe el formulario', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); } };
    assert.equal(readReceivableDraft(blocked, 'u1', 'new'), null);
    assert.doesNotThrow(() => saveReceivableDraft(blocked, 'u1', 'new', { form: typed, baseline }));
    assert.doesNotThrow(() => clearReceivableDraft(blocked, 'u1', 'new'));
    const corrupt = memoryStorage();
    corrupt.setItem(receivableDraftKey('u1'), '{no es json');
    assert.equal(readReceivableDraft(corrupt, 'u1', 'new'), null);
    assert.equal(readReceivableDraft(null, 'u1', 'new'), null);
});

test('los diálogos de cartera no se cierran con un clic afuera y guardan borrador', () => {
    const source = fs.readFileSync(new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url), 'utf8');
    const outsideGuards = source.match(/onInteractOutside=\{keepOpenOnOutsideClick\}/g) || [];
    assert.ok(outsideGuards.length >= 2, 'emitir/corregir y nueva cuenta por cobrar ignoran el clic afuera');
    assert.match(source, /saveReceivableDraft\(/);
    assert.match(source, /clearReceivableDraft\(draftStorage, draftUserId, issueDraftSlot\)/);
    assert.match(source, /clearReceivableDraft\(draftStorage, draftUserId, 'new'\)/);
    assert.match(source, /data-receivable-draft-notice/);
});
