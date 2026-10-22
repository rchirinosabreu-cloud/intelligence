import { formatReceivableNumber, receivableIssuer } from '../lib/receivableDocument.js';
import { isCashPayment, paymentKindLabel } from '../lib/receivableSettlement.js';
import { drawDocumentLogo, newReceivableDocument } from './receivablePdfService.js';
import { FinancialDomainError } from './financialRecordService.js';

// El estado de cuenta que se le manda al cliente (Rodny, 20 de octubre de 2026: «necesito poder
// tener mi documento de seguimiento y también el poder generarlo»), con la forma del documento
// real de Salsipuedes: las cuentas de cobro pendientes a una fecha de corte, su suma, los abonos
// recibidos y el saldo a pagar. Es una foto a una fecha: se genera al pedirlo y no se guarda.

const PAGE = { width: 210, height: 297, left: 20, right: 20, top: 18, bottom: 18 };
const CONTENT_WIDTH = PAGE.width - PAGE.left - PAGE.right;
const COLORS = { ink: [24, 24, 27], muted: [82, 82, 91], border: [200, 200, 205], headRow: [235, 238, 240], white: [255, 255, 255] };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const formatMoney = (value) => money.format(value).replace(/ /g, ' ');
const toNumber = (value) => (value === null || value === undefined ? 0 : (typeof value.toNumber === 'function' ? value.toNumber() : Number(value)) || 0);
const round = (value) => Math.round(value * 100) / 100;
const toDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value).length === 10 ? `${value}T12:00:00Z` : value);
    return Number.isNaN(date.getTime()) ? null : date;
};
const longDate = (value) => {
    const date = toDate(value);
    return date ? `${date.getUTCDate()} de ${MONTHS[date.getUTCMonth()]} de ${date.getUTCFullYear()}` : '';
};
const monthLabel = (value) => {
    const date = toDate(value);
    if (!date) return 'Sin periodo';
    const month = MONTHS[date.getUTCMonth()];
    return `${month.charAt(0).toUpperCase()}${month.slice(1)} de ${date.getUTCFullYear()}`;
};

// La fecha de corte: hoy en Bogotá si no se pide otra. Un texto que no es una fecha se rechaza.
export const resolveStatementCutoff = (value) => {
    if (value === undefined || value === null || value === '') {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    }
    const text = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !toDate(text)) {
        throw new FinancialDomainError('STATEMENT_CUTOFF_INVALID', 'La fecha de corte debe ser una fecha válida en formato AAAA-MM-DD.');
    }
    return text;
};

/**
 * Lo que el documento dice, sin dibujar nada. Las obligaciones vivas a la fecha de corte
 * —emitidas o con periodo hasta ese día y con saldo después de los abonos recibidos hasta
 * ese día— con su valor completo; debajo, los abonos y ajustes de esas obligaciones hasta
 * el corte; y el saldo a pagar. Una cuenta pagada del todo no sale; una pagada después del
 * corte sí, porque a esa fecha seguía pendiente.
 */
