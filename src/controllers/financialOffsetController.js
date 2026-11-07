import prisma from '../lib/prisma.js';
import { offsetOptions, readOffset, reverseOffset } from '../services/financialOffsetService.js';

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
