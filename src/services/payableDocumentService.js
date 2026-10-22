import { randomUUID } from 'node:crypto';
import { FinancialDomainError } from './financialRecordService.js';
import { inspectFinancialDocument } from './financialRecordDocumentService.js';

// El soporte de una cuenta por pagar —la factura o la cuenta de cobro que mandó el tercero— vive en
// el mismo bucket de evidencia financiera que los comprobantes de un movimiento, con las mismas
// reglas: se detecta por sus bytes, se sirve solo por la API y nunca se borra; un error se anula.

const actorIdFrom = (actor) => actor?.id || actor?.userId || null;
const auditSnapshot = (value) => JSON.parse(JSON.stringify(value));

export const payableDocumentPublicFields = (document) => ({
    id: document.id, payableId: document.payableId, name: document.name, mimeType: document.mimeType, size: Number(document.size),
    sha256: document.sha256, uploadedById: document.uploadedById, uploadedAt: document.uploadedAt, voidedAt: document.voidedAt, voidReason: document.voidReason, voidedById: document.voidedById
});

export const attachPayableDocument = async (prismaClient, storage, payableId, file, actor) => {
    const payable = await prismaClient.accountsPayable.findUnique({ where: { id: payableId }, select: { id: true } });
    if (!payable) throw new FinancialDomainError('PAYABLE_NOT_FOUND', 'La cuenta por pagar no existe.', 404);
    const meta = inspectFinancialDocument(file);
    const actorId = actorIdFrom(actor);
    const key = `accounts-payable/${payableId}/${randomUUID()}${meta.extension}`;
    await storage.upload({ key, body: meta.buffer, mimeType: meta.mimeType, size: meta.size, name: meta.name });
    return prismaClient.$transaction(async (tx) => {
        const document = await tx.accountsPayableDocument.create({
            data: { payableId, storageKey: key, name: meta.name, mimeType: meta.mimeType, size: meta.size, sha256: meta.sha256, uploadedById: actorId }
        });
        await tx.financialAuditEvent.create({ data: { entityType: 'AccountsPayableDocument', entityId: document.id, action: 'CREATE', after: auditSnapshot(payableDocumentPublicFields(document)), actorId } });
        return payableDocumentPublicFields(document);
    });
};

export const openPayableDocument = async (prismaClient, storage, payableId, documentId) => {
    const document = await prismaClient.accountsPayableDocument.findFirst({ where: { id: documentId, payableId } });
    if (!document) throw new FinancialDomainError('FINANCIAL_DOCUMENT_NOT_FOUND', 'El documento no pertenece a esta cuenta o no existe.', 404);
    const object = await storage.get(document.storageKey);
    return { document: payableDocumentPublicFields(document), object };
};
