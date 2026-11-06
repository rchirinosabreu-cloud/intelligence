import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('el feed reciente distingue logros de personas y archivos del mismo Task ID sin atribuir cierre global', () => {
  const source = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');
  const feed = source.slice(source.indexOf('function AchievementsPanel'));
  assert.match(feed, /key=\{task\.participationKey \|\| task\.id \|\| idx\}/);
  assert.match(feed, /task\.participantMemberId \? 'terminó su parte de:' : 'completó:'/);
});
