// Guarda y consulta la memoria de la agencia (ver `src/lib/briaAgencyFacts.js`). Toda lectura filtra por los
// propósitos que la persona puede ver **en la consulta**, antes del límite: un hecho que no le toca nunca
// sale de la base. Toda escritura deja su evento; nada se borra.

import { randomUUID } from 'node:crypto';
import {
  FACT_CERTAINTIES, canWriteFact, factDigest, factError, factKey, factVisible, planFactImport, validateFact
} from '../lib/briaAgencyFacts.js';

const STOP = new Set(['que', 'para', 'como', 'con', 'del', 'una', 'los', 'las', 'quien', 'tiene', 'desde', 'este', 'esta', 'mes', 'cual', 'cuales', 'sobre', 'hay', 'nos', 'les', 'por', 'pero', 'mas', 'muy', 'sus', 'son', 'fue', 'ser']);
const CERTAINTY_ORDER = `array_position(ARRAY[${FACT_CERTAINTIES.map((c) => `'${c}'`).join(',')}]::text[], f.certainty)`;
const searchTerms = (text) => (factKey(text).match(/[\p{L}\p{N}]{3,}/gu) || []).filter((word) => !STOP.has(word)).slice(0, 12);

const present = (row) => row && ({
  id: row.id, clientId: row.client_id, entity: row.entity, entityType: row.entity_type, topic: row.topic,
  statement: row.statement, certainty: row.certainty, purpose: row.purpose, sensitivity: row.sensitivity,
  validFrom: row.from_key, validUntil: row.until_key, observedOn: row.observed_key, asOf: row.as_of_key,
  sources: row.sources || [], origin: row.origin, status: row.status, supersededBy: row.superseded_by,
  digest: row.digest, revision: row.revision, actorName: row.actor_name, updatedAt: row.updated_at
});
const SELECT = `SELECT f.*, to_char(f.valid_from,'YYYY-MM-DD') AS from_key, to_char(f.valid_until,'YYYY-MM-DD') AS until_key,
  to_char(f.observed_on,'YYYY-MM-DD') AS observed_key, to_char(f.as_of,'YYYY-MM-DD') AS as_of_key FROM bria_memory.agency_facts f`;
const presentQuestion = (row) => row && ({
  id: row.id, clientId: row.client_id, entity: row.entity, question: row.question, why: row.why, who: row.who,
  priority: row.priority, purpose: row.purpose, relatedFactIds: row.related_fact_ids || [], status: row.status
});
// Visibilidad en SQL: $2 = propósitos legibles, $3 = propósitos legibles también en versión restringida.
const VISIBLE = "f.purpose = ANY($2::text[]) AND (f.sensitivity = 'normal' OR f.purpose = ANY($3::text[]))";

