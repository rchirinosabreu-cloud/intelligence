import test from 'node:test';
import assert from 'node:assert/strict';
import { adApprovalKey, approvedAdBudgetFor, currentContractOf, missingApprovalText, normalizeContractAdBudgets } from '../src/lib/adBudgetApproval.js';

// La pauta aprobada vive en el contrato del cliente (Rodny, 13 de noviembre de 2026).

test('la ficha revisa cada pauta aprobada y no deja dos de la misma plataforma y marca', () => {
    const ok = normalizeContractAdBudgets([{ platform: 'META', brand: ' Wine Summit ', currency: 'USD', amount: '100' }, { platform: 'META', brand: '', currency: 'COP', amount: 300000 }]);
    assert.equal(ok.valid, true);
    assert.deepEqual(ok.value, [{ platform: 'META', brand: 'Wine Summit', currency: 'USD', amount: 100 }, { platform: 'META', brand: null, currency: 'COP', amount: 300000 }]);
    const bad = normalizeContractAdBudgets([{ platform: 'META', brand: 'Endova', currency: 'COP', amount: '0' }, { platform: 'META', brand: 'endova', currency: 'COP', amount: 1 }, { platform: 'RADIO', currency: 'EUR', amount: 1 }]);
    assert.equal(bad.valid, false);
    assert.equal(bad.errors['contract.adBudgets.0.amount'], 'Escribe la cifra aprobada.');
    assert.match(bad.errors['contract.adBudgets.1.brand'], /ya están en la lista/);
    assert.equal(bad.errors['contract.adBudgets.2.platform'], 'Elige la plataforma.');
    assert.equal(bad.errors['contract.adBudgets.2.currency'], 'Elige la moneda.');
    assert.deepEqual(normalizeContractAdBudgets(null).value, [], 'null retira las pautas del contrato');
    assert.equal(normalizeContractAdBudgets('x').valid, false);
});

test('una pauta encuentra su cifra en el contrato vigente por plataforma y marca; sin entrada sigue con la suya y lo dice', () => {
    const contracts = [
        { id: 'k-old', startDate: '2025-01-01', adBudgets: [{ platform: 'META', brand: null, currency: 'COP', amount: 150000 }] },
        { id: 'k-now', startDate: '2026-01-01', adBudgets: [{ platform: 'META', brand: null, currency: 'COP', amount: 200000 }, { platform: 'META', brand: 'Nueva sede', currency: 'COP', amount: 50000 }] },
        { id: 'k-next', startDate: '2027-01-01', adBudgets: [{ platform: 'META', brand: null, currency: 'COP', amount: 999 }] }
    ];
    assert.equal(currentContractOf(contracts, '2026-11-13').id, 'k-now');
    const client = { name: 'Pablo Hoff', contracts };
    assert.deepEqual(approvedAdBudgetFor({ client, platform: 'META', brand: null, amount: 1, currency: 'COP' }, '2026-11-13'), { source: 'CONTRATO', amount: 200000, currency: 'COP', contractId: 'k-now' });
    assert.equal(approvedAdBudgetFor({ client, platform: 'META', brand: 'NUEVA SEDE', amount: 1, currency: 'COP' }, '2026-11-13').amount, 50000, 'la marca se compara sin mayúsculas');
    const missing = approvedAdBudgetFor({ client, platform: 'META', brand: 'Otra', amount: 123, currency: 'COP' }, '2026-11-13');
    assert.deepEqual(missing, { source: 'PAUTA', amount: 123, currency: 'COP', contractId: 'k-now', hasContract: true });
    assert.equal(missingApprovalText({ client, platform: 'META', brand: 'Otra' }), 'El contrato de Pablo Hoff no tiene pauta aprobada para Meta · Otra: agrégala en la ficha operativa.');
    assert.equal(approvedAdBudgetFor({ client: { contracts: [] }, platform: 'META', amount: 5, currency: 'USD' }, '2026-11-13').hasContract, false);
    assert.equal(adApprovalKey({ platform: 'meta', brand: ' Endova ' }), 'META:endova');
});
