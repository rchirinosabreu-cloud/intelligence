// Pedidos de acceso a un módulo en la base lateral (15 de octubre de 2026). Uno abierto por módulo y persona; una
// denegación reciente se respeta; decidir «reclama» la fila con una sola escritura condicional, así que dos
// administradores no deciden dos veces. Si dar acceso falla después de reclamarla, `release` la devuelve a pendiente.
import { randomUUID } from 'node:crypto';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { PERMISSION_DENIAL_DAYS } from '../lib/modulePermissionRequests.js';

const present = (row) => row && ({
  id: row.id, status: row.status, moduleKey: row.module_key, requesterRef: row.requester_ref, requesterName: row.requester_name,
  note: row.note || null, decidedByName: row.decided_by_name || null, decidedAt: row.decided_at || null, createdAt: row.created_at
});

export const createPermissionRequestRepository = ({ pool }) => ({
  async create({ moduleKey, requesterRef, requesterName, note = null }) {
    const denied = (await pool.query(`SELECT * FROM bria_memory.permission_requests WHERE module_key = $1 AND requester_ref = $2 AND status = 'DENIED' AND decided_at > now() - ($3::int * interval '1 day') ORDER BY decided_at DESC LIMIT 1`, [moduleKey, requesterRef, PERMISSION_DENIAL_DAYS])).rows[0];
    if (denied) return { created: false, deniedRecently: true, request: present(denied) };
    const inserted = (await pool.query(`INSERT INTO bria_memory.permission_requests(id, module_key, requester_ref, requester_name, note) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (module_key, requester_ref) WHERE status = 'PENDING' DO NOTHING RETURNING *`, [randomUUID(), moduleKey, requesterRef, requesterName, note])).rows[0];
    const row = inserted || (await pool.query("SELECT * FROM bria_memory.permission_requests WHERE module_key = $1 AND requester_ref = $2 AND status = 'PENDING'", [moduleKey, requesterRef])).rows[0];
    return { created: Boolean(inserted), request: present(row) };
  },
  async get(id) {
    return present((await pool.query('SELECT * FROM bria_memory.permission_requests WHERE id = $1', [id])).rows[0]) || null;
  },
  async pending() {
    return (await pool.query("SELECT * FROM bria_memory.permission_requests WHERE status = 'PENDING' ORDER BY created_at LIMIT 20")).rows.map(present);
  },
  /** Reclama la decisión: solo si sigue pendiente. Devuelve null si otro ya decidió. */
  async claim(id, decision, actor) {
    const row = (await pool.query(`UPDATE bria_memory.permission_requests SET status = $2, decided_by_ref = $3, decided_by_name = $4, decided_at = now()
      WHERE id = $1 AND status = 'PENDING' RETURNING *`, [id, decision === 'APPROVE' ? 'APPROVED' : 'DENIED', actor.ref, actor.name])).rows[0];
    return present(row) || null;
  },
  async release(id) {
    await pool.query("UPDATE bria_memory.permission_requests SET status = 'PENDING', decided_by_ref = NULL, decided_by_name = NULL, decided_at = NULL WHERE id = $1 AND status = 'APPROVED'", [id]);
  },
  async answers(requesterRef) {
    return (await pool.query(`SELECT * FROM bria_memory.permission_requests WHERE requester_ref = $1 AND status IN ('APPROVED','DENIED') AND requester_seen_at IS NULL AND decided_at > now() - interval '7 days' ORDER BY decided_at DESC LIMIT 5`, [requesterRef])).rows.map(present);
  },
  async markSeen(requesterRef, id) {
    const { rowCount } = await pool.query("UPDATE bria_memory.permission_requests SET requester_seen_at = now() WHERE id = $1 AND requester_ref = $2 AND status IN ('APPROVED','DENIED')", [id, requesterRef]);
    return rowCount > 0;
  }
});

let instance;
export const getPermissionRequestRepository = () => instance ||= createPermissionRequestRepository({ pool: getSidecarPool() });
