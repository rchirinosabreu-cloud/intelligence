import prisma from '../lib/prisma.js';
import { contentDisposition } from './financialRecordController.js';
import { getClientFinancialStatement } from '../services/financialClientStatementService.js';
import { openClientStatementPdf } from '../services/clientStatementPdfService.js';

// El estado de cuenta en PDF (Rodny, 20 de octubre de 2026): el documento de seguimiento que
// se le manda al cliente, a la fecha de corte que se pida. Se genera al vuelo, no se guarda.
export async function streamClientStatementPdfHandler(req, res, dependencies = {}) {
  try {
    const openPdf = dependencies.openPdf || openClientStatementPdf;
    const { filename, buffer } = await openPdf(dependencies.prismaClient || prisma, req.params.clientId, req.query || {});
    const disposition = req.query?.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDisposition(disposition, filename));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(buffer.length));
    return res.end(buffer);
  } catch (error) {
    console.error('[Financial statement API] PDF failed:', error.response?.data || error);
    const statusCode = Number(error.statusCode) || 500;
    return res.status(statusCode).json({ error: error.code || 'FINANCIAL_STATEMENT_PDF_FAILED', message: statusCode < 500 ? error.message : 'No fue posible generar el estado de cuenta.' });
  }
}

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