export const buildClientStatementModel = (client, receivables = [], { cutoff, env = {} } = {}) => {
    const cutoffKey = resolveStatementCutoff(cutoff);
    const cutoffEnd = new Date(`${cutoffKey}T23:59:59.999Z`);
    const issuer = receivableIssuer(env);
    const rows = [];
    const deductions = [];
    for (const receivable of receivables) {
        const issuedOn = toDate(receivable.issuedAt) || toDate(receivable.period);
        if (!issuedOn || issuedOn > cutoffEnd) continue;
        const amount = toNumber(receivable.amount);
        const applied = (receivable.payments || []).filter((payment) => payment && !payment.reversedAt && toDate(payment.paidAt) && toDate(payment.paidAt) <= cutoffEnd);
        const appliedTotal = round(applied.reduce((sum, payment) => sum + toNumber(payment.amount), 0));
        if (amount <= 0 || amount - appliedTotal <= 0.005) continue;
        rows.push({
            id: receivable.id,
            number: formatReceivableNumber(receivable.number) || 'Sin emitir',
            issued: longDate(issuedOn),
            concept: receivable.servicePeriod ? `Del ${receivable.servicePeriod}` : monthLabel(receivable.period),
            amount,
            formattedAmount: formatMoney(amount),
            sortKey: issuedOn.getTime()
        });
        for (const payment of applied) {
            deductions.push({
                receivableId: receivable.id,
                label: isCashPayment(payment) ? 'Abono' : paymentKindLabel(payment),
                date: longDate(payment.paidAt),
                amount: toNumber(payment.amount),
                formattedAmount: formatMoney(toNumber(payment.amount)),
                sortKey: toDate(payment.paidAt).getTime()
            });
        }
    }
    rows.sort((a, b) => a.sortKey - b.sortKey);
    deductions.sort((a, b) => a.sortKey - b.sortKey);
    const sum = round(rows.reduce((total, row) => total + row.amount, 0));
    const deducted = round(deductions.reduce((total, row) => total + row.amount, 0));
    const balance = round(sum - deducted);
    return {
        title: 'ESTADO DE CUENTA',
        clientLine: `Cliente: ${client?.name || client?.legalName || 'Cliente'}`,
        clientDocument: client?.documentType && client?.documentNumber ? `${client.documentType}: ${client.documentNumber}` : null,
        cutoff: cutoffKey,
        cutoffLine: `Fecha de corte: ${longDate(cutoffKey)}`,
        rows,
        sum,
        formattedSum: formatMoney(sum),
        deductions,
        deducted,
        formattedDeducted: formatMoney(deducted),
        balance,
        formattedBalance: formatMoney(balance),
        emptyLine: rows.length ? null : 'Sin cuentas de cobro pendientes a la fecha de corte.',
        bankLine: issuer.bankLine,
        issuer
    };
};

