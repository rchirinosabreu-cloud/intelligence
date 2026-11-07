import prisma from '../lib/prisma.js';
import { barterContext, assignBarterDestination, reverseBarter } from '../services/financialBarterService.js';
const handle = operation => async (req, res, dependencies = {}) => {
  try { return res.json(await operation(dependencies.prismaClient || prisma, req)); }
  catch (error) { const status = error.statusCode || 500; return res.status(status).json({ error: error.code || 'BARTER_FAILED', message: status >= 500 ? 'No pudimos confirmar el canje. Reintenta con la misma solicitud para evitar duplicarlo.' : error.message }); }
};
export const barterOptionsHandler = handle((db, req) => barterContext(db, { receivableId: req.params.id }, req.user));
export const readBarterHandler = handle((db, req) => barterContext(db, { paymentId: req.params.paymentId }, req.user));
export const assignBarterHandler = handle((db, req) => assignBarterDestination(db, req.params.paymentId, req.body || {}, req.user));
export const reverseBarterHandler = handle((db, req) => reverseBarter(db, req.params.paymentId, req.body || {}, req.user));
