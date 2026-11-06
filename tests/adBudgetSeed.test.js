import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MEETING_BUDGETS, matchClient, matchResponsible, planSeed } from '../scripts/lib/adBudgetSeed.js';
import { adBudgetProblem } from '../src/lib/adBudgets.js';

const clients = [{ id: '1', name: 'Foobespain' }, { id: '2', name: 'Bonsai' }, { id: '3', name: 'Multik' }, { id: '4', name: 'New Pueblito' }, { id: '5', name: 'Promo Group' }, { id: '6', name: 'Pablo Hoff' }];

test('todo lo de la reunión es una pauta válida y lo incierto lo dice su nota', () => {
    for (const row of MEETING_BUDGETS) {
        assert.equal(adBudgetProblem({ clientId: 'x', platform: 'META', kind: 'MENSUAL', currency: row.currency, amount: row.amount }), null, row.client);
    }
    const multik = MEETING_BUDGETS.find((row) => row.client === 'Multi-K');
    assert.deepEqual([multik.amount, multik.closesOn], [350000, '2026-11-18'], 'lo que confirmó Rodny');
    assert.match(MEETING_BUDGETS.find((row) => row.client === 'Bonsai').notes, /Confirmar contra el contrato/);
});

test('el cliente se encuentra sin importar mayúsculas ni guiones, y nunca se adivina entre dos', () => {
    assert.equal(matchClient('Multi-K', clients).id, '3');
    assert.equal(matchClient('bonsai', clients).id, '2');
    assert.equal(matchClient('Titanes', clients), null);
    assert.equal(matchClient('Promo', [{ id: 'a', name: 'Promo Group' }, { id: 'b', name: 'Promo Norte' }]), null);
});

test('quien lleva la pauta sale del área y, si no, del nombre con sus grafías', () => {
    const hasArea = (member) => member.area === true;
    assert.equal(matchResponsible([{ id: '1', name: 'Ana', area: true }, { id: '2', name: 'Keila' }], hasArea).id, '1');
    for (const name of ['Keila Pérez', 'Keyla Pérez', 'Kayla', 'Kaila']) assert.equal(matchResponsible([{ id: '2', name }], hasArea)?.id, '2', name);
    assert.equal(matchResponsible([{ id: '3', name: 'Kamila' }], hasArea), null, 'Kamila no es Keila');
});

test('cargar dos veces no duplica, y avisa si el contrato da otro cierre', () => {
    const closeOf = () => '2026-11-18';
    const first = planSeed({ clients, existing: [], closeOf });
    assert.equal(first.filter((item) => item.action === 'CREAR').length, MEETING_BUDGETS.length);
    assert.equal(first.find((item) => item.row.client === 'Bonsai').differs, true);
    const again = planSeed({ clients, existing: [{ clientId: '2', brand: null, platform: 'META' }], closeOf });
    assert.equal(again.find((item) => item.row.client === 'Bonsai').action, 'YA_EXISTE');
});

test('la carga simula salvo que se confirme', () => {
    const script = readFileSync(new URL('../scripts/load-ad-budgets.js', import.meta.url), 'utf8');
    assert.match(script, /--confirmar/);
    assert.match(script, /if \(!confirmed\)/);
});
