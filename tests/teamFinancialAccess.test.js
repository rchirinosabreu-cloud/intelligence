import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFinancialAccessFlag } from '../src/routes/api/team.js';

test('resolveFinancialAccessFlag grants explicit financial access when financiero module is enabled', () => {
    assert.equal(resolveFinancialAccessFlag('VIEWER', { financiero: true }), true);
});

test('resolveFinancialAccessFlag grants explicit financial access to admins', () => {
    assert.equal(resolveFinancialAccessFlag('ADMIN', { financiero: false }), true);
});

test('resolveFinancialAccessFlag keeps financial access disabled without module permission', () => {
    assert.equal(resolveFinancialAccessFlag('EDITOR', { financiero: false }), false);
});
