import prisma from '../lib/prisma.js';
import { getClientFinancialStatement } from '../services/financialClientStatementService.js';

export async function getClientFinancialStatementHandler(req, res, dependencies = {}) {
  try {
    const getStatement = dependencies.getStatement || getClientFinancialStatement;
    return res.json(await getStatement(dependencies.prismaClient || prisma, req.params.clientId, req.query || {}));
  } catch (error) {
    console.error('[Financial statement API] Read failed:', error.response?.data || error);
    const statusCode = Number(error.statusCode) || 500;
    return res.status(statusCode).json({ error: error.code || 'FINANCIAL_STATEMENT_FAILED', message: statusCode < 500 ? error.message : 'No fue posible cargar el estado de cuenta.' });
  }
}
