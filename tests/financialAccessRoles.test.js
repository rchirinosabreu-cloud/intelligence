import test from 'node:test';
import assert from 'node:assert/strict';
import { hasFinancialPermission } from '../src/utils/financialPermissions.js';
import { hasFinancialPermission as middlewareFinancialPermission, requireFinancialPermission } from '../src/middlewares/authMiddleware.js';
import prisma from '../src/lib/prisma.js';
const granted = (user, permission) => hasFinancialPermission({ ...user, modulePermissions: { financiero: true } }, permission);

test('server authorization exports the same pure permission policy available to the UI', () => {
    assert.equal(middlewareFinancialPermission, hasFinancialPermission);
});

test('financial role permissions separate reading, editing and approval', () => {
    assert.equal(granted({ role: 'VIEWER', financialRole: 'VIEWER' }, 'read'), true);
    assert.equal(granted({ role: 'VIEWER', financialRole: 'VIEWER' }, 'write'), false);
    assert.equal(granted({ role: 'EDITOR', financialRole: 'EDITOR' }, 'write'), true);
    assert.equal(granted({ role: 'EDITOR', financialRole: 'EDITOR' }, 'approve'), false);
    assert.equal(granted({ role: 'VIEWER', financialRole: 'APPROVER' }, 'approve'), true);
    assert.equal(granted({ role: 'VIEWER', financialRole: 'APPROVER' }, 'admin'), false);
    assert.equal(granted({ role: 'VIEWER', financialRole: 'ADMIN' }, 'admin'), true);
    assert.equal(hasFinancialPermission({ role: 'ADMIN', financialRole: 'NONE' }, 'approve'), true);
    assert.equal(hasFinancialPermission({ role: 'ADMIN', financialRole: 'NONE' }, 'admin'), true);
});

test('the granted module remains write-compatible without a financial level, but cannot approve', () => {
    for (const financialRole of [undefined, null]) {
        const legacyUser = { role: 'EDITOR', financialRole, modulePermissions: { financiero: true } };
        assert.equal(hasFinancialPermission(legacyUser, 'read'), true);
        assert.equal(hasFinancialPermission(legacyUser, 'write'), true);
        assert.equal(hasFinancialPermission(legacyUser, 'approve'), false);
        assert.equal(hasFinancialPermission(legacyUser, 'admin'), false);
    }
});

test('financial levels refine a checked module independently of obsolete flags', () => {
    const matrix = {
        NONE: [true, true, false, false],
        VIEWER: [true, false, false, false],
        EDITOR: [true, true, false, false],
        APPROVER: [true, true, true, false],
        ADMIN: [true, true, true, true]
    };
    for (const [financialRole, expected] of Object.entries(matrix)) {
        for (const hasFinancialAccess of [true, false, undefined]) {
            const user = { role: 'EDITOR', financialRole, hasFinancialAccess, modulePermissions: { financiero: true } };
            for (const [index, permission] of ['read', 'write', 'approve', 'admin'].entries()) {
                assert.equal(hasFinancialPermission(user, permission), expected[index],
                    `${financialRole}/${permission} with legacy flag ${hasFinancialAccess}`);
            }
        }
    }
});

test('unknown explicit financial roles fail closed instead of activating legacy access', () => {
    for (const financialRole of ['', 'INVALID']) {
        const user = { role: 'EDITOR', financialRole, hasFinancialAccess: true, modulePermissions: { financiero: true } };
        assert.equal(hasFinancialPermission(user, 'read'), false);
        assert.equal(hasFinancialPermission(user, 'write'), false);
    }
});

test('system administrators retain financial permissions independently of legacy flags', () => {
    for (const permission of ['read', 'write', 'approve', 'admin']) {
        assert.equal(hasFinancialPermission({ role: 'ADMIN', financialRole: 'NONE', hasFinancialAccess: false }, permission), true);
    }
});

test('missing users, absent grants and invalid permissions do not grant financial access', () => {
    assert.equal(hasFinancialPermission(null, 'read'), false);
    assert.equal(hasFinancialPermission({ role: 'EDITOR' }, 'read'), false);
    assert.equal(hasFinancialPermission({ role: 'EDITOR', financialRole: null, hasFinancialAccess: false }, 'write'), false);
    assert.equal(hasFinancialPermission({ role: 'EDITOR', hasFinancialAccess: true }, 'unknown'), false);
});

test('financial middleware applies a persisted downgrade instead of stale session grants', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const originalFindUnique = prisma.user.findUnique;
    t.after(() => { prisma.user.findUnique = originalFindUnique; });
    for (const financialRole of ['VIEWER', 'NONE']) {
        prisma.user.findUnique = async () => ({
            role: 'EDITOR', financialRole, hasFinancialAccess: true, isActive: true, modulePermissions: { financiero: financialRole !== 'NONE' }
        });
        const req = { user: { id: 'financial-user', role: 'ADMIN', financialRole: 'ADMIN', hasFinancialAccess: true } };
        let nextCalled = false;
        let status;
        let body;
        const res = {
            status(value) { status = value; return this; },
            json(value) { body = value; return this; }
        };
        await requireFinancialPermission('write')(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, false, financialRole);
        assert.equal(status, 403, financialRole);
        assert.match(body.error, /permiso financiero/);
    }
});
