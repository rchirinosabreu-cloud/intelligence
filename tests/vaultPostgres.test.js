import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { createVaultRepository } from '../src/services/vaultRepository.js';
import { vaultKey } from '../src/lib/vaultCrypto.js';

const connectionString = briaTestDatabaseUrl();
const key = vaultKey({ ENCRYPTION_KEY: 'clave-de-prueba-de-treinta-y-dos-caracteres-o-mas' });
const admin = { ref: 'u-admin', name: 'Admin', role: 'ADMIN', active: true, managedClientIds: [] };
const pm = { ref: 'u-pm', name: 'Camila', role: 'PROJECT_MANAGER', active: true, managedClientIds: ['c-aristea-test'] };
const other = { ref: 'u-pm2', name: 'Otra PM', role: 'PROJECT_MANAGER', active: true, managedClientIds: ['c-otro-test'] };

test('real PostgreSQL: secrets are stored encrypted, each person sees only what they may, and every reveal is recorded first', { skip: !connectionString }, async () => {
  const pool = new pg.Pool({ connectionString, max: 3 });
  const created = [];
  try {
    await pool.query(await readFile(new URL('../scripts/sql/vault.sql', import.meta.url), 'utf8'));
    const repo = createVaultRepository({ pool, key });
    const insta = await repo.create(pm, { clientId: 'c-aristea-test', platform: 'Instagram', label: 'Cuenta principal', username: 'aristea.test', secret: 'Clave-ficticia-1', notes: 'Doble factor al celular de la PM' });
    created.push(insta.credential.id);
    const agency = await repo.create(admin, { clientId: null, platform: 'Canva', label: 'Cuenta de la agencia', secret: 'Clave-ficticia-2' });
    created.push(agency.credential.id);

    const raw = (await pool.query('SELECT * FROM vault.credentials WHERE id = ANY($1::uuid[])', [created])).rows;
    assert.equal(JSON.stringify(raw).includes('Clave-ficticia'), false, 'nothing in plain text');
    assert.equal(JSON.stringify(raw).includes('aristea.test'), false);

    assert.deepEqual((await repo.list(pm)).filter((r) => created.includes(r.id)).map((r) => r.platform), ['Instagram']);
    assert.equal((await repo.list(other)).filter((r) => created.includes(r.id)).length, 0);
    assert.equal((await repo.list(admin)).filter((r) => created.includes(r.id)).length, 2);
    assert.equal((await repo.list(pm, { query: 'instágram' })).filter((r) => created.includes(r.id)).length, 1, 'search ignores accents');
    assert.equal('secret' in (await repo.list(admin))[0], false, 'a listing never carries values');

    await assert.rejects(() => repo.reveal(other, insta.credential.id), { status: 404 });
    await assert.rejects(() => repo.reveal(pm, agency.credential.id), { status: 404 });
    const shown = await repo.reveal(pm, insta.credential.id, 'BRIA');
    assert.deepEqual([shown.username, shown.secret, shown.notes], ['aristea.test', 'Clave-ficticia-1', 'Doble factor al celular de la PM']);
    const log = await repo.reveals(admin, insta.credential.id);
    assert.equal(log.length, 1); assert.equal(log[0].via, 'BRIA'); assert.equal(log[0].persona, 'Camila');
    await assert.rejects(() => repo.reveals(pm, insta.credential.id), { status: 403 });

    await assert.rejects(() => repo.create(pm, { clientId: 'c-otro-test', platform: 'Instagram', secret: 'x' }), { status: 403 });
    await assert.rejects(() => repo.update(pm, agency.credential.id, 1, { label: 'x' }), { status: 404 });
    await assert.rejects(() => repo.update(pm, insta.credential.id, 1, { sharedUserIds: ['u-pm2'] }), { status: 403 });
    const edited = await repo.update(pm, insta.credential.id, 1, { secret: 'Clave-ficticia-nueva', label: 'Instagram principal' });
    assert.equal(edited.revision, 2);
    await assert.rejects(() => repo.update(pm, insta.credential.id, 1, { label: 'viejo' }), { status: 409 });
    assert.equal((await repo.reveal(pm, insta.credential.id)).secret, 'Clave-ficticia-nueva');
    const shared = await repo.update(admin, agency.credential.id, 1, { sharedUserIds: ['u-pm'] });
    assert.deepEqual(shared.sharedUserIds, ['u-pm']);
    assert.equal((await repo.reveal(pm, agency.credential.id)).secret, 'Clave-ficticia-2', 'shared with the PM');

    const events = (await pool.query('SELECT action, changed_fields FROM vault.credential_events WHERE credential_id=$1 ORDER BY revision', [insta.credential.id])).rows;
    assert.deepEqual(events.map((e) => e.action), ['CREATE', 'UPDATE']);
    assert.equal(JSON.stringify(events).includes('Clave-ficticia'), false, 'events never carry values');

    const dup = await repo.create(admin, { clientId: null, platform: 'Bloque', secret: 'texto' }, { importKey: 'test-import-1', kind: 'BLOQUE', source: 'IMPORT' });
    created.push(dup.credential.id);
    assert.equal((await repo.create(admin, { clientId: null, platform: 'Bloque', secret: 'texto' }, { importKey: 'test-import-1', kind: 'BLOQUE', source: 'IMPORT' })).duplicate, true, 'import is idempotent');

    await repo.retire(pm, insta.credential.id, 2, 'La cuenta se cerró');
    assert.equal((await repo.list(pm)).some((r) => r.id === insta.credential.id), false);
    await assert.rejects(() => repo.reveal(pm, insta.credential.id), { status: 404 });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM vault.credentials WHERE id=$1', [insta.credential.id])).rows[0].n, 1, 'retired, never deleted');
  } finally {
    await pool.query('DELETE FROM vault.reveal_events WHERE credential_id = ANY($1::uuid[])', [created]);
    await pool.query('DELETE FROM vault.credential_events WHERE credential_id = ANY($1::uuid[])', [created]);
    await pool.query('DELETE FROM vault.credentials WHERE id = ANY($1::uuid[])', [created]);
    await pool.end();
  }
});
