import test from 'node:test';
import assert from 'node:assert/strict';
import { hasFinancialPermission } from '../src/utils/financialPermissions.js';
import { resolveFinancialRole } from '../src/routes/api/team.js';
import { requireFinancialPermission } from '../src/middlewares/authMiddleware.js';
import prisma from '../src/lib/prisma.js';

test('only system ADMIN or an explicit Finanzas module checkbox grants entry', () => {
  assert.equal(hasFinancialPermission({ role: 'ADMIN', modulePermissions: { financiero: false } }), true);
  for (const modulePermissions of [undefined, {}, { financiero: false }, { financiero: 'true' }]) {
    assert.equal(hasFinancialPermission({ name: 'admin', role: 'VIEWER', financialRole: 'APPROVER', hasFinancialAccess: true, modulePermissions }), false);
  }
});

test('a granted checkbox supports old NONE roles without granting approval or administrator operations', () => {
  for (const financialRole of [undefined, null, 'NONE']) {
    const user = { role: 'EDITOR', financialRole, modulePermissions: { financiero: true } };
    assert.equal(hasFinancialPermission(user, 'read'), true);
    assert.equal(hasFinancialPermission(user, 'write'), true);
    assert.equal(hasFinancialPermission(user, 'approve'), false);
    assert.equal(hasFinancialPermission(user, 'admin'), false);
  }
  assert.equal(resolveFinancialRole('EDITOR', 'NONE', { financiero: true }), 'EDITOR');
});

test('explicit financial levels restrict actions after the checkbox grants entry', () => {
  assert.equal(hasFinancialPermission({ role: 'EDITOR', financialRole: 'VIEWER', modulePermissions: { financiero: true } }, 'write'), false);
  assert.equal(hasFinancialPermission({ role: 'VIEWER', financialRole: 'APPROVER', modulePermissions: { financiero: true } }, 'approve'), true);
});

test('API rechecks the current persisted checkbox and activity instead of session flags', async t => {
  t.mock.method(console, 'warn', () => {});
  const originalFindUnique = prisma.user.findUnique;
  t.after(() => { prisma.user.findUnique = originalFindUnique; });
  let selection;
  prisma.user.findUnique = async args => {
    selection = args.select;
    return { role: 'EDITOR', financialRole: 'APPROVER', hasFinancialAccess: true, isActive: true, modulePermissions: { financiero: false } };
  };
  const req = { user: { id: 'revoked', role: 'ADMIN', modulePermissions: { financiero: true } } };
  let status, called = false;
  const res = { status(code) { status = code; return this; }, json() { return this; } };
  await requireFinancialPermission('read')(req, res, () => { called = true; });
  assert.equal(status, 403);
  assert.equal(called, false);
  assert.equal(selection.modulePermissions, true);
  assert.equal(selection.isActive, true);
});
