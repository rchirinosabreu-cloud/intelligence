import 'dotenv/config';
import pg from 'pg';
import { vaultKey, openSecret } from '../src/lib/vaultCrypto.js';
import { createVaultRepository } from '../src/services/vaultRepository.js';
import { repairWrappedUsername } from './lib/vaultWrappedUsername.js';

// Revisa la bóveda en busca de usuarios con el correo partido por la importación del Drive (10 de octubre
// de 2026): «…@gmail.co» como usuario y «m» como primera línea de las notas, o el correo entero solo en la
// anotación «Otro usuario anotado…». Por defecto SOLO LEE y cuenta; escribe con `--confirmar CORREGIR`.
// Nunca imprime un valor: solo plataforma, cliente y largos. Cada corrección pasa por el repositorio, así
// que deja su evento (quién, cuándo, qué campos); nada se borra.
//
//   node scripts/repair-vault-wrapped-usernames.js                 (simula)
//   node scripts/repair-vault-wrapped-usernames.js --confirmar CORREGIR

const writing = process.argv.includes('--confirmar') && process.argv[process.argv.indexOf('--confirmar') + 1] === 'CORREGIR';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10000 });
const key = vaultKey();
const actor = { ref: 'correccion-importacion', name: 'Corrección de la importación', role: 'ADMIN', active: true, managedClientIds: [] };

try {
  const rows = (await pool.query(`SELECT c.id, c.platform, c.revision, c.username_enc, c.notes_enc, cl.name AS client_name
    FROM vault.credentials c LEFT JOIN public."Client" cl ON cl.id = c.client_id
    WHERE c.status = 'ACTIVE' AND c.kind = 'ACCESO' ORDER BY cl.name NULLS FIRST, c.platform`)).rows;
  const plan = [];
  for (const row of rows) {
    const username = openSecret(row.username_enc, key, `${row.id}:username`);
    const notes = openSecret(row.notes_enc, key, `${row.id}:notes`);
    const fixed = repairWrappedUsername({ username, notes });
    if (!fixed) continue;
    // Solo la terminación del dominio (lo que la cola completó): dice si la unión tiene sentido sin mostrar el correo.
    const ending = (email) => String(email || '').split('@')[1]?.split('.').slice(-2).join('.') || '';
    plan.push({ row, fixed, before: { user: (username || '').length, notes: (notes || '').split('\n').filter(Boolean).length, ending: ending(username) }, after: { user: fixed.username.length, notes: (fixed.notes || '').split('\n').filter(Boolean).length, ending: ending(fixed.username) } });
  }
  console.log(`[Bóveda] ${writing ? 'CORRIGE' : 'simulación'} · ${rows.length} accesos revisados · ${plan.length} con el correo partido`);
  for (const item of plan) {
    console.log(`[Bóveda] ${item.row.platform} · ${item.row.client_name || 'agencia'} · usuario ${item.before.user}→${item.after.user} caracteres (…${item.before.ending} → …${item.after.ending}) · notas ${item.before.notes}→${item.after.notes} líneas`);
  }
  if (writing) {
    const repo = createVaultRepository({ pool, key });
    let fixedCount = 0, failed = 0;
    for (const item of plan) {
      try {
        await repo.update(actor, item.row.id, item.row.revision, { username: item.fixed.username, notes: item.fixed.notes });
        fixedCount += 1;
      } catch (failure) { failed += 1; console.log(`[Bóveda] No se corrigió ${item.row.platform} · ${item.row.client_name || 'agencia'}: ${failure.message}`); }
    }
    console.log(`[Bóveda] ${JSON.stringify({ corregidos: fixedCount, fallos: failed })}`);
  } else if (plan.length) {
    console.log('[Bóveda] Nada se escribió. Para corregir: node scripts/repair-vault-wrapped-usernames.js --confirmar CORREGIR');
  }
} finally { await pool.end(); }
