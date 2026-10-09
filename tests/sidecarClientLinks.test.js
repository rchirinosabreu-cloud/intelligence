import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';

// Orden de la base lateral (Rodny, 9 de octubre de 2026: «lo que propones para que todo esté bien
// organizado, hazlo»). Los hechos, las dudas y los accesos se ligan a la ficha del cliente con una llave
// foránea: no pueden apuntar a un cliente que no existe, y si una ficha se borra quedan sin cliente. En la
// bóveda eso los vuelve de la agencia, solo para administradores: nunca quedan a la vista de otro PM.

const connectionString = briaTestDatabaseUrl();

test('real PostgreSQL: facts, questions and accesses are tied to an existing client and survive its deletion unlinked', { skip: !connectionString }, async () => {
  const pool = new pg.Pool({ connectionString, max: 2 });
  const clientId = `test-client-${randomUUID()}`, workspace = `test:${randomUUID()}`, credentialId = randomUUID();
  try {
    for (const file of ['bria-agency-facts.sql', 'vault.sql']) await pool.query(await readFile(new URL(`../scripts/sql/${file}`, import.meta.url), 'utf8'));
    // Aplicar dos veces no falla: el arranque lo hace en cada despliegue.
    for (const file of ['bria-agency-facts.sql', 'vault.sql']) await pool.query(await readFile(new URL(`../scripts/sql/${file}`, import.meta.url), 'utf8'));
    await pool.query('INSERT INTO "Client"(id, name, slug) VALUES($1, $2, $3)', [clientId, 'Cliente de prueba', clientId]);
    const fact = (id, client) => pool.query(`INSERT INTO bria_memory.agency_facts(workspace,id,client_id,entity,entity_key,entity_type,topic,statement,certainty,purpose,sensitivity,origin,digest,actor_ref,actor_name,terms)
      VALUES($1,$2,$3,'Cliente de prueba','cliente de prueba','cliente','acuerdo','Hecho de prueba.','PRACTICA','operacion','normal','EQUIPO','d','t','T',to_tsvector('simple','prueba'))`, [workspace, id, client]);
    await fact('f1', clientId);
    await assert.rejects(() => fact('f2', 'cliente-que-no-existe'), { code: '23503' });
    await pool.query("INSERT INTO bria_memory.agency_questions(workspace,id,client_id,entity,entity_key,question,priority,purpose,digest) VALUES($1,'q1',$2,'Cliente de prueba','cliente de prueba','¿Duda?','alta','operacion','d')", [workspace, clientId]);
    await pool.query("INSERT INTO vault.credentials(id,client_id,platform,secret_enc,created_by_ref,created_by_name,updated_by_ref,updated_by_name) VALUES($1,$2,'Prueba','v1.x.y.z','t','T','t','T')", [credentialId, clientId]);
    await assert.rejects(() => pool.query("INSERT INTO vault.credentials(id,client_id,platform,secret_enc,created_by_ref,created_by_name,updated_by_ref,updated_by_name) VALUES($1,'cliente-que-no-existe','Prueba','v1.x.y.z','t','T','t','T')", [randomUUID()]), { code: '23503' });

    await pool.query('DELETE FROM "Client" WHERE id=$1', [clientId]);
    assert.equal((await pool.query('SELECT client_id FROM bria_memory.agency_facts WHERE workspace=$1 AND id=$2', [workspace, 'f1'])).rows[0].client_id, null, 'the fact stays, unlinked');
    assert.equal((await pool.query('SELECT client_id FROM bria_memory.agency_questions WHERE workspace=$1', [workspace])).rows[0].client_id, null);
    assert.equal((await pool.query('SELECT client_id FROM vault.credentials WHERE id=$1', [credentialId])).rows[0].client_id, null, 'the access becomes agency-only, for admins');
  } finally {
    await pool.query('DELETE FROM vault.credentials WHERE id=$1', [credentialId]).catch(() => {});
    await pool.query('DELETE FROM bria_memory.agency_questions WHERE workspace=$1', [workspace]).catch(() => {});
    await pool.query('DELETE FROM bria_memory.agency_facts WHERE workspace=$1', [workspace]).catch(() => {});
    await pool.query('DELETE FROM "Client" WHERE id=$1', [clientId]).catch(() => {});
    await pool.end();
  }
});
