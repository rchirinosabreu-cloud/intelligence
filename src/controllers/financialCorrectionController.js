import prisma from '../lib/prisma.js';
import { listAccountStatement } from '../services/financialAccountStatementService.js';
import { readPaymentCorrection, correctExpensePayment } from '../services/financialPaymentCorrectionService.js';

const failure = (res, error) => {
  console.error('[Financial correction]', error.response?.data || error);
  const status = error.statusCode || 500;
  return res.status(status).json({ error: error.code || 'FINANCIAL_CORRECTION_FAILED', message: status >= 500 ? 'No fue posible completar la operación. Puedes volver a intentarlo.' : error.message });
};
export async function accountStatementHandler(req, res, dependencies = {}) {
  try { return res.json(await (dependencies.listAccountStatement || listAccountStatement)(dependencies.prismaClient || prisma, req.params.accountId, req.query)); }
  catch (error) { return failure(res, error); }
}
export async function paymentCorrectionContextHandler(req, res, dependencies = {}) {
  try { return res.json(await (dependencies.readPaymentCorrection || readPaymentCorrection)(dependencies.prismaClient || prisma, req.params.kind, req.params.paymentId, req.user)); }
  catch (error) { return failure(res, error); }
}
export async function paymentCorrectionHandler(req, res, dependencies = {}) {
  try { return res.json(await (dependencies.correctExpensePayment || correctExpensePayment)(dependencies.prismaClient || prisma, req.params.kind, req.params.paymentId, req.body || {}, req.user)); }
  catch (error) { return failure(res, error); }
}
