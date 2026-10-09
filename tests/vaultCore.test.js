import test from 'node:test';
import assert from 'node:assert/strict';
import { vaultKey, sealSecret, openSecret } from '../src/lib/vaultCrypto.js';
import { canUseVault, canSeeCredential, canEditCredential, validateCredentialInput } from '../src/lib/vaultAccess.js';

const env = { ENCRYPTION_KEY: 'clave-de-prueba-de-treinta-y-dos-caracteres-o-mas' };
const admin = { ref: 'u-admin', role: 'ADMIN', active: true, managedClientIds: [] };
const pm = { ref: 'u-pm', role: 'PROJECT_MANAGER', active: true, managedClientIds: ['c-aristea'] };

test('a secret is sealed with authentication and bound to its own record', () => {
  const key = vaultKey(env);
  const sealed = sealSecret('contraseña de prueba ñ', key, 'cred-1:secret');
  assert.match(sealed, /^v1\./);
  assert.equal(sealed.includes('contraseña'), false);
  assert.equal(openSecret(sealed, key, 'cred-1:secret'), 'contraseña de prueba ñ');
  assert.notEqual(sealSecret('igual', key, 'a'), sealSecret('igual', key, 'a'), 'random IV');
  assert.throws(() => openSecret(sealed, key, 'cred-2:secret'), 'moved to another record');
  const [v, iv, tag, body] = sealed.split('.');
  const tampered = [v, iv, tag, Buffer.from('x' + Buffer.from(body, 'base64url').toString('latin1').slice(1), 'latin1').toString('base64url')].join('.');
  assert.throws(() => openSecret(tampered, key, 'cred-1:secret'), 'tampering is detected');
  assert.throws(() => openSecret(sealed, vaultKey({ ENCRYPTION_KEY: 'otra-clave-distinta-de-treinta-y-dos-caracteres' }), 'cred-1:secret'));
  assert.equal(openSecret(null, key, 'x'), null);
});

test('the vault key prefers its own variable and refuses a short or missing key', () => {
  assert.notDeepEqual(vaultKey({ ...env, VAULT_ENCRYPTION_KEY: 'otra-clave-propia-de-la-boveda-larga-12345' }), vaultKey(env));
  assert.throws(() => vaultKey({}), /clave/i);
  assert.throws(() => vaultKey({ ENCRYPTION_KEY: 'corta' }), /clave/i);
  assert.equal(vaultKey(env).length, 32);
});

test('admins see everything; a PM sees the credentials of their own clients or the ones shared with them', () => {
  const aristea = { clientId: 'c-aristea', sharedUserIds: [] };
  const nattal = { clientId: 'c-nattal', sharedUserIds: [] };
  const agency = { clientId: null, sharedUserIds: [] };
  assert.equal(canSeeCredential(admin, nattal), true);
  assert.equal(canSeeCredential(admin, agency), true);
  assert.equal(canSeeCredential(pm, aristea), true);
  assert.equal(canSeeCredential(pm, nattal), false);
  assert.equal(canSeeCredential(pm, agency), false, 'agency accounts are for admins unless shared');
  assert.equal(canSeeCredential(pm, { ...nattal, sharedUserIds: ['u-pm'] }), true);
  assert.equal(canSeeCredential({ ...pm, active: false }, aristea), false);
  assert.equal(canSeeCredential({ ...pm, role: 'EDITOR' }, aristea), false);
  assert.equal(canEditCredential(pm, aristea), true);
  assert.equal(canEditCredential(pm, { ...nattal, sharedUserIds: ['u-pm'] }), false, 'seeing a shared one does not allow editing it');
  assert.equal(canUseVault({ role: 'PROJECT_MANAGER', isActive: true }), true);
  assert.equal(canUseVault({ role: 'EDITOR', isActive: true }), false);
});

test('a credential needs a platform and a secret; links are http(s); sharing is a short list', () => {
  const ok = validateCredentialInput({ clientId: 'c1', platform: 'Instagram', label: 'Cuenta principal', url: 'https://instagram.com/aristea', username: 'aristea', secret: 'x', notes: '' }, { creating: true });
  assert.equal(ok.platform, 'Instagram');
  assert.equal(ok.notes, null);
  assert.throws(() => validateCredentialInput({ platform: '', secret: 'x' }, { creating: true }), /plataforma/i);
  assert.throws(() => validateCredentialInput({ platform: 'Instagram', secret: '' }, { creating: true }), /contraseña/i);
  assert.throws(() => validateCredentialInput({ platform: 'Web', secret: 'x', url: 'javascript:alert(1)' }, { creating: true }), /enlace/i);
  assert.throws(() => validateCredentialInput({ platform: 'Web', secret: 'x', sharedUserIds: Array.from({ length: 21 }, (_, i) => `u${i}`) }, { creating: true }), /compartir/i);
  const patch = validateCredentialInput({ label: 'Nuevo nombre' }, { creating: false });
  assert.deepEqual(Object.keys(patch), ['label'], 'an edit touches only what it sends');
});
