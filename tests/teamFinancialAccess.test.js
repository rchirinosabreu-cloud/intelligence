import test from 'node:test';
import assert from 'node:assert/strict';
import { hasFinancialPermission } from '../src/middlewares/authMiddleware.js';
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

test('enabling the financial module with a viewer role never grants write permission', () => {
    const modulePermissions = { financiero: true };
    const user = {
        role: 'EDITOR',
        modulePermissions,
        hasFinancialAccess: resolveFinancialAccessFlag('EDITOR', modulePermissions),
        financialRole: resolveFinancialRole('EDITOR', 'VIEWER', modulePermissions)
    };
    assert.equal(hasFinancialPermission(user, 'read'), true);
    assert.equal(hasFinancialPermission(user, 'write'), false);
});

test('unchecking the financial module revokes access even with an older financial role', () => {
    const modulePermissions = { financiero: false };
    const user = {
        role: 'EDITOR',
        modulePermissions,
        hasFinancialAccess: resolveFinancialAccessFlag('EDITOR', modulePermissions),
        financialRole: resolveFinancialRole('EDITOR', 'NONE', modulePermissions)
    };
    assert.equal(hasFinancialPermission(user, 'read'), false);
    assert.equal(hasFinancialPermission(user, 'write'), false);
});
