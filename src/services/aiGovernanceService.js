import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { validateRecord, authorizationDecision, incidentDeadline, governanceError } from '../lib/aiGovernance.js';

const tables = Object.freeze({ systems: 'AiGovernanceSystem', risks: 'AiGovernanceRisk', authorizations: 'AiGovernanceAuthorization', incidents: 'AiGovernanceIncident' });
const tableFor = kind => { if (!Object.hasOwn(tables, kind)) throw governanceError('Registro desconocido.', 404); return `"${tables[kind]}"`; };
const present = row => row && ({ ...row, data: { ...row.data, ownerId: row.ownerId } });
let productionService;
export const getGovernanceService = () => productionService ||= createGovernanceService({ pool: new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }) });

export function createGovernanceService({ pool, clock = () => new Date() }) {
  async function admin(db, id) {
    const { rows } = await db.query(`SELECT u.id FROM "User" u JOIN "TeamMember" t ON t."userId"=u.id WHERE u.id=$1 AND u.role='ADMIN' AND u."isActive"=true AND t."isActive"=true`, [id]);
    if (!rows.length) throw governanceError('Solo administradores activos pueden gestionar este registro.', 403, 'GOVERNANCE_FORBIDDEN');
  }
  async function transaction(work) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      // Serialize the small governance control plane: saves, revocations and policy activation.
      await db.query('SELECT pg_advisory_xact_lock(20260923,9)');
      const result = await work(db); await db.query('COMMIT'); return result;
    } catch (error) {
      await db.query('ROLLBACK').catch(e => console.error('[Governance] rollback:', e.message));
      throw error;
    } finally { db.release(); }
  }
  async function audit(db, { kind, id, actorId = null, action, reason, before = null, after }) {
    await db.query(`INSERT INTO "AiGovernanceEvent" (id,"entityType","entityId","actorId",action,reason,"before","after") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(), kind, id, actorId, action, reason, before, after]);
  }
  async function row(db, kind, id) { return present((await db.query(`SELECT * FROM ${tableFor(kind)} WHERE id=$1`, [id])).rows[0]); }
  const reasonOf = input => {
    if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 1000) throw governanceError('Indica el motivo del cambio (máximo 1000 caracteres).');
    return input.reason.trim();
  };
  const service = {
    async list(actorId, kind, { page = 1 } = {}) {
      const table = tableFor(kind); await admin(pool, actorId);
      if (!Number.isSafeInteger(Number(page)) || Number(page) < 1 || Number(page) > 100000) throw governanceError('Página inválida.');
      const records = (await pool.query(`SELECT * FROM ${table} ORDER BY "createdAt" DESC,id DESC LIMIT 26 OFFSET $1`, [(Number(page) - 1) * 25])).rows;
      return { page: Number(page), hasMore: records.length > 25, items: records.slice(0, 25).map(raw => {
        const item = present(raw);
        if (kind === 'incidents') {
          item.notificationOverdue = !item.data.notifiedAt && +clock() > +new Date(item.notificationDueAt);
          item.notifiedLate = Boolean(item.data.notifiedAt && +new Date(item.data.notifiedAt) > +new Date(item.notificationDueAt));
        }
        return item;
      }) };
    },
    async options(actorId) {
      await admin(pool, actorId);
      const clients = (await pool.query('SELECT id,name FROM "Client" ORDER BY name,id')).rows;
      const people = (await pool.query('SELECT u.id,u.name FROM "User" u JOIN "TeamMember" t ON t."userId"=u.id WHERE u."isActive"=true AND t."isActive"=true ORDER BY u.name')).rows;
      const systems = (await pool.query('SELECT id,name,status,version FROM "AiGovernanceSystem" ORDER BY name,id')).rows;
      const risks = (await pool.query('SELECT id,name,status,"clientId","systemId",version FROM "AiGovernanceRisk" ORDER BY name,id')).rows;
      const policies = (await pool.query('SELECT * FROM "AiGovernanceClientPolicy"')).rows;
      return { clients, people, systems, risks, policies, coverage: ['parrillas.review'], unscopedEgressPolicy: 'BLOCK_WHEN_ANY_CLIENT_PROTECTED' };
    },
    async save(actorId, kind, id, input) {
      const table = tableFor(kind);
      return transaction(async db => {
        await admin(db, actorId);
        const current = id ? await row(db, kind, id) : null;
        if (id && !current) throw governanceError('Registro no encontrado.', 404);
        if (current && input.expectedVersion !== current.version) throw governanceError('El registro cambió. Recarga antes de guardar.', 409, 'GOVERNANCE_VERSION_CONFLICT');
        const reason = current ? reasonOf(input) : (input.reason ? reasonOf(input) : 'Registro inicial');
        // Approval evidence is immutable. A replacement needs a new authorization.
        if (kind === 'authorizations' && current?.status === 'REVOKED') throw governanceError('La autorización revocada se conserva; crea una nueva.', 409);
        if (kind === 'authorizations' && current?.status === 'APPROVED') {
          if (input.status !== 'REVOKED') throw governanceError('Una autorización aprobada solo puede revocarse. Crea una nueva para cambiar su alcance.', 409);
          const next = present((await db.query(`UPDATE ${table} SET status='REVOKED',version=version+1,"updatedAt"=NOW() WHERE id=$1 RETURNING *`, [id])).rows[0]);
          await audit(db, { kind, id, actorId, action: 'REVOKED', reason, before: current, after: next }); return next;
        }
        const validated = validateRecord(kind, input, { now: clock() });
        const { ownerId, ...data } = validated.data;
        if (!current || ownerId !== current.ownerId) {
          if (!(await db.query('SELECT u.id FROM "User" u JOIN "TeamMember" t ON t."userId"=u.id WHERE u.id=$1 AND u."isActive"=true AND t."isActive"=true', [ownerId])).rows.length) throw governanceError('El responsable debe pertenecer al equipo activo.');
        }
        const values = { name: validated.name, status: validated.status, ownerId, data };
        if (kind !== 'systems') {
          values.clientId = input.clientId || null;
          if ((kind !== 'incidents' && !values.clientId) || (values.clientId && !(await db.query('SELECT id FROM "Client" WHERE id=$1', [values.clientId])).rows.length)) throw governanceError('Selecciona un cliente válido.');
        }
        if (['risks', 'authorizations'].includes(kind)) {
          values.systemId = input.systemId;
          const system = await row(db, 'systems', values.systemId);
          if (!system) throw governanceError('Selecciona un sistema registrado.');
          if (kind === 'authorizations') {
            values.riskId = input.riskId;
            const risk = await row(db, 'risks', values.riskId);
            if (!risk || risk.clientId !== values.clientId || risk.systemId !== values.systemId) throw governanceError('La evaluación debe corresponder al mismo cliente y sistema.');
            if (values.status === 'APPROVED') {
              data.systemVersion = system.version; data.riskVersion = risk.version;
              const decision = authorizationDecision({ authorization: { ...values }, system, risk, context: { clientId: values.clientId, provider: system.data.provider, model: system.data.model, useCase: data.useCase, dataClasses: data.dataClasses }, now: new Date(Math.max(+clock(), +new Date(data.startsAt))) });
              if (!decision.allowed) throw governanceError(decision.reason);
              if (data.dataClasses.some(c => !system.data.dataClasses.includes(c))) throw governanceError('Datos fuera del alcance del sistema aprobado.');
            }
          }
        }
        if (kind === 'incidents') {
          if (current && data.detectedAt !== current.data.detectedAt) throw governanceError('La fecha de conocimiento es inmutable; registra la aclaración en la descripción.', 409);
          const deadline = incidentDeadline(data);
          if (current && +deadline > +new Date(current.notificationDueAt)) throw governanceError('No se puede extender el plazo original de notificación.', 409);
          values.notificationDueAt = deadline;
          if (current?.data.notifiedAt && (data.notifiedAt !== current.data.notifiedAt || data.notificationEvidence !== current.data.notificationEvidence)) throw governanceError('La evidencia de notificación registrada se conserva.', 409);
        }
        const keys = Object.keys(values);
        const recordId = id || randomUUID();
        const query = id
          ? `UPDATE ${table} SET ${keys.map((k, i) => `"${k}"=$${i + 2}`).join(',')},version=version+1,"updatedAt"=NOW() WHERE id=$1 RETURNING *`
          : `INSERT INTO ${table} (id,${keys.map(k => `"${k}"`).join(',')}) VALUES ($1,${keys.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`;
        const next = present((await db.query(query, [recordId, ...Object.values(values)])).rows[0]);
        await audit(db, { kind, id: recordId, actorId, action: id ? 'UPDATED' : 'CREATED', reason, before: current, after: next });
        return next;
      });
    },
    async history(actorId, kind, id) {
      tableFor(kind); await admin(pool, actorId);
      return (await pool.query('SELECT * FROM "AiGovernanceEvent" WHERE "entityType"=$1 AND "entityId"=$2 ORDER BY "createdAt" DESC,id DESC', [kind, id])).rows;
    },
    async setPolicy(actorId, clientId, input) {
      return transaction(async db => {
        await admin(db, actorId); const reason = reasonOf(input);
        if (typeof input.enabled !== 'boolean') throw governanceError('Indica activar o desactivar.');
        if (!(await db.query('SELECT id FROM "Client" WHERE id=$1', [clientId])).rows.length) throw governanceError('Cliente no encontrado.', 404);
        const before = (await db.query('SELECT * FROM "AiGovernanceClientPolicy" WHERE "clientId"=$1', [clientId])).rows[0];
        if (input.expectedVersion !== (before?.version || 0)) throw governanceError('La política cambió. Recarga.', 409);
        const after = (await db.query(`INSERT INTO "AiGovernanceClientPolicy" ("clientId",enabled) VALUES ($1,$2) ON CONFLICT ("clientId") DO UPDATE SET enabled=$2,version="AiGovernanceClientPolicy".version+1,"updatedAt"=NOW() RETURNING *`, [clientId, input.enabled])).rows[0];
        await audit(db, { kind: 'policy', id: clientId, actorId, action: 'POLICY_CHANGED', reason, before: before || null, after });
        return after;
      });
    },
    async policy(clientId) {
      if (!clientId) throw governanceError('No se pudo identificar al cliente antes del envío a IA.', 403, 'AI_SCOPE_REQUIRED');
      return (await pool.query('SELECT * FROM "AiGovernanceClientPolicy" WHERE "clientId"=$1', [clientId])).rows[0] || { clientId, enabled: false, version: 0 };
    },
    async assertEgress(context) {
      if (context.clientId && context.useCase) return service.assertUse(context);
      const { rows } = await pool.query('SELECT EXISTS (SELECT 1 FROM "AiGovernanceClientPolicy" WHERE enabled=true) AS enabled');
      if (!rows[0]?.enabled) return { allowed: true, enforced: false };
      await audit(pool, { kind: 'egress', id: 'unscoped', action: 'BLOCKED', reason: 'Existe una empresa protegida y no se puede delimitar el alcance del envío.', after: { provider: context.provider, model: context.model, useCase: context.useCase || null } });
      throw governanceError('Uso de IA bloqueado: hay una empresa protegida y este flujo no identifica de forma segura al cliente y su finalidad. Revisa Gobierno de IA.', 403, 'AI_SCOPE_REQUIRED');
    },
    async assertUse(context) {
      const policy = await service.policy(context.clientId);
      if (!policy.enabled) return { allowed: true, enforced: false };
      const records = (await pool.query(`SELECT a.*,to_jsonb(s) AS system,to_jsonb(r) AS risk FROM "AiGovernanceAuthorization" a JOIN "AiGovernanceSystem" s ON s.id=a."systemId" JOIN "AiGovernanceRisk" r ON r.id=a."riskId" WHERE a."clientId"=$1 AND a.status='APPROVED'`, [context.clientId])).rows;
      for (const a of records) {
        const decision = authorizationDecision({ authorization: a, system: a.system, risk: a.risk, context, now: clock() });
        if (decision.allowed) {
          await audit(pool, { kind: 'authorization-use', id: a.id, action: 'ALLOWED', reason: 'Validación previa al envío, no prueba de entrega.', after: { clientId: context.clientId, provider: context.provider, model: context.model, useCase: context.useCase, dataClasses: context.dataClasses, authorizationVersion: a.version } });
          return { ...decision, enforced: true };
        }
      }
      await audit(pool, { kind: 'policy', id: context.clientId, action: 'BLOCKED', reason: 'Sin autorización vigente para el alcance solicitado.', after: { clientId: context.clientId, provider: context.provider, model: context.model, useCase: context.useCase } });
      throw governanceError('Uso de IA bloqueado: falta autorización vigente para este cliente, sistema y finalidad. Revisa Gobierno de IA.', 403, 'AI_AUTHORIZATION_REQUIRED');
    }
  };
  return service;
}
