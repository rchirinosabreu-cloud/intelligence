import test from 'node:test';
import assert from 'node:assert/strict';
import { getFinancialPayrollLedger } from '../src/controllers/financialController.js';
import { groupPayrollPeople } from '../src/lib/payrollPeople.js';

test('la nómina usa el vínculo de Equipo de la persona y los perfiles de usuario explícitos, nunca nombres', async () => {
  const team = { id: 'team', name: 'Francys Caballero', avatarUrl: '/francys.jpg' };
  const user = { id: 'user', name: 'Elisa', avatarUrl: '/user.jpg', teamMember: { id: 'team-user', name: 'Elisa', avatarUrl: '/elisa.jpg' } };
  const contracts = [
    { id: 'old', collaborator: { thirdPartyId: 'party', thirdParty: { name: 'Francys Caballero', teamMemberId: 'team' } } },
    { id: 'new', collaborator: { thirdPartyId: 'party', thirdParty: { name: 'Francys Caballero', teamMemberId: 'team' } } },
    { id: 'linked-user', collaborator: { displayName: 'Elisa', user } },
    { id: 'contract-user', user: { ...user, teamMember: null } },
    { id: 'unlinked', collaborator: { displayName: 'Francys Caballero' } },
  ].map(c => ({ ...c, transactions: [] }));
  let teamQueries = 0;
  const db = { payrollContract: { findMany: async args => {
    assert.equal(args.include.collaborator.select.thirdParty.select.teamMemberId, true);
    assert.equal(args.include.collaborator.select.user.select.avatarUrl, true);
    return contracts;
  } }, teamMember: { findMany: async args => { teamQueries++; assert.deepEqual(args.where, { id: { in: ['team'] } }); return [team]; } } };
  const res = { statusCode: 200, status(code) { this.statusCode=code; return this; }, json(data) { this.data=data; return this; } };
  await getFinancialPayrollLedger({ query: { year: 2026 } }, res, { prismaClient: db });
  assert.equal(res.statusCode, 200);
  assert.equal(teamQueries, 1);
  const rows = res.data.items;
  assert.deepEqual(rows[0].avatar, team);
  assert.deepEqual(rows[1].avatar, team);
  assert.deepEqual(rows[2].avatar, user.teamMember);
  assert.equal(rows[3].avatar.avatarUrl, '/user.jpg');
  assert.equal(rows[4].avatar, undefined);
  assert.deepEqual(groupPayrollPeople(rows).find(p => p.partyId === 'party').avatar, team);
});
