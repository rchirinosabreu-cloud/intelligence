// La bóveda en PostgreSQL. Quién ve qué se decide en la consulta, antes del límite; los valores solo se
// descifran al mostrarlos, y mostrarlos deja primero su registro: si el registro no se guarda, no se muestra.
// Ningún evento guarda un valor, solo qué campos cambiaron.

import { randomUUID } from 'node:crypto';
import { sealSecret, openSecret } from '../lib/vaultCrypto.js';
import { canEditCredential, canSeeCredential, validateCredentialInput } from '../lib/vaultAccess.js';

const vaultError = (message, status = 400, code = 'VAULT_INVALID') => Object.assign(new Error(message), { status, code });
const present = (row, { admin = false } = {}) => row && ({
  id: row.id, clientId: row.client_id, clientName: row.client_name || null, platform: row.platform, label: row.label, url: row.url,
  hasUsername: Boolean(row.username_enc), hasNotes: Boolean(row.notes_enc), kind: row.kind, source: row.source, status: row.status,
  platforms: row.platforms || [],
  revision: row.revision, updatedBy: row.updated_by_name, updatedAt: row.updated_at,
  ...(admin ? { sharedUserIds: row.shared_user_ids || [] } : {})
});
const asCredential = (row) => ({ clientId: row.client_id, sharedUserIds: row.shared_user_ids || [] });
const SELECT = 'SELECT c.*, cl.name AS client_name FROM vault.credentials c LEFT JOIN public."Client" cl ON cl.id = c.client_id';
// $1 = es admin, $2 = clientes que lleva como PM, $3 = su id.
const VISIBLE = '($1::boolean OR c.client_id = ANY($2::text[]) OR $3 = ANY(c.shared_user_ids))';
// Palabras de la petición, no de la cuenta: «la clave de capcut» busca CapCut.
const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'para', 'por', 'mi', 'tu', 'su', 'un', 'una', 'que', 'clave', 'claves', 'contrasena', 'contrasenas', 'password', 'acceso', 'accesos', 'usuario', 'cuenta']);
// Sin la extensión unaccent: se quitan las tildes con translate, a ambos lados.
const fold = (expr) => `translate(lower(coalesce(${expr},'')), 'áéíóúüñ', 'aeiouun')`;
// Dónde se busca: plataforma, nombre, plataformas de un bloque y cliente. Lo que no tiene cliente es de la
// agencia y responde a su nombre, junto o separado («brainstudio», «Brain Studio»).
const HAYSTACK = fold(`c.platform || ' ' || coalesce(c.label,'') || ' ' || array_to_string(c.platforms, ' ') || ' ' || coalesce(cl.name, CASE WHEN c.client_id IS NULL THEN 'agencia brain studio' ELSE '' END)`);
const MAX_PLATFORM_NAME = 40;
const MAX_PLATFORMS = 60;

