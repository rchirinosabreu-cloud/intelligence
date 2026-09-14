import test from 'node:test';
import assert from 'node:assert/strict';
import { getWelcomeModules, welcomeCatalog, welcomeName, welcomeDemoProfiles } from './fixtures/welcome/welcomeContent.js';

test('Francis sees quotations in her welcome, without granting it to other preview profiles', () => {
  assert.ok(getWelcomeModules(welcomeDemoProfiles.francis).some(module => module.id === 'cotizaciones'));
  assert.ok(!getWelcomeModules(welcomeDemoProfiles.david).some(module => module.id === 'cotizaciones'));
});

test('welcome only explains explicitly granted modules, not every module for a manager', () => {
  const user = { role: 'PROJECT_MANAGER', modulePermissions: { gestion: true, financiero: false, parrillas: 'true', inventado: true } };
  assert.deepEqual(getWelcomeModules(user).map(item => item.id), ['gestion']);
});
test('admin sees all modules, while no permissions never invents access', () => {
  assert.equal(getWelcomeModules({ role: 'ADMIN' }).length, welcomeCatalog.length);
  assert.deepEqual(getWelcomeModules({ role: 'VIEWER' }), []);
  assert.deepEqual(getWelcomeModules(null), []);
});
test('Drive follows Minutas permission and is explained separately', () => {
  assert.deepEqual(getWelcomeModules({ modulePermissions: { minutas: true } }).map(item => item.id), ['minutas', 'drive']);
});
test('personal greeting has a readable fallback and every module has concise copy', () => {
  assert.equal(welcomeName('  Francis Caballero '), 'Francis');
  assert.equal(welcomeName(''), 'equipo');
  assert.ok(welcomeCatalog.every(item => item.description.length < 125 && item.description.length > 20));
  assert.equal(new Set(welcomeCatalog.map(item => item.id)).size, welcomeCatalog.length);
});