export const createBriaAgencyFactRepository = ({ pool, workspace }) => {
  if (!workspace) throw new Error('La memoria de la agencia necesita un espacio explícito.');
  const transaction = async (work) => {
    const db = await pool.connect();
    try { await db.query('BEGIN'); const result = await work(db); await db.query('COMMIT'); return result; }
    catch (failure) { await db.query('ROLLBACK'); throw failure; }
    finally { db.release(); }
  };
  const event = (db, factId, revision, action, before, after, actor, reason) => db.query(
    'INSERT INTO bria_memory.agency_fact_events(id,workspace,fact_id,revision,action,before_data,after_data,actor_ref,actor_name,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [randomUUID(), workspace, factId, revision, action, before, after, actor.ref, actor.name, String(reason || '').slice(0, 500)]
  );
  const insertFact = async (db, fact, { id, clientId, origin, asOf, actor, digest }) => (await db.query(
    `INSERT INTO bria_memory.agency_facts(workspace,id,client_id,entity,entity_key,entity_type,topic,statement,certainty,purpose,sensitivity,
       valid_from,valid_until,observed_on,as_of,sources,origin,digest,actor_ref,actor_name,terms)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
       setweight(to_tsvector('simple',$5),'A') || setweight(to_tsvector('simple',$21),'B') || to_tsvector('simple',$22)) RETURNING *`,
    [workspace, id, clientId || null, fact.entity, factKey(fact.entity), fact.entityType, fact.topic, fact.statement, fact.certainty, fact.purpose,
      fact.sensitivity, fact.validFrom, fact.validUntil, fact.observedOn, asOf || null, JSON.stringify(fact.sources || []), origin, digest,
      actor.ref, actor.name, factKey(fact.topic), factKey(fact.statement)]
  )).rows[0];

  return {
    workspace,

    /** Hechos vigentes de una cuenta o de un tema, ya filtrados por lo que la persona puede ver. */
    async search(access, { query = '', clientId = null, entity = null, topic = null, limit = 25 } = {}) {
      if (!access?.purposes?.length) return [];
      const args = [workspace, access.purposes, access.restricted];
      const filters = [];
      if (clientId) { args.push(clientId); filters.push(`f.client_id = $${args.length}`); }
      if (entity) { args.push(factKey(entity)); filters.push(`f.entity_key = $${args.length}`); }
      const words = searchTerms(query);
      let rank = 'NULL::real'; // Un literal numérico en ORDER BY sería una posición de columna.
      if (words.length) {
        // Por prefijo: «promo» encuentra «promogroup». Las palabras solo traen letras y números, así que la
        // consulta no admite operadores de quien escribe.
        args.push(words.map((word) => `${word}:*`).join(' | '));
        rank = `ts_rank(f.terms, to_tsquery('simple',$${args.length}))`;
        // Con cuenta elegida, las palabras ordenan; sin cuenta, también filtran.
        if (!filters.length) filters.push(`f.terms @@ to_tsquery('simple',$${args.length})`);
      }
      if (!filters.length) return [];
      if (topic) { args.push(topic); filters.push(`f.topic = $${args.length}`); }
      args.push(Math.min(Math.max(Number(limit) || 25, 1), 60));
      const rows = (await pool.query(`${SELECT} WHERE f.workspace = $1 AND f.status = 'ACTIVE' AND ${VISIBLE} AND (${filters.join(' AND ')})
        ORDER BY ${rank} DESC, ${CERTAINTY_ORDER}, f.updated_at DESC, f.id LIMIT $${args.length}`, args)).rows;
      return rows.map(present).filter((fact) => factVisible(fact, access));
    },

    async get(access, id) {
      const row = present((await pool.query(`${SELECT} WHERE f.workspace=$1 AND f.id=$2`, [workspace, id])).rows[0]);
      return factVisible(row, access) ? row : null;
    },

    /** Dudas abiertas de una cuenta, las más importantes y menos ofrecidas primero. Marca que se ofrecieron. */
    async openQuestions(access, { clientId = null, entity = null, limit = 3 } = {}) {
      if (!access?.purposes?.length || (!clientId && !entity)) return [];
      const args = [workspace, access.purposes, clientId, entity ? factKey(entity) : null, Math.min(Math.max(Number(limit) || 3, 1), 10)];
      const rows = (await pool.query(`UPDATE bria_memory.agency_questions q SET last_offered_at = now() WHERE q.workspace=$1 AND (q.workspace, q.id) IN (
          SELECT workspace, id FROM bria_memory.agency_questions WHERE workspace=$1 AND status='OPEN' AND purpose = ANY($2::text[])
            AND (($3::text IS NOT NULL AND client_id = $3) OR ($4::text IS NOT NULL AND entity_key = $4))
          ORDER BY array_position(ARRAY['alta','media','baja']::text[], priority), last_offered_at NULLS FIRST, id LIMIT $5)
        RETURNING q.*`, args)).rows;
      return rows.map(presentQuestion).sort((a, b) => ['alta', 'media', 'baja'].indexOf(a.priority) - ['alta', 'media', 'baja'].indexOf(b.priority));
    },

    /**
     * Carga una lectura del negocio. Idempotente: lo igual no cambia; lo nuevo entra; lo que cambió se
     * actualiza solo si nadie del equipo lo tocó. Las dudas ya respondidas o descartadas no reviven.
     */
    async importReading({ facts = [], questions = [], links = new Map(), asOf, actor, dryRun = false }) {
      const valid = facts.map((raw) => ({ ...validateFact(raw), id: String(raw.id) }));
      return transaction(async (db) => {
        const existing = (await db.query('SELECT id, origin, status, digest, client_id FROM bria_memory.agency_facts WHERE workspace=$1 AND id = ANY($2::text[]) FOR UPDATE', [workspace, valid.map((f) => f.id)])).rows;
        const plan = planFactImport(existing, valid);
        const linkOf = (fact) => links.get(fact.entity)?.clientId || null;
        const relinked = [];
        for (const fact of [...plan.unchanged, ...plan.keep]) {
          const old = existing.find((row) => row.id === fact.id);
          if (old.origin === 'LECTURA' && linkOf(fact) && old.client_id !== linkOf(fact)) relinked.push({ id: fact.id, clientId: linkOf(fact), before: old.client_id });
        }
        const qExisting = new Map((await db.query('SELECT id, status, digest FROM bria_memory.agency_questions WHERE workspace=$1 AND id = ANY($2::text[]) FOR UPDATE', [workspace, questions.map((q) => String(q.id))])).rows.map((row) => [row.id, row]));
        const qPlan = { create: [], update: [], keep: 0 };
        for (const q of questions) {
          const digest = factDigest({ entity: q.entidad, topic: q.prioridad, statement: q.pregunta, certainty: q.porQueImporta, purpose: q.proposito, sources: q.hechosRelacionados });
          const old = qExisting.get(String(q.id));
          if (!old) qPlan.create.push({ ...q, digest });
          else if (old.status === 'OPEN' && old.digest !== digest) qPlan.update.push({ ...q, digest });
          else qPlan.keep += 1;
        }
        const summary = { create: plan.create.length, update: plan.update.length, unchanged: plan.unchanged.length, keptByTeam: plan.keep.length, relinked: relinked.length, questions: { create: qPlan.create.length, update: qPlan.update.length, keep: qPlan.keep } };
        // En simulación solo se leyó: la transacción termina sin escribir nada.
        if (dryRun) return { ...summary, dryRun: true };
        for (const fact of plan.create) {
          const row = await insertFact(db, fact, { id: fact.id, clientId: linkOf(fact), origin: 'LECTURA', asOf, actor, digest: fact.digest });
          await event(db, fact.id, 1, 'IMPORT', null, present(row), actor, 'Lectura del negocio');
        }
        for (const fact of plan.update) {
          const before = present((await db.query(`${SELECT} WHERE f.workspace=$1 AND f.id=$2`, [workspace, fact.id])).rows[0]);
          const row = (await db.query(`UPDATE bria_memory.agency_facts SET client_id=$3, entity=$4, entity_key=$5, entity_type=$6, topic=$7, statement=$8, certainty=$9,
              purpose=$10, sensitivity=$11, valid_from=$12, valid_until=$13, observed_on=$14, as_of=$15, sources=$16, digest=$17, revision=revision+1, updated_at=now(),
              terms = setweight(to_tsvector('simple',$5),'A') || setweight(to_tsvector('simple',$18),'B') || to_tsvector('simple',$19)
            WHERE workspace=$1 AND id=$2 RETURNING *`, [workspace, fact.id, linkOf(fact) || before.clientId, fact.entity, factKey(fact.entity), fact.entityType, fact.topic, fact.statement,
            fact.certainty, fact.purpose, fact.sensitivity, fact.validFrom, fact.validUntil, fact.observedOn, asOf || null, JSON.stringify(fact.sources), fact.digest, factKey(fact.topic), factKey(fact.statement)])).rows[0];
          await event(db, fact.id, row.revision, 'IMPORT_UPDATE', before, present(row), actor, 'Nueva lectura del negocio');
        }
        for (const link of relinked) {
          const row = (await db.query('UPDATE bria_memory.agency_facts SET client_id=$3, revision=revision+1, updated_at=now() WHERE workspace=$1 AND id=$2 RETURNING *', [workspace, link.id, link.clientId])).rows[0];
          await event(db, link.id, row.revision, 'LINK', { clientId: link.before }, { clientId: link.clientId }, actor, 'Vínculo con la ficha del cliente');
        }
        for (const q of [...qPlan.create, ...qPlan.update]) {
          await db.query(`INSERT INTO bria_memory.agency_questions(workspace,id,client_id,entity,entity_key,question,why,who,priority,purpose,related_fact_ids,digest)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            ON CONFLICT(workspace,id) DO UPDATE SET client_id=EXCLUDED.client_id, entity=EXCLUDED.entity, entity_key=EXCLUDED.entity_key, question=EXCLUDED.question,
              why=EXCLUDED.why, who=EXCLUDED.who, priority=EXCLUDED.priority, purpose=EXCLUDED.purpose, related_fact_ids=EXCLUDED.related_fact_ids, digest=EXCLUDED.digest, updated_at=now()`,
          [workspace, String(q.id), links.get(q.entidad)?.clientId || null, q.entidad, factKey(q.entidad), String(q.pregunta).slice(0, 600), q.porQueImporta || null, q.quienResponde || null,
            q.prioridad, q.proposito, (q.hechosRelacionados || []).map(String), q.digest]);
        }
        return summary;
      });
    },

    /**
     * Lo que el equipo enseña o corrige conversando. Crea un hecho confirmado (o la certeza que la persona
     * diga), reemplaza los hechos que contradice sin borrarlos y, si responde una duda, la cierra.
     */
    async record({ actor, access, user, fact: raw, clientId = null, replaces = [], answersQuestion = null, reason }) {
      const fact = validateFact({ ...raw, certeza: raw.certeza ?? raw.certainty ?? 'CONFIRMADO' });
      if (!canWriteFact(user, fact)) throw factError('No puedes guardar este conocimiento: su propósito no está disponible para tu cuenta, o es de toda la agencia y lo confirma un administrador.', 403, 'BRIA_FACT_FORBIDDEN');
      return transaction(async (db) => {
        const replaced = [];
        for (const { id, revision } of replaces) {
          const before = present((await db.query(`${SELECT} WHERE f.workspace=$1 AND f.id=$2 FOR UPDATE`, [workspace, id])).rows[0]);
          if (!factVisible(before, access)) throw factError('Ese hecho no está disponible.', 404, 'BRIA_FACT_NOT_FOUND');
          if (before.status !== 'ACTIVE') throw factError('Ese hecho ya fue reemplazado o retirado. Vuelve a consultarlo.', 409, 'BRIA_FACT_CHANGED');
          if (revision != null && before.revision !== revision) throw factError('Ese hecho cambió mientras conversábamos. Vuelve a consultarlo.', 409, 'BRIA_FACT_CHANGED');
          replaced.push(before);
        }
        const id = `equipo-${randomUUID()}`;
        const link = clientId || replaced.find((row) => row.clientId)?.clientId || null;
        const row = present(await insertFact(db, fact, { id, clientId: link, origin: 'EQUIPO', asOf: null, actor, digest: factDigest(fact) }));
        await event(db, id, 1, replaced.length ? 'CORRECT' : 'CONFIRM', null, row, actor, reason || (replaced.length ? 'Corrección del equipo en conversación' : 'Enseñanza del equipo en conversación'));
        for (const before of replaced) {
          const after = (await db.query("UPDATE bria_memory.agency_facts SET status='SUPERSEDED', superseded_by=$3, revision=revision+1, updated_at=now() WHERE workspace=$1 AND id=$2 RETURNING revision", [workspace, before.id, id])).rows[0];
          await event(db, before.id, after.revision, 'SUPERSEDE', before, { ...before, status: 'SUPERSEDED', supersededBy: id, revision: after.revision }, actor, `Reemplazado por lo que dijo ${actor.name}`);
        }
        if (answersQuestion) {
          const answered = (await db.query(`UPDATE bria_memory.agency_questions SET status='ANSWERED', answer_fact_id=$3, answered_by_ref=$4, answered_by_name=$5, answered_at=now(), updated_at=now()
            WHERE workspace=$1 AND id=$2 AND status='OPEN' AND purpose = ANY($6::text[]) RETURNING id`, [workspace, answersQuestion, id, actor.ref, actor.name, access.purposes])).rows[0];
          if (!answered) throw factError('Esa duda ya no está abierta.', 409, 'BRIA_QUESTION_CLOSED');
        }
        return { fact: row, replaced: replaced.map((r) => r.id) };
      });
    },

    /** «Olvida eso»: el hecho deja de ser vigente; su historial se conserva. */
    async retire({ actor, access, user, id, revision, reason }) {
      return transaction(async (db) => {
        const before = present((await db.query(`${SELECT} WHERE f.workspace=$1 AND f.id=$2 FOR UPDATE`, [workspace, id])).rows[0]);
        if (!factVisible(before, access)) throw factError('Ese hecho no está disponible.', 404, 'BRIA_FACT_NOT_FOUND');
        if (!canWriteFact(user, before)) throw factError('Ese conocimiento lo retira un administrador.', 403, 'BRIA_FACT_FORBIDDEN');
        if (before.status !== 'ACTIVE' || (revision != null && before.revision !== revision)) throw factError('Ese hecho cambió. Vuelve a consultarlo.', 409, 'BRIA_FACT_CHANGED');
        const after = (await db.query("UPDATE bria_memory.agency_facts SET status='RETIRED', revision=revision+1, updated_at=now() WHERE workspace=$1 AND id=$2 RETURNING revision", [workspace, id])).rows[0];
        await event(db, id, after.revision, 'RETIRE', before, { ...before, status: 'RETIRED', revision: after.revision }, actor, reason || 'Retirado por el equipo');
        return { id, status: 'RETIRED' };
      });
    },

    async history(access, id) {
      const row = present((await pool.query(`${SELECT} WHERE f.workspace=$1 AND f.id=$2`, [workspace, id])).rows[0]);
      if (!factVisible(row, access)) throw factError('Ese hecho no está disponible.', 404, 'BRIA_FACT_NOT_FOUND');
      return (await pool.query('SELECT revision, action, before_data AS before, after_data AS after, actor_name AS author, reason, recorded_at AS at FROM bria_memory.agency_fact_events WHERE workspace=$1 AND fact_id=$2 ORDER BY revision DESC, recorded_at DESC', [workspace, id])).rows;
    },

    async status() {
      const facts = (await pool.query("SELECT status, origin, count(*)::int AS n FROM bria_memory.agency_facts WHERE workspace=$1 GROUP BY status, origin", [workspace])).rows;
      const questions = (await pool.query('SELECT status, count(*)::int AS n FROM bria_memory.agency_questions WHERE workspace=$1 GROUP BY status', [workspace])).rows;
      return { facts, questions };
    }
  };
};
