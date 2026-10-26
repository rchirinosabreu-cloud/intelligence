import prisma from '../lib/prisma.js';
import { createThirdParty, listPartyTeam, listThirdParties, updateThirdParty } from '../services/thirdPartyService.js';
import { createPayable, listPayablesLedger, payPayable, reversePayablePayment, updatePayable, voidPayable } from '../services/accountsPayableService.js';
import { attachPayableDocument, openPayableDocument } from '../services/payableDocumentService.js';
import { financialEvidenceStorage } from '../services/financialRecordDocumentService.js';
import { contentDisposition } from './financialRecordController.js';
import { linkProspectClient, listPartyCommercial } from '../services/quotationPartyService.js';

// Terceros y cuentas por pagar (20 de octubre de 2026). Cada manejador recibe sus dependencias para
// probarse sin base de datos, como el resto del módulo financiero.

const respondWithError = (res, error, fallbackCode, fallbackMessage) => {
    const statusCode = Number(error?.statusCode) || 500;
    return res.status(statusCode).json({ error: error?.code || fallbackCode, message: statusCode >= 500 ? fallbackMessage : error.message });
};

export const listThirdPartiesHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const list = dependencies.listThirdParties || listThirdParties;
    try { return res.json(await list(prismaClient, req.query || {})); } catch (error) {
        console.error('[Third parties API] List failed:', error.response?.data || error);
        return respondWithError(res, error, 'THIRD_PARTY_LIST_FAILED', 'No fue posible cargar los terceros.');
    }
};

// Lo comercial de los terceros: clientes potenciales y cotizaciones de cada cliente (punto 1 de la solicitud de Elisa).
export const listPartyCommercialHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const list = dependencies.listPartyCommercial || listPartyCommercial;
    try { return res.json(await list(prismaClient)); } catch (error) {
        console.error('[Third parties API] Commercial list failed:', error.response?.data || error);
        return respondWithError(res, error, 'PARTY_COMMERCIAL_LIST_FAILED', 'No fue posible cargar las cotizaciones de los terceros.');
    }
};

// El equipo activo para Terceros: cada persona es un tercero con el rol Colaborador (26 de octubre de 2026).
export const listPartyTeamHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const list = dependencies.listPartyTeam || listPartyTeam;
    try { return res.json(await list(prismaClient)); } catch (error) {
        console.error('[Third parties API] Team list failed:', error.response?.data || error);
        return respondWithError(res, error, 'PARTY_TEAM_LIST_FAILED', 'No fue posible cargar el equipo.');
    }
};

export const linkProspectClientHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const link = dependencies.linkProspectClient || linkProspectClient;
    try {
        const result = await link(prismaClient, req.params.leadId, req.body?.clientId, req.user);
        return res.json({ message: 'El cliente potencial quedó unido a su ficha de cliente, con sus cotizaciones.', ...result });
    } catch (error) {
        console.error('[Third parties API] Prospect link failed:', error.response?.data || error);
        return respondWithError(res, error, 'PROSPECT_LINK_FAILED', 'No fue posible unir el cliente potencial con su ficha.');
    }
};

export const createThirdPartyHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const create = dependencies.createThirdParty || createThirdParty;
    try {
        const thirdParty = await create(prismaClient, req.body || {}, req.user);
        return res.status(201).json({ message: `Tercero «${thirdParty.name}» guardado.`, thirdParty });
    } catch (error) {
        console.error('[Third parties API] Create failed:', error.response?.data || error);
        return respondWithError(res, error, 'THIRD_PARTY_CREATE_FAILED', 'No fue posible guardar el tercero.');
    }
};

export const updateThirdPartyHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const update = dependencies.updateThirdParty || updateThirdParty;
    try {
        const thirdParty = await update(prismaClient, req.params.id, req.body || {}, req.user);
        return res.json({ message: 'Tercero actualizado.', thirdParty });
    } catch (error) {
        console.error('[Third parties API] Update failed:', error.response?.data || error);
        return respondWithError(res, error, 'THIRD_PARTY_UPDATE_FAILED', 'No fue posible actualizar el tercero.');
    }
};

export const listPayablesLedgerHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const list = dependencies.listPayablesLedger || listPayablesLedger;
    try { return res.json(await list(prismaClient, req.query || {})); } catch (error) {
        console.error('[Payables API] Ledger failed:', error.response?.data || error);
        return respondWithError(res, error, 'PAYABLES_LEDGER_FAILED', 'No fue posible cargar las cuentas por pagar.');
    }
};

