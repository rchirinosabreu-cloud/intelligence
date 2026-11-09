import { reviewPartyMerge, mergeParties, readPartyMerge, reversePartyMerge } from '../services/financialPartyMergeService.js';
import prisma from '../lib/prisma.js';
import { offsetOptions, readOffset, reverseOffset, legacyOffsetOptions, linkLegacyOffset } from '../services/financialOffsetService.js';

const handle = operation => async (req, res, dependencies = {}) => {
  try { return res.json(await operation(dependencies.prismaClient || prisma, req)); }
  catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.code || 'OFFSET_FAILED', message: status >= 500 ? 'No fue posible completar el cruce. Puedes reintentar sin duplicarlo.' : error.message });
  }
};
export const offsetOptionsHandler = handle((db, req) => offsetOptions(db, req.params.id, req.user));
export const readOffsetHandler = handle((db, req) => readOffset(db, req.params.paymentId, req.user));
export const reverseOffsetHandler = handle((db, req) => reverseOffset(db, req.params.paymentId, req.body || {}, req.user));

export const legacyOffsetOptionsHandler = handle((db, req) => legacyOffsetOptions(db, req.params.paymentId, req.user));
export const linkLegacyOffsetHandler = handle((db, req) => linkLegacyOffset(db, req.params.paymentId, req.body || {}, req.user));

export const reviewPartyMergeHandler = handle((db, req) => reviewPartyMerge(db, req.params.id, req.query.targetId, req.user));
export const mergePartiesHandler = handle((db, req) => mergeParties(db, req.params.id, req.body || {}, req.user));
export const readPartyMergeHandler = handle((db, req) => readPartyMerge(db, req.params.id, req.user));
export const reversePartyMergeHandler = handle((db, req) => reversePartyMerge(db, req.params.id, req.body || {}, req.user));
