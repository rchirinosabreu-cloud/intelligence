import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { canValidateClientCriterion, criterionError } from '../lib/briaClientCriteria.js';
import { criterionContext } from './briaClientCriterionService.js';
import { createOpenAIClient } from './openAIClient.js';
import { collectCriterionSources, discoveryHash, criterionSourceBatches, buildCriterionDiscoveryRequest, parseCriterionSuggestions, hashDiscoveryValue, normalizedCriterion, DISCOVERY_VERSION } from './briaCriterionDiscoveryContract.js';

const LEASE_MS = 120000;
const lockClient = (tx, id) => tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text`;
const readSources = async (db, clientId) => collectCriterionSources(await db.contentPlan.findMany({
  where: { clientId, deletedAt: null }, orderBy: { id: 'asc' },
  select: { id: true, clientId: true, month: true, year: true, internalNotes: true,
    contentItems: { where: { deletedAt: null }, orderBy: { id: 'asc' }, select: { id: true, status: true, internalNotes: true, comments: true, copyText: true, captionText: true } } }
}), clientId);
const readCriteria = db => clientId => db.clientEditorialCriterion.findMany({ where: { clientId }, orderBy: { id: 'asc' },
  select: { id: true, category: true, text: true, status: true, scope: true, sourcePlanId: true, version: true } });
const publicStatus = row => row ? { state: row.state === 'RUNNING' && Date.now() - new Date(row.startedAt).getTime() >= LEASE_MS ? 'INTERRUPTED' : row.state,
  completedAt: row.completedAt, processedBatches: row.checkpoint?.nextBatch || 0, totalBatches: row.checkpoint?.totalBatches || 0,
  result: row.result, error: row.error } : { state: 'IDLE' };
const evidenceKey = proposal => hashDiscoveryValue({ scope: proposal.scope, plan: proposal.scope === 'PLAN' ? proposal.sourcePlanId : null,
  category: proposal.category, sources: proposal.provenance.evidence.map(e => [e.id, e.sourceHash]).sort() });

export const createCriterionDiscoveryService = ({ db = prisma, generate = async ({ sources, criteria, signal }) => createOpenAIClient().generate(buildCriterionDiscoveryRequest(sources, criteria, signal)), timeoutMs = 90000 } = {}) => ({
  async status({ planId, actorUserId }) {
    const { plan } = await criterionContext(db, planId, actorUserId);
    return publicStatus(await db.clientCriterionDiscovery.findUnique({ where: { clientId: plan.clientId } }));
  },
  async discover({ planId, actorUserId }) {
    const initial = await criterionContext(db, planId, actorUserId);
    if (!canValidateClientCriterion(initial.actor, initial.plan)) throw criterionError(403, 'Solo el responsable de esta parrilla, PM o admin pueden solicitar aprendizajes.');
    const clientId = initial.plan.clientId;
    const sources = await readSources(db, clientId), sourceHash = discoveryHash(sources), token = randomUUID();
    const batches = criterionSourceBatches(sources);
    const existing = await readCriteria(db)(clientId);
    // Never silently truncate the decision history sent to the model.
    if (JSON.stringify(existing).length > 60000) throw criterionError(422, 'El historial de criterios requiere revisión por lotes antes de buscar más aprendizajes.');
    const claim = await db.$transaction(async tx => {
      await lockClient(tx, clientId);
      const { plan, actor } = await criterionContext(tx, planId, actorUserId);
      if (plan.clientId !== clientId || !canValidateClientCriterion(actor, plan)) throw criterionError(403, 'El acceso a esta parrilla cambió.');
      const row = await tx.clientCriterionDiscovery.findUnique({ where: { clientId } });
      if (row?.state === 'RUNNING' && Date.now() - new Date(row.startedAt).getTime() < LEASE_MS) return { skip: true, row };
      if (row?.sourceHash === sourceHash && row.state === 'COMPLETED') return { skip: true, row };
      const checkpoint = row?.sourceHash === sourceHash && row.checkpoint?.criteriaHash === hashDiscoveryValue(existing) ? row.checkpoint : { nextBatch: 0, proposals: [], totalBatches: batches.length, criteriaHash: hashDiscoveryValue(existing) };
      const data = { sourceHash, state: 'RUNNING', leaseToken: token, startedAt: new Date(), completedAt: null, error: null, result: Prisma.DbNull, checkpoint };
      const updated = await tx.clientCriterionDiscovery.upsert({ where: { clientId }, create: { clientId, ...data }, update: data });
      return { row: updated, checkpoint };
    });
    if (claim.skip) return publicStatus(claim.row);
    const controller = new AbortController(); let timer;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { const error = criterionError(504, 'La búsqueda superó su tiempo máximo. Puedes continuar desde el último lote.'); controller.abort(error); reject(error); }, Math.min(timeoutMs, 90000)); });
    const checkOwned = async data => {
      const result = await db.clientCriterionDiscovery.updateMany({ where: { clientId, leaseToken: token, state: 'RUNNING' }, data });
      if (result.count !== 1) throw criterionError(409, 'Otra búsqueda sustituyó esta ejecución.');
    };
    const checkpoint = claim.checkpoint;
    try {
      for (let i = checkpoint.nextBatch; i < batches.length; i++) {
        const response = await Promise.race([generate({ sources: batches[i], criteria: existing, signal: controller.signal }), deadline]);
        controller.signal.throwIfAborted();
        checkpoint.proposals.push(...parseCriterionSuggestions(response.text, batches[i], existing).map(proposal => ({ ...proposal, provenance: { ...proposal.provenance, model: response.model || null } })));
        checkpoint.nextBatch = i + 1;
        await checkOwned({ checkpoint });
      }
      return await db.$transaction(async tx => {
        await lockClient(tx, clientId);
        await tx.$queryRaw`SELECT "id" FROM "ContentPlan" WHERE "clientId" = ${clientId} ORDER BY "id" FOR UPDATE`;
        const { actor, plan } = await criterionContext(tx, planId, actorUserId);
        if (plan.clientId !== clientId || !canValidateClientCriterion(actor, plan)) throw criterionError(403, 'El acceso a esta parrilla cambió.');
        const job = await tx.clientCriterionDiscovery.findUnique({ where: { clientId } });
        if (job?.leaseToken !== token || job.state !== 'RUNNING' || discoveryHash(await readSources(tx, clientId)) !== sourceHash) throw criterionError(409, 'Las fuentes cambiaron durante la búsqueda. Vuelve a buscar aprendizajes.');
        const current = await readCriteria(tx)(clientId);
        if (hashDiscoveryValue(current) !== hashDiscoveryValue(existing)) throw criterionError(409, 'Los criterios cambiaron durante la búsqueda. Vuelve a intentarlo.');
        const seen = new Set(job.seenKeys), texts = new Set(current.map(c => normalizedCriterion(c.text)));
        const available = 100 - current.filter(c => ['PROPOSED', 'APPROVED'].includes(c.status)).length;
        const proposals = checkpoint.proposals.filter(proposal => {
          const key = evidenceKey(proposal), text = normalizedCriterion(proposal.text);
          if (seen.has(key) || texts.has(text)) return false;
          seen.add(key); texts.add(text); return true;
        });
        if (proposals.length > available) throw criterionError(422, 'Revisa las propuestas pendientes antes de incorporar más aprendizajes.');
        const now = new Date();
        for (const proposal of proposals) {
          await tx.clientEditorialCriterion.create({ data: {
            clientId, sourcePlanId: proposal.sourcePlanId, requestId: randomUUID(), text: proposal.text, category: proposal.category, scope: proposal.scope,
            status: 'PROPOSED', provenance: { ...proposal.provenance, generatedAt: now.toISOString() },
            history: [{ action: 'PROPOSE', actorUserId: null, actorName: 'Bria', actorRole: 'AI', requestedById: actor.id, reason: proposal.reason, version: 1, planId: proposal.sourcePlanId, at: now.toISOString() }]
          } });
        }
        const result = { created: proposals.length, omittedDuplicates: checkpoint.proposals.length - proposals.length, sourceCount: sources.length, batches: batches.length, version: DISCOVERY_VERSION };
        return publicStatus(await tx.clientCriterionDiscovery.update({ where: { clientId }, data: {
          state: 'COMPLETED', leaseToken: null, completedAt: now, checkpoint: Prisma.DbNull, result, seenKeys: [...seen]
        } }));
      });
    } catch (error) {
      await db.clientCriterionDiscovery.updateMany({ where: { clientId, leaseToken: token }, data: {
        state: 'FAILED', leaseToken: null, error: error.status === 409 ? error.message : 'No se completó la búsqueda. Reintenta; se conservan los lotes compatibles.'
      } });
      throw error;
    } finally { clearTimeout(timer); controller.abort(); }
  }
});