export const createPayableHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const create = dependencies.createPayable || createPayable;
    try {
        const payable = await create(prismaClient, req.body || {}, req.user);
        return res.status(201).json({ message: 'Cuenta por pagar registrada.', payable });
    } catch (error) {
        console.error('[Payables API] Create failed:', error.response?.data || error);
        return respondWithError(res, error, 'PAYABLE_CREATE_FAILED', 'No fue posible registrar la cuenta por pagar.');
    }
};

export const updatePayableHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const update = dependencies.updatePayable || updatePayable;
    try {
        const payable = await update(prismaClient, req.params.id, req.body || {}, req.user);
        return res.json({ message: 'Cuenta por pagar actualizada.', payable });
    } catch (error) {
        console.error('[Payables API] Update failed:', error.response?.data || error);
        return respondWithError(res, error, 'PAYABLE_UPDATE_FAILED', 'No fue posible actualizar la cuenta por pagar.');
    }
};

export const voidPayableHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const voidFn = dependencies.voidPayable || voidPayable;
    try {
        const payable = await voidFn(prismaClient, req.params.id, req.body?.reason, req.user);
        return res.json({ message: 'Cuenta por pagar anulada.', payable });
    } catch (error) {
        console.error('[Payables API] Void failed:', error.response?.data || error);
        return respondWithError(res, error, 'PAYABLE_VOID_FAILED', 'No fue posible anular la cuenta por pagar.');
    }
};

export const payPayableHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const pay = dependencies.payPayable || payPayable;
    try {
        const result = await pay(prismaClient, req.params.id, req.body || {}, req.user);
        return res.status(201).json({ message: result.outstanding === 0 ? 'Pago registrado. La cuenta quedó pagada.' : 'Pago registrado. El egreso quedó en Movimientos.', ...result });
    } catch (error) {
        console.error('[Payables API] Pay failed:', error.response?.data || error);
        return respondWithError(res, error, 'PAYABLE_PAYMENT_FAILED', 'No fue posible registrar el pago.');
    }
};

export const reversePayablePaymentHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const reverse = dependencies.reversePayablePayment || reversePayablePayment;
    try {
        const result = await reverse(prismaClient, req.params.paymentId, req.body?.reason, req.user);
        return res.json({ message: 'Pago revertido. Su egreso quedó anulado.', ...result });
    } catch (error) {
        console.error('[Payables API] Reverse failed:', error.response?.data || error);
        return respondWithError(res, error, 'PAYABLE_REVERSAL_FAILED', 'No fue posible revertir el pago.');
    }
};

export const uploadPayableDocumentHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const storage = dependencies.storage || financialEvidenceStorage();
    const attach = dependencies.attachDocument || attachPayableDocument;
    try {
        if (!req.file) return res.status(400).json({ error: 'FINANCIAL_DOCUMENT_REQUIRED', message: 'Selecciona un documento PDF, JPG o PNG.' });
        const document = await attach(prismaClient, storage, req.params.id, req.file, req.user);
        return res.status(201).json({ message: 'Soporte guardado.', document });
    } catch (error) {
        console.error('[Payables API] Document upload failed:', error.response?.data || error);
        return respondWithError(res, error, 'FINANCIAL_DOCUMENT_UPLOAD_FAILED', 'No fue posible guardar el soporte.');
    }
};

export const streamPayableDocumentHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const storage = dependencies.storage || financialEvidenceStorage();
    const open = dependencies.openDocument || openPayableDocument;
    try {
        const { document, object } = await open(prismaClient, storage, req.params.id, req.params.documentId);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        res.setHeader('Content-Type', document.mimeType);
        res.setHeader('Content-Disposition', contentDisposition(req.query?.download === '1' ? 'attachment' : 'inline', document.name));
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (object.ContentLength) res.setHeader('Content-Length', String(object.ContentLength));
        object.Body.on('error', (error) => {
            console.error('[Payables API] Document stream failed:', error);
            if (!res.headersSent) res.status(500).json({ error: 'FINANCIAL_DOCUMENT_STREAM_FAILED', message: 'No se pudo cargar el documento.' });
            else res.destroy(error);
        });
        return object.Body.pipe(res);
    } catch (error) {
        console.error('[Payables API] Document open failed:', error?.message || error);
        if (res.headersSent) return undefined;
        if (error?.name === 'NoSuchKey') return res.status(404).json({ error: 'FINANCIAL_DOCUMENT_MISSING', message: 'El archivo no está disponible en el almacenamiento.' });
        return respondWithError(res, error, 'FINANCIAL_DOCUMENT_OPEN_FAILED', 'No fue posible abrir el documento.');
    }
};
