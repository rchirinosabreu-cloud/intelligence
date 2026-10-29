import express from 'express';
import multer from 'multer';
import { receivesFiles } from '../../lib/uploadMarker.js';
import { getClientFinancialStatementHandler, streamClientStatementPdfHandler } from '../../controllers/financialClientStatementController.js';
import {
    getFinancialDashboard,
    createFinancialPayrollContract,
    getFinancialClientReconciliation,
    getFinancialPayrollLedger,
    getFinancialReceivablesLedger,
    linkFinancialClient,
    updateFinancialPayrollContract,
    updateFinancialReceivable
} from '../../controllers/financialController.js';
import {
    requireFinancialAccess,
    requireFinancialAdmin,
    requireFinancialApproval,
    requireFinancialWrite
} from '../../middlewares/authMiddleware.js';
import {
    closeFinancialPeriodHandler,
    approvePayrollTransactionHandler,
    createFinancialAccountHandler,
    createReceivableHandler,
    createReceivablePaymentHandler,
    createLoanHandler,
    deleteReceivableHandler,
    generatePayrollPeriodHandler,
    issueReceivableDocumentHandler,
    correctReceivableDocumentHandler,
    getFinancialExchangeRateHandler,
    createFinancialRecordHandler,
    listFinancialAccountsHandler,
    listFinancialPeriodsHandler,
    listFinancialRecordsHandler,
    payPayrollTransactionHandler,
    listPayrollPaymentCandidatesHandler,
    reversePayrollPaymentHandler,
    splitPayrollPaymentHandler,
    updatePayrollPaymentHandler,
    reopenFinancialPeriodHandler,
    replaceFinancialRecordAllocationsHandler,
    reverseReceivablePaymentHandler,
    updateReceivablePaymentHandler,
    settleReceivableHandler,
    streamReceivablePaymentDocumentHandler,
    uploadReceivablePaymentDocumentHandler,
    listReceivableAdjustmentsHandler,
    streamFinancialRecordDocumentHandler,
    streamReceivablePdfHandler,
    updateFinancialRecordHandler,
    uploadFinancialRecordDocumentHandler,
    voidFinancialRecordDocumentHandler,
    voidFinancialRecordHandler
} from '../../controllers/financialRecordController.js';
import { FINANCIAL_DOCUMENT_MAX_BYTES, financialEvidenceStorage } from '../../services/financialRecordDocumentService.js';
import { uploadMemoryStorage } from '../../lib/uploadStorage.js';
import prisma from '../../lib/prisma.js';
import { readCollectionSettings, saveCollectionSettings } from '../../services/collectionState.js';
import { listCollectionActivities, recordCollectionActivity } from '../../services/collectionActivityService.js';
import { contentDisposition } from '../../controllers/financialRecordController.js';
import {
    attachFormalizationContract, canManageFormalizations, linkFormalizationAdvance, listFormalizations, openFormalizationContract,
    registerFormalizationException, requireFormalizationAccess
} from '../../services/projectFormalizationService.js';

import {
    createDirectoryClientHandler,
    listClientDirectoryHandler,
    updateDirectoryClientHandler
} from '../../controllers/clientDirectoryController.js';
import {
    createPayableHandler,
    createThirdPartyHandler,
    linkProspectClientHandler,
    listPartyCommercialHandler,
    listPartyTeamHandler,
    listPayablesLedgerHandler,
    listThirdPartiesHandler,
    payPayableHandler,
    reversePayablePaymentHandler,
    streamPayableDocumentHandler,
    updatePayableHandler,
    updateThirdPartyHandler,
    uploadPayableDocumentHandler,
    voidPayableHandler
} from '../../controllers/accountsPayableController.js';

const router = express.Router();
// Supporting documents: one PDF/JPG/PNG per request, kept in memory only until it reaches the evidence bucket.
const documentUpload = multer({ storage: uploadMemoryStorage(), limits: { fileSize: FINANCIAL_DOCUMENT_MAX_BYTES, files: 1 } });
// Marcado con su campo: Bria lo manda desde el chat o WhatsApp con el archivo que llegó (22 de octubre de 2026).
const receiveFinancialDocument = receivesFiles((req, res, next) => documentUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'FINANCIAL_DOCUMENT_TOO_LARGE', message: 'El documento supera el máximo de 25 MB.' });
    }
    console.error('[Financial documents API] Upload rejected:', error.message);
    return res.status(400).json({ error: 'FINANCIAL_DOCUMENT_INVALID', message: 'No fue posible leer el documento enviado.' });
}), { field: 'file' });

