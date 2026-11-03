// Quién ve la liga (3 de noviembre de 2026): la casilla «Liga del mes» de Equipo, persona por persona, como la de
// Bria. Un administrador no la tiene por su cargo. Así se despliega sin que el equipo la vea hasta que se encienda.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseLeague, LEAGUE_PERMISSION_KEY } from '../src/lib/leagueVisibility.js';
import { EXTRA_KEYS, hasModuleAccess, readModulePermissions, sanitizeModulePermissions } from '../src/lib/platformModules.js';

test('the league is a checkbox beside Bria, never a menu module, and only an explicit true opens it', () => {
  assert.equal(LEAGUE_PERMISSION_KEY, 'liga');
  assert.deepEqual([...EXTRA_KEYS], ['bria', 'liga']);
  assert.equal(readModulePermissions(null).liga, false);
  assert.equal(readModulePermissions({ liga: 'true' }).liga, false, 'only a real true');
  assert.equal(readModulePermissions({ Liga: true }).liga, true, 'however it was saved');
  assert.equal(sanitizeModulePermissions({ liga: true }).liga, true, 'saving keeps it');
  assert.equal('liga' in sanitizeModulePermissions({}), true, 'saving always writes the box');
});

test('nobody has it by role: an administrator needs the box too; an inactive account never gets in', () => {
  assert.equal(canUseLeague({ role: 'ADMIN', isActive: true, modulePermissions: {} }), false, 'Rodny turns his own box on');
  assert.equal(canUseLeague({ role: 'ADMIN', isActive: true, modulePermissions: { liga: true } }), true);
  assert.equal(canUseLeague({ role: 'EDITOR', isActive: true, modulePermissions: { liga: true } }), true);
  assert.equal(canUseLeague({ role: 'EDITOR', isActive: true, modulePermissions: { gestion: true } }), false);
  assert.equal(canUseLeague({ role: 'EDITOR', isActive: false, modulePermissions: { liga: true } }), false);
  assert.equal(canUseLeague(null), false);
  assert.equal(hasModuleAccess({ role: 'ADMIN', modulePermissions: {} }, 'liga'), false, 'the screen and the server decide the same');
  assert.equal(hasModuleAccess({ role: 'ADMIN', modulePermissions: {} }, 'gestion'), true, 'the modules of the menu keep the administrator shortcut');
});
