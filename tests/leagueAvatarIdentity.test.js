import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLeagueAvatarKeys } from '../src/lib/leagueAvatarIdentity.js';

test('the supplied portraits match only a unique named member in the current roster', () => {
  const members = [{ id: '1', name: 'Rodny Chirinos' }, { id: '2', name: 'Mariceth' }, { id: '3', name: 'Francys' }, { id: '4', name: 'Persona nueva' }];
  assert.deepEqual(resolveLeagueAvatarKeys(members), { '1': 'rodny', '2': 'mariceth', '3': 'francys' });
  assert.deepEqual(members[3], { id: '4', name: 'Persona nueva' }, 'does not create or change team membership');
});

test('homonyms, unknown names and approximate matches keep their regular avatar', () => {
  assert.deepEqual(resolveLeagueAvatarKeys([{ id: 'a', name: 'Sara A' }, { id: 'b', name: 'Sara B' }, { id: 'c', name: 'Sarita' }, { id: 'd', name: 'Francis' }, { id: 'e', name: 'Francys' }]), {});
  assert.deepEqual(resolveLeagueAvatarKeys([{ id: 'j', name: ' JESÚS Pérez ' }]), { j: 'jesu' });
});