export const createVaultRepository = ({ pool, key }) => {
  const transaction = async (work) => {
    const db = await pool.connect();
    try { await db.query('BEGIN'); const result = await work(db); await db.query('COMMIT'); return result; }
    catch (failure) { await db.query('ROLLBACK'); throw failure; }
    finally { db.release(); }
  };
  const scope = (actor) => [actor.role === 'ADMIN', actor.managedClientIds || [], actor.ref];
  const event = (db, id, revision, action, fields, actor, reason = null) => db.query(
    'INSERT INTO vault.credential_events(id,credential_id,revision,action,changed_fields,reason,actor_ref,actor_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [randomUUID(), id, revision, action, fields, reason, actor.ref, actor.name]
  );
  const locked = async (db, actor, id, expectedRevision) => {
    const row = (await db.query('SELECT * FROM vault.credentials WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!row || !canSeeCredential(actor, asCredential(row))) throw vaultError('No encontramos ese acceso.', 404, 'VAULT_NOT_FOUND');
    if (!canEditCredential(actor, asCredential(row))) throw vaultError('Ese acceso lo edita un administrador.', 403, 'VAULT_FORBIDDEN');
    if (row.status !== 'ACTIVE') throw vaultError('Ese acceso fue retirado.', 409, 'VAULT_RETIRED');
    if (expectedRevision != null && row.revision !== expectedRevision) throw vaultError('Ese acceso cambió mientras lo editabas. Recárgalo.', 409, 'VAULT_CHANGED');
    return row;
  };

  return {
    async list(actor, { clientId = null, query = '', limit = 200 } = {}) {
      const args = [...scope(actor)];
      const filters = ["c.status = 'ACTIVE'", VISIBLE];
      if (clientId) { args.push(clientId); filters.push(`c.client_id = $${args.length}`); }
      const words = (String(query || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).filter((word) => !STOPWORDS.has(word)).slice(0, 6);
      for (const word of words) {
        args.push(`%${word}%`);
        filters.push(`(${HAYSTACK} LIKE $${args.length} OR replace(${HAYSTACK}, ' ', '') LIKE $${args.length})`);
      }
      args.push(Math.min(Math.max(Number(limit) || 200, 1), 500));
      const sql = `${SELECT} WHERE ${filters.join(' AND ')} ORDER BY cl.name NULLS FIRST, c.platform, c.label LIMIT $${args.length}`;
      return (await pool.query(sql, args)).rows.map((row) => ({ ...present(row, { admin: actor.role === 'ADMIN' }), canEdit: canEditCredential(actor, asCredential(row)) }));
    },

    async get(actor, id) {
      const row = (await pool.query(`${SELECT} WHERE c.id = $4 AND ${VISIBLE}`, [...scope(actor), id])).rows[0];
      return present(row, { admin: actor.role === 'ADMIN' }) || null;
    },

    /** Muestra el acceso a quien puede verlo. Primero queda el registro; sin registro no hay valor. */
    async reveal(actor, id, via = 'BOVEDA') {
      if (!['BOVEDA', 'BRIA'].includes(via)) throw vaultError('Origen desconocido.');
      return transaction(async (db) => {
        const row = (await db.query("SELECT * FROM vault.credentials WHERE id=$1 AND status='ACTIVE'", [id])).rows[0];
        if (!row || !canSeeCredential(actor, asCredential(row))) throw vaultError('No encontramos ese acceso.', 404, 'VAULT_NOT_FOUND');
        await db.query('INSERT INTO vault.reveal_events(id,credential_id,via,actor_ref,actor_name) VALUES($1,$2,$3,$4,$5)', [randomUUID(), id, via, actor.ref, actor.name]);
        return {
          id, platform: row.platform, label: row.label, url: row.url, kind: row.kind,
          username: openSecret(row.username_enc, key, `${id}:username`),
          secret: openSecret(row.secret_enc, key, `${id}:secret`),
          notes: openSecret(row.notes_enc, key, `${id}:notes`)
        };
      });
    },

    async create(actor, input, { importKey = null, kind = 'ACCESO', source = 'MANUAL' } = {}) {
      const data = validateCredentialInput(input, { creating: true });
      if (!canEditCredential(actor, { clientId: data.clientId })) throw vaultError('Solo puedes guardar accesos de los clientes que llevas como PM.', 403, 'VAULT_FORBIDDEN');
      if (data.sharedUserIds?.length && actor.role !== 'ADMIN') throw vaultError('Compartir un acceso lo decide un administrador.', 403, 'VAULT_FORBIDDEN');
      const id = randomUUID();
      return transaction(async (db) => {
        const row = (await db.query(`INSERT INTO vault.credentials(id,client_id,platform,label,url,username_enc,secret_enc,notes_enc,shared_user_ids,kind,source,import_key,created_by_ref,created_by_name,updated_by_ref,updated_by_name)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$13,$14) ON CONFLICT(import_key) DO NOTHING RETURNING *`,
        [id, data.clientId, data.platform, data.label, data.url, sealSecret(data.username, key, `${id}:username`), sealSecret(data.secret, key, `${id}:secret`), sealSecret(data.notes, key, `${id}:notes`),
          data.sharedUserIds || [], kind, source, importKey, actor.ref, actor.name])).rows[0];
        if (!row) return { created: false, duplicate: true };
        await event(db, id, 1, source === 'IMPORT' ? 'IMPORT' : 'CREATE', Object.keys(data).filter((k) => data[k] != null && !(Array.isArray(data[k]) && !data[k].length)), actor);
        return { created: true, credential: present(row, { admin: actor.role === 'ADMIN' }) };
      });
    },

    async update(actor, id, expectedRevision, input) {
      const data = validateCredentialInput(input, { creating: false });
      if (data.sharedUserIds && actor.role !== 'ADMIN') throw vaultError('Compartir un acceso lo decide un administrador.', 403, 'VAULT_FORBIDDEN');
      return transaction(async (db) => {
        const before = await locked(db, actor, id, expectedRevision);
        if (Object.hasOwn(data, 'clientId') && data.clientId !== before.client_id && !canEditCredential(actor, { clientId: data.clientId })) throw vaultError('Solo puedes mover accesos a los clientes que llevas como PM.', 403, 'VAULT_FORBIDDEN');
        const sets = [], args = [id];
        const put = (column, value) => { args.push(value); sets.push(`${column} = $${args.length}`); };
        if (Object.hasOwn(data, 'clientId')) put('client_id', data.clientId);
        for (const field of ['platform', 'label', 'url']) if (Object.hasOwn(data, field)) put(field, data[field]);
        if (Object.hasOwn(data, 'username')) put('username_enc', sealSecret(data.username, key, `${id}:username`));
        if (Object.hasOwn(data, 'secret')) put('secret_enc', sealSecret(data.secret, key, `${id}:secret`));
        if (Object.hasOwn(data, 'notes')) put('notes_enc', sealSecret(data.notes, key, `${id}:notes`));
        if (Object.hasOwn(data, 'sharedUserIds')) put('shared_user_ids', data.sharedUserIds);
        if (!sets.length) return present(before);
        put('updated_by_ref', actor.ref); put('updated_by_name', actor.name);
        const row = (await db.query(`UPDATE vault.credentials SET ${sets.join(', ')}, revision = revision + 1, updated_at = now() WHERE id = $1 RETURNING *`, args)).rows[0];
        await event(db, id, row.revision, 'UPDATE', Object.keys(data), actor);
        return present(row, { admin: actor.role === 'ADMIN' });
      });
    },

    async retire(actor, id, expectedRevision, reason) {
      return transaction(async (db) => {
        await locked(db, actor, id, expectedRevision);
        const row = (await db.query("UPDATE vault.credentials SET status='RETIRED', revision=revision+1, updated_by_ref=$2, updated_by_name=$3, updated_at=now() WHERE id=$1 RETURNING *", [id, actor.ref, actor.name])).rows[0];
        await event(db, id, row.revision, 'RETIRE', [], actor, String(reason || '').slice(0, 300) || null);
        return present(row);
      });
    },

    /**
     * Anota qué plataformas contiene un bloque importado, para que se pueda buscar por ellas. Solo nombres; no
     * cambia ningún valor ni la versión del acceso, y deja su evento. Solo administración.
     */
    async indexPlatforms(actor, importKey, platforms = []) {
      if (actor.role !== 'ADMIN') throw vaultError('El índice de la bóveda lo prepara un administrador.', 403, 'VAULT_FORBIDDEN');
      const seen = new Set();
      const names = [];
      for (const raw of platforms) {
        const name = String(raw || '').replace(/\s+/g, ' ').trim();
        const id = name.toLowerCase();
        if (!name || name.length > MAX_PLATFORM_NAME || seen.has(id)) continue;
        seen.add(id); names.push(name);
      }
      return transaction(async (db) => {
        const row = (await db.query("UPDATE vault.credentials SET platforms = $2 WHERE import_key = $1 AND source = 'IMPORT' RETURNING id, revision", [importKey, names.slice(0, MAX_PLATFORMS)])).rows[0];
        if (!row) return false;
        await event(db, row.id, row.revision, 'UPDATE', ['platforms'], actor, 'Índice de plataformas del bloque');
        return true;
      });
    },

    /** Quién vio este acceso y cuándo. Solo administración. */
    async reveals(actor, id) {
      if (actor.role !== 'ADMIN') throw vaultError('El historial de lecturas lo ve un administrador.', 403, 'VAULT_FORBIDDEN');
      return (await pool.query('SELECT via, actor_name AS persona, recorded_at AS fecha FROM vault.reveal_events WHERE credential_id=$1 ORDER BY recorded_at DESC LIMIT 200', [id])).rows;
    }
  };
};