router.get('/dashboard', requireFinancialAccess, getFinancialDashboard);
router.get('/accounts', requireFinancialAccess, listFinancialAccountsHandler);
router.post('/accounts', requireFinancialApproval, createFinancialAccountHandler);
router.get('/records', requireFinancialAccess, listFinancialRecordsHandler);
router.post('/records', requireFinancialWrite, createFinancialRecordHandler);
router.patch('/records/:id', requireFinancialWrite, updateFinancialRecordHandler);
router.post('/records/:id/void', requireFinancialWrite, voidFinancialRecordHandler);
router.put('/records/:id/allocations', requireFinancialWrite, replaceFinancialRecordAllocationsHandler);
router.post('/records/:id/documents', requireFinancialWrite, receiveFinancialDocument, uploadFinancialRecordDocumentHandler);
router.get('/records/:id/documents/:documentId/file', requireFinancialAccess, streamFinancialRecordDocumentHandler);
router.post('/records/:id/documents/:documentId/void', requireFinancialWrite, voidFinancialRecordDocumentHandler);
router.get('/periods', requireFinancialAccess, listFinancialPeriodsHandler);
router.post('/periods/close', requireFinancialApproval, closeFinancialPeriodHandler);
router.post('/periods/reopen', requireFinancialAdmin, reopenFinancialPeriodHandler);
router.get('/client-reconciliation', requireFinancialAccess, getFinancialClientReconciliation);
router.get('/clients/:clientId/statement', requireFinancialAccess, getClientFinancialStatementHandler);
// El estado de cuenta en PDF, a una fecha de corte (Rodny, 20 de octubre de 2026). Solo por la
// API autenticada, como el resto de los documentos financieros.
router.get('/clients/:clientId/statement/document', requireFinancialAccess, streamClientStatementPdfHandler);
// El directorio de clientes (30 de septiembre de 2026): la ficha completa de cada cliente,
// que mantiene quien lleva el financiero con su propio permiso, con auditoría.
router.get('/clients', requireFinancialAccess, listClientDirectoryHandler);
router.post('/clients', requireFinancialWrite, createDirectoryClientHandler);
router.patch('/clients/:id', requireFinancialWrite, updateDirectoryClientHandler);
router.patch('/client-links/:sourceClientId', requireFinancialWrite, linkFinancialClient);
router.get('/receivables-ledger', requireFinancialAccess, getFinancialReceivablesLedger);
router.patch('/receivables/:id', requireFinancialWrite, updateFinancialReceivable);
router.post('/receivables', requireFinancialWrite, createReceivableHandler);
// Eliminar una obligación tecleada por error o de prueba es trabajo de quien lleva el
// financiero: mismo permiso que crearla. La auditoría conserva la fila entera.
router.delete('/receivables/:id', requireFinancialWrite, deleteReceivableHandler);
// Emitir la cuenta de cobro: le pone número, congela sus conceptos y deja la
// obligación con el mismo total que se le manda al cliente.
router.post('/receivables/:id/issue', requireFinancialWrite, issueReceivableDocumentHandler);
// El PDF que se le manda al cliente. Solo por la API autenticada, nunca por una URL
// pública del bucket, como el resto de los documentos financieros.
router.get('/receivables/:id/document', requireFinancialAccess, streamReceivablePdfHandler);
// Corregir una cuenta ya emitida (Rodny, 30 de septiembre de 2026): conserva su número,
// ajusta conceptos y valor, y rehace el PDF sin borrar el que se había mandado.
router.put('/receivables/:id/document', requireFinancialWrite, correctReceivableDocumentHandler);
// TRM oficial para las cuentas de cobro en dólares; la misma fuente que Cotizaciones.
router.get('/exchange-rate', requireFinancialAccess, getFinancialExchangeRateHandler);
router.post('/receivables/:id/payments', requireFinancialWrite, createReceivablePaymentHandler);
// Saldar sin dinero (Rodny, 20 de octubre de 2026): acuerdo por menor valor, canje,
// compensación o condonación. Mismo permiso que registrar un pago; nunca crea un ingreso.
router.post('/receivables/:id/settlements', requireFinancialWrite, settleReceivableHandler);
// Resumen de ajustes de cartera (Rodny, 20 de octubre de 2026): cierres sin dinero y
// diferencia en cambio del periodo. Solo lee.
router.get('/receivable-adjustments', requireFinancialAccess, listReceivableAdjustmentsHandler);
// Los plazos de los avisos de cartera (punto 7 de la solicitud de Elisa, 28 de octubre de 2026): los ve quien entra a
// Financiero y los cambia solo un administrador (lo comprueba el servicio).
router.get('/collection-alerts', requireFinancialAccess, async (_req, res) => {
    try {
        res.json(await readCollectionSettings(prisma));
    } catch (error) {
        console.error('[Cartera] Plazos no leídos:', error?.message || error);
        res.status(500).json({ error: 'No pudimos cargar los plazos de los avisos de cartera.' });
    }
});
// Gestiones de cobro (28 de octubre de 2026): las ve quien entra a Financiero; las registra quien puede escribir.
router.get('/collection-activities', requireFinancialAccess, async (_req, res) => {
    try {
        res.json(await listCollectionActivities(prisma));
    } catch (error) {
        console.error('[Cartera] Gestiones no leídas:', error?.message || error);
        res.status(500).json({ error: 'No pudimos cargar las gestiones de cobro.' });
    }
});
router.post('/collection-activities', requireFinancialWrite, async (req, res) => {
    try {
        res.status(201).json(await recordCollectionActivity(prisma, { clientId: req.body?.clientId, channel: req.body?.channel }, req.user));
    } catch (error) {
        if (!error.statusCode) console.error('[Cartera] Gestión no guardada:', error?.message || error);
        res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'No pudimos guardar la gestión de cobro.' });
    }
});
router.put('/collection-alerts', requireFinancialAccess, async (req, res) => {
    try {
        res.json(await saveCollectionSettings(prisma, req.body, req.user));
    } catch (error) {
        if (!error.statusCode) console.error('[Cartera] Plazos no guardados:', error?.message || error);
        res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'No pudimos guardar los plazos de los avisos de cartera.' });
    }
});
// Formalización de proyectos (punto 3 de la solicitud de Elisa, 29 de octubre de 2026): solo Dirección y Administrativa
// y contable ven el contrato y las condiciones económicas, y solo ellas autorizan empezar sin el anticipo.
const formalizationAccess = requireFormalizationAccess(prisma);
const formalizationError = (res, error, fallback) => {
    if (!error.statusCode) console.error('[Formalización]', fallback, error?.message || error);
    const message = error.statusCode ? error.message : fallback;
    return res.status(error.statusCode || 500).json({ error: message, message });
};
router.get('/formalizations/access', requireFinancialAccess, async (req, res) => {
    try {
        res.json({ canManage: await canManageFormalizations(prisma, req.user) });
    } catch (error) {
        formalizationError(res, error, 'No pudimos comprobar tu acceso.');
    }
});
router.get('/formalizations', requireFinancialAccess, formalizationAccess, async (_req, res) => {
    try {
        res.json(await listFormalizations(prisma));
    } catch (error) {
        formalizationError(res, error, 'No pudimos cargar las formalizaciones.');
    }
});
router.post('/formalizations/:id/contract', requireFinancialAccess, formalizationAccess, receiveFinancialDocument, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Selecciona el contrato firmado: PDF, JPG o PNG.' });
        res.status(201).json(await attachFormalizationContract(prisma, financialEvidenceStorage(), req.params.id, req.file, req.user));
    } catch (error) {
        formalizationError(res, error, 'No pudimos guardar el contrato.');
    }
});
router.get('/formalizations/:id/documents/:documentId/file', requireFinancialAccess, formalizationAccess, async (req, res) => {
    try {
        const { document, object } = await openFormalizationContract(prisma, financialEvidenceStorage(), req.params.id, req.params.documentId);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        res.setHeader('Content-Type', document.mimeType);
        res.setHeader('Content-Disposition', contentDisposition(req.query?.download === '1' ? 'attachment' : 'inline', document.name));
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (object.ContentLength) res.setHeader('Content-Length', String(object.ContentLength));
        object.Body.on('error', (error) => {
            console.error('[Formalización] Contrato no enviado:', error?.message || error);
            if (!res.headersSent) res.status(500).json({ error: 'No se pudo cargar el contrato.' });
            else res.destroy(error);
        });
        return object.Body.pipe(res);
    } catch (error) {
        if (error?.name === 'NoSuchKey') return res.status(404).json({ error: 'El archivo no está disponible en el almacenamiento.' });
        return formalizationError(res, error, 'No pudimos abrir el contrato.');
    }
});
router.post('/formalizations/:id/exception', requireFinancialAccess, formalizationAccess, async (req, res) => {
    try {
        res.json(await registerFormalizationException(prisma, req.params.id, req.body || {}, req.user));
    } catch (error) {
        formalizationError(res, error, 'No pudimos guardar la autorización.');
    }
});
router.put('/formalizations/:id/advance', requireFinancialAccess, formalizationAccess, async (req, res) => {
    try {
        res.json(await linkFormalizationAdvance(prisma, req.params.id, req.body?.receivableId, req.user));
    } catch (error) {
        formalizationError(res, error, 'No pudimos ligar la cuenta del anticipo.');
    }
});
// Préstamos a terceros (Rodny, 20 de octubre de 2026): el egreso y la cuenta por cobrar de
// una vez; la devolución entra como reintegro por «Registrar pago» de siempre.
router.post('/loans', requireFinancialWrite, createLoanHandler);
// Corregir un abono mal registrado es parte del trabajo diario de quien lo registra:
// mismo permiso que crearlo, con motivo obligatorio y auditoría.
router.post('/receivable-payments/:paymentId/reverse', requireFinancialWrite, reverseReceivablePaymentHandler);
// El soporte de un ajuste de cartera: el certificado de una retención (22 de octubre de 2026).
router.post('/receivable-payments/:paymentId/documents', requireFinancialWrite, receiveFinancialDocument, uploadReceivablePaymentDocumentHandler);
router.get('/receivable-payments/:paymentId/documents/:documentId/file', requireFinancialAccess, streamReceivablePaymentDocumentHandler);
// Corregir un abono sin revertirlo (Rodny, 20 de octubre de 2026): valor, fecha, cuenta,
// referencia y notas, con motivo cuando cambia el dinero; su ingreso cambia con él.
router.patch('/receivable-payments/:paymentId', requireFinancialWrite, updateReceivablePaymentHandler);
// Terceros y cuentas por pagar (Rodny, 20 de octubre de 2026): el espejo de Cartera. Pagar crea el
// egreso en Movimientos ligado al pago; el soporte del tercero se guarda como evidencia.
router.get('/third-parties', requireFinancialAccess, listThirdPartiesHandler);
router.get('/parties/commercial', requireFinancialAccess, listPartyCommercialHandler);
router.get('/parties/team', requireFinancialAccess, listPartyTeamHandler);
router.post('/parties/prospects/:leadId/client', requireFinancialWrite, linkProspectClientHandler);
router.post('/third-parties', requireFinancialWrite, createThirdPartyHandler);
router.patch('/third-parties/:id', requireFinancialWrite, updateThirdPartyHandler);
router.get('/payables-ledger', requireFinancialAccess, listPayablesLedgerHandler);
router.post('/payables', requireFinancialWrite, createPayableHandler);
router.patch('/payables/:id', requireFinancialWrite, updatePayableHandler);
router.post('/payables/:id/void', requireFinancialWrite, voidPayableHandler);
router.post('/payables/:id/payments', requireFinancialWrite, payPayableHandler);
router.post('/payables/:id/documents', requireFinancialWrite, receiveFinancialDocument, uploadPayableDocumentHandler);
router.get('/payables/:id/documents/:documentId/file', requireFinancialAccess, streamPayableDocumentHandler);
router.post('/payable-payments/:paymentId/reverse', requireFinancialWrite, reversePayablePaymentHandler);
router.get('/payroll-ledger', requireFinancialAccess, getFinancialPayrollLedger);
router.post('/payroll-contracts', requireFinancialWrite, createFinancialPayrollContract);
router.patch('/payroll-contracts/:id', requireFinancialWrite, updateFinancialPayrollContract);
router.post('/payroll/periods', requireFinancialWrite, generatePayrollPeriodHandler);
router.post('/payroll-transactions/:id/approve', requireFinancialApproval, approvePayrollTransactionHandler);
router.post('/payroll-transactions/:id/pay', requireFinancialApproval, payPayrollTransactionHandler);
router.get('/payroll-transactions/:id/payment-candidates', requireFinancialAccess, listPayrollPaymentCandidatesHandler);
router.post('/payroll-payments/:paymentId/split', requireFinancialApproval, splitPayrollPaymentHandler);
router.post('/payroll-payments/:paymentId/reverse', requireFinancialApproval, reversePayrollPaymentHandler);
router.patch('/payroll-payments/:paymentId', requireFinancialWrite, updatePayrollPaymentHandler);

export default router;
