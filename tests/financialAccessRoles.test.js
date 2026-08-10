import test from 'node:test';
import assert from 'node:assert/strict';
import { hasFinancialPermission } from '../src/middlewares/authMiddleware.js';

test('financial role permissions separate reading, editing and approval', () => {
    assert.equal(hasFinancialPermission({ role: 'VIEWER', financialRole: 'VIEWER' }, 'read'), true);
    assert.equal(hasFinancialPermission({ role: 'VIEWER', financialRole: 'VIEWER' }, 'write'), false);
    assert.equal(hasFinancialPermission({ role: 'EDITOR', financialRole: 'EDITOR' }, 'write'), true);
    assert.equal(hasFinancialPermission({ role: 'EDITOR', financialRole: 'EDITOR' }, 'approve'), false);
    assert.equal(hasFinancialPermission({ role: 'VIEWER', financialRole: 'APPROVER' }, 'approve'), true);
    assert.equal(hasFinancialPermission({ role: 'VIEWER', financialRole: 'APPROVER' }, 'admin'), false);
    assert.equal(hasFinancialPermission({ role: 'VIEWER', financialRole: 'ADMIN' }, 'admin'), true);
    assert.equal(hasFinancialPermission({ role: 'ADMIN', financialRole: 'NONE' }, 'approve'), true);
    assert.equal(hasFinancialPermission({ role: 'ADMIN', financialRole: 'NONE' }, 'admin'), true);
});

test('legacy financial access remains write-compatible but cannot approve imports or closes', () => {
    const legacyUser = { role: 'EDITOR', financialRole: 'NONE', hasFinancialAccess: true };
    assert.equal(hasFinancialPermission(legacyUser, 'read'), true);
    assert.equal(hasFinancialPermission(legacyUser, 'write'), true);
    assert.equal(hasFinancialPermission(legacyUser, 'approve'), false);
    assert.equal(hasFinancialPermission(legacyUser, 'admin'), false);
});
