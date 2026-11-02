// Quién ve la liga (3 de noviembre de 2026): una lista de correos en `LEAGUE_VISIBLE_TO`, `*` para todo el equipo,
// vacía para nadie. Así se despliega sin que el equipo la vea hasta que Rodny la abra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { leagueVisibleTo, LEAGUE_VISIBLE_TO_ALL } from '../src/lib/leagueVisibility.js';

test('empty hides it from everyone; a star opens it to everyone', () => {
  assert.equal(leagueVisibleTo('', 'rodny@brainstudio.test'), false);
  assert.equal(leagueVisibleTo(undefined, 'rodny@brainstudio.test'), false);
  assert.equal(leagueVisibleTo('   ', 'rodny@brainstudio.test'), false);
  assert.equal(LEAGUE_VISIBLE_TO_ALL, '*');
  assert.equal(leagueVisibleTo('*', 'cualquiera@brainstudio.test'), true);
  assert.equal(leagueVisibleTo('*', ''), true);
});

test('a list of emails, case-insensitive and tolerant of spaces; an account without email never gets in', () => {
  const setting = ' Rodny@Brainstudio.test, elisa@brainstudio.test ';
  assert.equal(leagueVisibleTo(setting, 'rodny@brainstudio.test'), true);
  assert.equal(leagueVisibleTo(setting, 'ELISA@brainstudio.test'), true);
  assert.equal(leagueVisibleTo(setting, 'helen@brainstudio.test'), false);
  assert.equal(leagueVisibleTo(setting, null), false);
  assert.equal(leagueVisibleTo('rodny@brainstudio.test', 'rodny@brainstudio.test.evil'), false, 'exact match, never a prefix');
});
