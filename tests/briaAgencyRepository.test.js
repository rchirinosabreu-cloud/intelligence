import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaAgencyRepository } from '../src/services/briaAgencyRepository.js';

const owner = { ref: 'owner', role: 'ADMIN' };
const setup = ({ actor = owner, owners = ['owner'], resolveActor, search } = {}) => {
  const calls = [];
  const repository = { search: search || (async (...args) => { calls.push(args); return [{ id: 'mail:1' }]; }), read: async () => ({ id: 'mail:1', nextOffset: 1800 }), status: async () => ({ indexed: 38617 }) };
  return { calls, service: createBriaAgencyRepository({ repository, resolveActor: resolveActor || (async () => actor), ownerIds: owners }) };
};
test('production corpus is closed by default and denied to other admins and project managers before reading', async () => {
  for (const config of [{ owners: [] }, { actor: { ref: 'other', role: 'ADMIN' } }, { actor: { ref: 'owner', role: 'PROJECT_MANAGER' } }]) {
    const { service, calls } = setup(config);
    await assert.rejects(service.search({}, 'Endova'), { status: 403 });
    assert.equal(calls.length, 0);
    assert.equal(await service.canRead({}), false);
  }
});
test('verified owner can search and read bounded PostgreSQL evidence', async () => {
  const { service, calls } = setup();
  assert.deepEqual(await service.search({}, 'Endova'), [{ id: 'mail:1' }]);
  assert.equal(calls[0][0].role, 'ADMIN');
  assert.equal((await service.read({}, 'mail:1', 1800)).nextOffset, 1800);
  assert.equal((await service.overview({})).indexed, 38617);
  assert.equal((await service.overview({})).continuousSync, false);
});
test('revoking corpus ownership while a query runs suppresses the result and saved-history access', async () => {
  let role = 'ADMIN';
  const { service } = setup({ resolveActor: async () => ({ ref: 'owner', role }), search: async () => { role = 'PROJECT_MANAGER'; return [{ excerpt: 'private' }]; } });
  await assert.rejects(service.search({}, 'Endova'), { status: 403 });
  assert.equal(await service.canRead({}), false);
});
test('revoked session or activation is checked from the native identity resolver', async () => {
  const { service, calls } = setup({ resolveActor: async () => { throw Object.assign(new Error('Sesión revocada'), { status: 401 }); } });
  await assert.rejects(service.read({}, 'mail:1'), { status: 401 });
  assert.equal(await service.canRead({}), false);
  assert.equal(calls.length, 0);
});