const setText = (doc, { size = 10.5, style = 'normal', color = COLORS.ink } = {}) => {
    doc.setFont('WorkSans', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
};

const ensureSpace = (doc, y, needed) => {
    if (y + needed <= PAGE.height - PAGE.bottom) return y;
    doc.addPage();
    return PAGE.top + 4;
};

export const generateClientStatementPdfBuffer = (model) => {
    const doc = newReceivableDocument();
    // El mismo logo de la cuenta de cobro, con su proporción, arriba a la derecha.
    drawDocumentLogo(doc);

    let y = PAGE.top + 8;
    setText(doc, { size: 14, style: 'bold' });
    doc.text(model.title, PAGE.left, y);
    y += 10;
    setText(doc, { size: 10.5 });
    doc.text(model.clientLine, PAGE.left, y);
    if (model.clientDocument) { y += 5.5; doc.text(model.clientDocument, PAGE.left, y); }
    y += 5.5;
    doc.text(model.cutoffLine, PAGE.left, y);
    y += 12;

    const columns = [
        { label: 'Cuenta de cobro', width: 34, align: 'left' },
        { label: 'Fecha de emisión', width: 40, align: 'left' },
        { label: 'Concepto', width: CONTENT_WIDTH - 34 - 40 - 36, align: 'left' },
        { label: 'Saldo pendiente', width: 36, align: 'right' }
    ];
    const rowHeight = 7.5;
    const drawRow = (cells, { head = false, bold = false, borderless = false } = {}) => {
        y = ensureSpace(doc, y, rowHeight);
        let x = PAGE.left;
        cells.forEach((cell, index) => {
            const column = columns[index];
            if (!borderless) {
                doc.setFillColor(...(head ? COLORS.headRow : COLORS.white));
                doc.setDrawColor(...COLORS.border);
                doc.rect(x, y, column.width, rowHeight, 'FD');
            }
            setText(doc, { size: 9.5, style: head || bold ? 'bold' : 'normal' });
            const text = doc.splitTextToSize(String(cell ?? ''), column.width - 5)[0] || '';
            doc.text(text, column.align === 'right' ? x + column.width - 2.5 : x + 2.5, y + 5, { align: column.align });
            x += column.width;
        });
        y += rowHeight;
    };

    if (model.rows.length) {
        drawRow(columns.map((column) => column.label), { head: true });
        for (const row of model.rows) drawRow([row.number, row.issued, row.concept, row.formattedAmount]);
        drawRow(['', '', 'Suma', model.formattedSum], { bold: true });
    } else {
        setText(doc, { size: 10.5, color: COLORS.muted });
        doc.text(model.emptyLine, PAGE.left, y);
        y += 8;
    }

    if (model.deductions.length) {
        y += 8;
        setText(doc, { size: 10.5, style: 'bold' });
        doc.text('Menos abonos', PAGE.left, y);
        y += 4;
        const left = PAGE.left + columns[0].width;
        const dateWidth = columns[1].width;
        const labelWidth = columns[2].width;
        const amountWidth = columns[3].width;
        const subRow = (cells, { head = false, bold = false } = {}) => {
            y = ensureSpace(doc, y, rowHeight);
            const widths = [dateWidth, labelWidth, amountWidth];
            let x = left;
            cells.forEach((cell, index) => {
                doc.setFillColor(...(head ? COLORS.headRow : COLORS.white));
                doc.setDrawColor(...COLORS.border);
                doc.rect(x, y, widths[index], rowHeight, 'FD');
                setText(doc, { size: 9.5, style: head || bold ? 'bold' : 'normal' });
                const align = index === 2 ? 'right' : 'left';
                doc.text(String(cell ?? ''), align === 'right' ? x + widths[index] - 2.5 : x + 2.5, y + 5, { align });
                x += widths[index];
            });
            y += rowHeight;
        };
        subRow(['Fecha abono', 'Detalle', 'Abonado'], { head: true });
        for (const row of model.deductions) subRow([row.date, row.label, row.formattedAmount]);
        subRow(['', 'Total abonado', model.formattedDeducted], { bold: true });
    }

    y += 10;
    y = ensureSpace(doc, y, 12);
    setText(doc, { size: 11, style: 'bold' });
    doc.text('Saldo a pagar', PAGE.left, y);
    doc.text(model.formattedBalance, PAGE.left + CONTENT_WIDTH, y, { align: 'right' });

    if (model.balance > 0) {
        y += 12;
        y = ensureSpace(doc, y, 14);
        setText(doc, { size: 10.5 });
        const lines = doc.splitTextToSize(model.bankLine, CONTENT_WIDTH);
        doc.text(lines, PAGE.left, y, { align: 'justify', maxWidth: CONTENT_WIDTH });
        y += lines.length * 5.5;
    }

    y += 8;
    setText(doc, { size: 9.5, color: COLORS.muted });
    doc.text(`${model.issuer.name.replace(/\b\p{Lu}\p{Lu}+\b/gu, (word) => word.charAt(0) + word.slice(1).toLowerCase())} · ${model.issuer.role} · ${model.issuer.email}`, PAGE.left, y);

    return Buffer.from(doc.output('arraybuffer'));
};

const safeFilenamePart = (value) => String(value || '').replace(/[\\/:*?"<>|\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
export const clientStatementFilename = (client, cutoff) => `Estado de cuenta - ${safeFilenamePart(client?.name || 'Cliente')} - ${longDate(cutoff)}.pdf`.slice(0, 180);

/**
 * El estado de cuenta de un cliente a una fecha de corte, recién generado. Solo se leen
 * las obligaciones de ese cliente; el documento no se guarda, porque es una foto a una
 * fecha y cada corte es otra.
 */
export const openClientStatementPdf = async (prismaClient, clientId, query = {}, env = process.env) => {
    const cutoff = resolveStatementCutoff(query.cutoff);
    const client = await prismaClient.client.findUnique({
        where: { id: String(clientId) },
        select: { id: true, name: true, legalName: true, documentType: true, documentNumber: true }
    });
    if (!client) throw new FinancialDomainError('FINANCIAL_CLIENT_NOT_FOUND', 'El cliente no existe.', 404);
    const receivables = await prismaClient.accountsReceivable.findMany({
        where: { clientId: client.id },
        select: {
            id: true, number: true, issuedAt: true, period: true, servicePeriod: true, amount: true, currency: true, status: true, kind: true,
            payments: { select: { id: true, kind: true, amount: true, paidAt: true, reversedAt: true } }
        },
        orderBy: [{ period: 'asc' }, { id: 'asc' }]
    });
    const model = buildClientStatementModel(client, receivables, { cutoff, env });
    return { client, model, filename: clientStatementFilename(client, cutoff), buffer: generateClientStatementPdfBuffer(model) };
};
