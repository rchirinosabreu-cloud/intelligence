import { randomUUID } from 'node:crypto';
import { FinancialDomainError } from './financialRecordService.js';
import { inspectFinancialDocument } from './financialRecordDocumentService.js';
import { isCashPayment } from '../lib/receivableSettlement.js';

// El soporte de un ajuste de cartera (22 de octubre de 2026): el certificado de retención que manda
// el cliente, o el acta de un canje. Mismo bucket y mismas reglas que los comprobantes de un
// movimiento. Un pago en dinero no lo usa: sus comprobantes van en su ingreso.

const actorIdFrom = (actor) => actor?.id || actor?.userId || null;
const auditSnapshot = (value) => JSON.parse(JSON.stringify(value));

export const receivablePaymentDocumentFields = (document) => ({
    id: document.id, paymentId: document.paymentId, name: document.name, mimeType: document.mimeType, size: Number(document.size),
    sha256: document.sha256, uploadedById: document.uploadedById, uploadedAt: document.uploadedAt, voidedAt: document.voidedAt, voidReason: document.voidReason, voidedById: document.voidedById
});

export const attachReceivablePaymentDocument = async (prismaClient, storage, paymentId, file, actor) => {
    const payment = await prismaClient.receivablePayment.findUnique({ where: { id: paymentId }, select: { id: true, kind: true, reversedAt: true } });
    if (!payment) throw new FinancialDomainError('RECEIVABLE_PAYMENT_NOT_FOUND', 'El abono o ajuste no existe.', 404);
    if (isCashPayment(payment)) {
        throw new FinancialDomainError('RECEIVABLE_PAYMENT_DOCUMENT_ON_INCOME', 'Los comprobantes de un pago van en su ingreso: súbelos desde el abono en Cuentas por cobrar o desde Movimientos.', 409);
    }
    if (payment.reversedAt) throw new FinancialDomainError('RECEIVABLE_PAYMENT_REVERSED', 'Este ajuste fue revertido.', 409);
    const meta = inspectFinancialDocument(file);
    const actorId = actorIdFrom(actor);
    const key = `receivable-payments/${paymentId}/${randomUUID()}${meta.extension}`;
    await storage.upload({ key, body: meta.buffer, mimeType: meta.mimeType, size: meta.size, name: meta.name });
    return prismaClient.$transaction(async (tx) => {
        const document = await tx.receivablePaymentDocument.create({
            data: { paymentId, storageKey: key, name: meta.name, mimeType: meta.mimeType, size: meta.size, sha256: meta.sha256, uploadedById: actorId }
        });
        await tx.financialAuditEvent.create({ data: { entityType: 'ReceivablePaymentDocument', entityId: document.id, action: 'CREATE', after: auditSnapshot(receivablePaymentDocumentFields(document)), actorId } });
        return receivablePaymentDocumentFields(document);
    });
};

export const openReceivablePaymentDocument = async (prismaClient, storage, paymentId, documentId) => {
    const document = await prismaClient.receivablePaymentDocument.findFirst({ where: { id: documentId, paymentId } });
    if (!document) throw new FinancialDomainError('FINANCIAL_DOCUMENT_NOT_FOUND', 'El documento no pertenece a este ajuste o no existe.', 404);
    const object = await storage.get(document.storageKey);
    return { document: receivablePaymentDocumentFields(document), object };
};
