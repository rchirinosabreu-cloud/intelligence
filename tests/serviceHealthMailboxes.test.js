// La luz «Buzones de Bria» del semáforo (11 de octubre de 2026): lee el estado que deja el pulso, nunca entra al buzón.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceHealthProbes } from '../src/services/serviceHealthProbes.js';

const env = { ENCRYPTION_KEY: 'x'.repeat(40) };
const noon = new Date('2026-10-13T17:00:00Z'); // 12:00 de Bogotá, martes
const probesWith = (accounts, now = () => noon) => createServiceHealthProbes({ env, now, readMailAccounts: async () => accounts });

test('not configured without key or mailboxes; green when every mailbox was read recently', async () => {
  assert.equal((await createServiceHealthProbes({ env: {}, readMailAccounts: async () => [] }).mailboxes()).status, 'NOT_CONFIGURED');
  assert.equal((await probesWith([]).mailboxes()).status, 'NOT_CONFIGURED');
  const ok = await probesWith([{ email: 'social.brainstudio@gmail.com', isActive: true, lastReadAt: new Date(noon.getTime() - 10 * 60_000), lastError: null }]).mailboxes();
  assert.deepEqual([ok.status, ok.message], ['OK', '1 buzón leyéndose con normalidad.']);
});

test('a refused password is red when it is the only mailbox and yellow when another still works; a stale read in working hours is yellow', async () => {
  const red = await probesWith([{ email: 'social.brainstudio@gmail.com', isActive: false, lastReadAt: null, lastError: 'Gmail rechazó la contraseña de aplicación.' }]).mailboxes();
  assert.deepEqual([red.status, red.critical, red.errorCode], ['FAIL', true, 'EAUTH']);
  const yellow = await probesWith([{ email: 'a@x', isActive: false, lastReadAt: null, lastError: 'x' }, { email: 'b@x', isActive: true, lastReadAt: noon, lastError: null }]).mailboxes();
  assert.deepEqual([yellow.status, yellow.message], ['WARN', 'Pide volver a conectarse: a@x.']);
  const stale = await probesWith([{ email: 'b@x', isActive: true, lastReadAt: new Date(noon.getTime() - 2 * 3_600_000), lastError: null }]).mailboxes();
  assert.match(stale.message, /no ha leído b@x en los últimos 45 minutos/);
  const night = await probesWith([{ email: 'b@x', isActive: true, lastReadAt: new Date('2026-10-13T20:00:00Z'), lastError: null }], () => new Date('2026-10-14T02:00:00Z')).mailboxes();
  assert.equal(night.status, 'OK', 'outside working hours the pulse does not read, so no warning');
});
