import test from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveFinancialAccessFlag,
    resolveFinancialRole
} from '../src/routes/api/team.js';

test('resolveFinancialAccessFlag grants explicit financial access when financiero module is enabled', () => {
    assert.equal(resolveFinancialAccessFlag('VIEWER', { financiero: true }), true);
});

test('resolveFinancialAccessFlag grants explicit financial access to admins', () => {
    assert.equal(resolveFinancialAccessFlag('ADMIN', { financiero: false }), true);
});

test('resolveFinancialAccessFlag keeps financial access disabled without module permission', () => {
    assert.equal(resolveFinancialAccessFlag('EDITOR', { financiero: false }), false);
});

test('resolveFinancialRole validates explicit roles and grants admins full approval', () => {
    assert.equal(resolveFinancialRole('ADMIN', 'NONE', { financiero: false }), 'ADMIN');
    assert.equal(resolveFinancialRole('EDITOR', 'APPROVER', { financiero: true }), 'APPROVER');
    assert.equal(resolveFinancialRole('EDITOR', 'INVALID', { financiero: true }), 'EDITOR');
    assert.equal(resolveFinancialRole('VIEWER', 'EDITOR', { financiero: false }), 'NONE');
});
