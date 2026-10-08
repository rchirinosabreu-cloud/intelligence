// Local research adapter. PostgreSQL remains the application's production database.
// Corpus and review state stay outside the repository, in the owner's private research directory.
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canUseBria, sourceVisible, publicEvidence, reconcileSignals, changeSignalState } from '../lib/briaLivingMemory.js';

const deny = () => Object.assign(new Error('Bria no está activada para tu cuenta.'), { status: 403, code: 'BRIA_DISABLED' });
const words = (text) => String(text || '').normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu)?.slice(0, 12) || [];
const stop = new Set(['que', 'qué', 'cómo', 'para', 'con', 'las', 'los', 'del', 'una', 'por', 'hay', 'quiero', 'dame', 'sobre']);

export const createBriaResearchRepository = ({ directory, grants = {} }) => {
  const database = new DatabaseSync(path.join(directory, 'private-research-search.sqlite'), { readOnly: true });
  const statePath = path.join(directory, 'bria-living-review-state.json');
  let queue = Promise.resolve();
  const check = (user) => { if (!canUseBria(user)) throw deny(); };
  const rowAccess = (row, user) => sourceVisible({ ...row, allowedUserIds: grants[row.id] || [] }, user);
  const state = async () => { try { return JSON.parse(await readFile(statePath, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } };
  const observations = async () => {
    const { findings } = JSON.parse(await readFile(path.join(directory, 'reviewed-findings.json'), 'utf8'));
    return findings.map((finding) => ({
      id: finding.id, entity: finding.entity, title: finding.briaOpportunity,
      claim: finding.claim, qualification: finding.qualification,
      sourceIds: finding.sources.map((id) => `drive:${id}`),
      evidenceVersion: createHash('sha256').update(JSON.stringify({ finding, sourceVersions: finding.sources.map((id) => database.prepare('SELECT digest FROM sources WHERE id=?').get(`drive:${id}`)?.digest || 'unavailable') })).digest('hex'),
      category: 'Validación documental', status: 'OPEN'
    }));
  };
  const inbox = async (user) => {
    check(user);
    const rows = reconcileSignals(await state(), await observations());
    return rows.filter((row) => row.sourceIds.every((id) => {
      const source = database.prepare('SELECT id,status FROM sources WHERE id=?').get(id);
      return source && rowAccess(source, user);
    })).map((row) => ({ ...row, sources: row.sourceIds.map((id) => publicEvidence(database.prepare('SELECT * FROM sources WHERE id=?').get(id))) }));
  };
  return {
    async overview(user) {
      check(user);
      if (user.role !== 'ADMIN') return { scope: 'Fuentes habilitadas para tu cuenta', indexed: Object.values(grants).filter((ids) => ids.includes(user.userId || user.id)).length, automaticSync: false };
      const status = Object.fromEntries(database.prepare('SELECT status,count(*) AS n FROM sources GROUP BY status').all().map((r) => [r.status, r.n]));
      const kinds = database.prepare("SELECT kind,count(*) AS n FROM sources WHERE status='indexed' GROUP BY kind").all();
      return { scope: 'Toda la agencia · social.brainstudio@gmail.com', indexed: status.indexed || 0, restricted: status.private_review_required || 0, withoutText: status.empty_or_parser_exception || 0, kinds, automaticSync: false, asOf: '2026-10-07', comprehension: 'Lectura recopilada; validación del negocio en curso' };
    },
    async search(user, query) {
      check(user);
      const terms = words(query).filter((word) => !stop.has(word.toLowerCase()));
      if (!terms.length) return [];
      const match = terms.map((word) => `"${word}"`).join(' OR ');
      // Filter BEFORE ranking/limiting, so inaccessible titles, counts and snippets never escape.
      const allowed = Object.entries(grants).filter(([, ids]) => ids.includes(user.userId || user.id)).map(([id]) => id);
      if (user.role !== 'ADMIN' && !allowed.length) return [];
      const acl = user.role === 'ADMIN' ? '' : ` AND s.id IN (${allowed.map(() => '?').join(',')})`;
      const rows = database.prepare(`SELECT s.*, snippet(searchable,2,'','', ' … ',90) AS excerpt FROM searchable JOIN sources s ON s.id=searchable.id WHERE searchable MATCH ? AND s.status='indexed'${acl} ORDER BY bm25(searchable,0,8,1) LIMIT 8`).all(match, ...(user.role === 'ADMIN' ? [] : allowed));
      return rows.filter((row) => rowAccess(row, user)).map((row) => publicEvidence(row));
    },
    async read(user, id, offset = 0) {
      check(user);
      const row = database.prepare('SELECT * FROM sources WHERE id=?').get(String(id));
      if (!row || !rowAccess(row, user)) return null;
      const start = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
      const body = database.prepare('SELECT body FROM searchable WHERE id=?').get(row.id)?.body || '';
      return { ...publicEvidence({ ...row, excerpt: body.slice(start, start + 1800) }), offset: start, nextOffset: start + 1800 < body.length ? start + 1800 : null };
    },
    inbox,
    async review(user, id, status) {
      check(user);
      // Chain writes to prevent two requests overwriting one another.
      const action = queue.then(async () => {
        const visible = await inbox(user);
        if (!visible.some((row) => row.id === id)) throw Object.assign(new Error('Hallazgo no disponible.'), { status: 404 });
        const next = changeSignalState(reconcileSignals(await state(), await observations()), id, status);
        await writeFile(`${statePath}.tmp`, JSON.stringify(next), { mode: 0o600 });
        await rename(`${statePath}.tmp`, statePath);
        return { id, status };
      });
      queue = action.catch(() => {});
      return action;
    },
    close() { database.close(); }
  };
};
