import prisma from '../lib/prisma.js';
import {
  approveBankMatch,
  listBankReconciliation,
  parseBankStatementPdf,
  persistBankStatementImport,
  sourceHashFor
} from '../services/bankReconciliationService.js';

const actorId = (req) => req.user?.id || req.user?.userId || null;

const sendError = (res, error, fallbackCode, fallbackMessage) => res.status(error.statusCode || 500).json({
  error: error.code || fallbackCode,
  message: error.statusCode ? error.message : fallbackMessage
});

export const previewBankStatement = async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'BANK_STATEMENT_REQUIRED', message: 'Selecciona un extracto bancario en PDF.' });
    const parsed = await parseBankStatementPdf(req.file.buffer, { year: Number(req.body?.year) || undefined });
    return res.json({ ...parsed, sourceFilename: req.file.originalname, sourceHash: sourceHashFor(req.file.buffer) });
  } catch (error) {
    console.error('[Bank reconciliation] Preview failed:', error.response?.data || error.message);
    return sendError(res, error, 'BANK_STATEMENT_PREVIEW_FAILED', 'No fue posible leer el extracto bancario.');
  }
};

export const importBankStatement = async (req, res) => {
  try {
    if (!req.file?.buffer || !req.body?.accountId) return res.status(400).json({ error: 'BANK_STATEMENT_INPUT_REQUIRED', message: 'Selecciona una cuenta y un extracto bancario.' });
    const parsed = await parseBankStatementPdf(req.file.buffer, { year: Number(req.body?.year) || undefined });
    const result = await persistBankStatementImport(prisma, {
      accountId: req.body.accountId,
      sourceFilename: req.file.originalname,
      sourceHash: sourceHashFor(req.file.buffer)
    }, parsed, actorId(req));
    return res.status(201).json({ message: 'Extracto importado para revisión.', ...result });
  } catch (error) {
    console.error('[Bank reconciliation] Import failed:', error.response?.data || error.message);
    return sendError(res, error, 'BANK_STATEMENT_IMPORT_FAILED', 'No fue posible importar el extracto bancario.');
  }
};

export const getBankReconciliation = async (req, res) => {
  try {
    return res.json(await listBankReconciliation(prisma, Number(req.query.year) || 2026));
  } catch (error) {
    console.error('[Bank reconciliation] List failed:', error.response?.data || error.message);
    return res.status(500).json({ error: 'BANK_RECONCILIATION_LIST_FAILED', message: 'No fue posible cargar la conciliación bancaria.' });
  }
};

export const approveBankReconciliationMatch = async (req, res) => {
  try {
    const match = await approveBankMatch(prisma, req.params.id, req.user);
    return res.json({ message: 'Coincidencia aprobada y cuenta vinculada.', matchId: match.id });
  } catch (error) {
    console.error('[Bank reconciliation] Approval failed:', error.response?.data || error.message);
    return sendError(res, error, 'BANK_MATCH_APPROVAL_FAILED', 'No fue posible aprobar la coincidencia.');
  }
};
