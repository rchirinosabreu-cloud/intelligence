// Enviar la propuesta al cliente (reunión del 4 de noviembre de 2026). Al emitirla sale sola por correo, con el enlace
// para aceptar y el PDF adjunto; por WhatsApp la manda la persona desde su teléfono con el mensaje ya escrito. Las dos
// quedan como gestión «Propuesta enviada» en la oportunidad del CRM, que es lo que reinicia la cuenta de días sin
// respuesta. Un envío que falla nunca deshace la emisión: se dice y se puede reenviar.
import prisma from '../lib/prisma.js';
import { sendEmail } from './transactionalEmailService.js';
import { generateQuotationPdfBuffer } from './quotationPdfService.js';
import { addActivity } from './crmService.js';
import { DEMO_CONNECTION_MESSAGE, isDemoMode } from '../lib/demoMode.js';
import { DELIVERY_CHANNELS, QUOTATION_SENDER, QUOTATION_SENDER_ADDRESS, proposalEmail, quotationCode, quotationPublicUrl } from '../lib/quotationDelivery.js';

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const issuerName = (quotation, issuer) => issuer?.razonSocial || issuer?.nombre || (quotation.emisor_type === 'FRANCISCO_VILLA' ? 'Francisco Villa' : 'Brain Studio');

/** La gestión en el CRM: una por cotización y canal, así reenviar no la repite en la bitácora. */
export const recordProposalSent = async (db, quotation, channel, actor = {}, now = new Date()) => {
    if (!quotation?.lead_id) return null;
    const code = quotationCode(quotation.consecutive);
    const via = channel === 'WHATSAPP' ? 'por WhatsApp' : `por correo a ${quotation.client_email}`;
    try {
        return await addActivity(db, quotation.lead_id, {
            type: 'PROPUESTA_ENVIADA',
            note: `Propuesta ${code} enviada ${via}.`,
            requestId: `cot-${quotation.id}-${channel.toLowerCase()}-${now.toISOString().slice(0, 10)}`
        }, actor, now);
    } catch (error) {
        console.error('[Cotizaciones] Gestión «Propuesta enviada» no registrada en el CRM:', error?.message || error);
        return null;
    }
};

/**
 * El correo al cliente con el enlace y el PDF. Devuelve qué pasó en palabras: enviado, sin correo del cliente, o el
 * motivo por el que no salió. Nunca lanza: la emisión ya ocurrió.
 */
export const emailQuotation = async (db, quotation, issuer, { send = sendEmail, pdf = generateQuotationPdfBuffer, actor = {}, now = new Date(), baseUrl } = {}) => {
    const to = String(quotation?.client_email || '').trim();
    if (!to) return { sent: false, reason: 'sin-correo', message: 'La cotización no tiene correo del cliente.' };
    const link = quotationPublicUrl(quotation.uuid_slug, baseUrl);
    const email = proposalEmail({
        consecutive: quotation.consecutive, clientName: quotation.client_name, clientCompany: quotation.client_company,
        link, issuerName: issuerName(quotation, issuer), expiresAt: quotation.expires_at
    });
    try {
        const buffer = await pdf(quotation, issuer);
        const result = await send({ to, from: QUOTATION_SENDER, replyTo: QUOTATION_SENDER_ADDRESS, subject: email.subject, text: email.text, html: email.html, attachments: [{ filename: email.attachmentName, content: buffer, contentType: 'application/pdf' }] });
        if (!result?.sent) {
            // En la demo no hay correo: se dice con calma que depende de una conexión real (13 de noviembre de 2026).
            const notConfigured = result?.reason === 'smtp-not-configured';
            return { sent: false, reason: result?.reason || 'no-enviado', message: notConfigured ? (isDemoMode() ? DEMO_CONNECTION_MESSAGE : 'El correo de la plataforma no está configurado.') : 'El correo no salió.' };
        }
    } catch (error) {
        console.error('[Cotizaciones] Correo de la propuesta no enviado:', error?.message || error);
        return { sent: false, reason: 'error', message: `El correo no salió: ${String(error?.message || error).slice(0, 160)}` };
    }
    await recordProposalSent(db, quotation, 'CORREO', actor, now);
    return { sent: true, to, link, message: `Propuesta enviada por correo a ${to}.` };
};

/** Lo que registra la pantalla cuando la persona manda la propuesta por WhatsApp desde su teléfono. */
export const noteWhatsAppDelivery = async (db, quotation, actor = {}, now = new Date()) => {
    const activity = await recordProposalSent(db, quotation, 'WHATSAPP', actor, now);
    return { recorded: Boolean(activity), message: activity ? 'Quedó registrado en el CRM como propuesta enviada por WhatsApp.' : 'La cotización no está ligada a una oportunidad del CRM; no hay dónde registrarlo.' };
};

/**
 * «Reenviar» o «ya la mandé por WhatsApp» desde el historial: solo sobre una cotización emitida y de quien tiene
 * Cotizaciones. `channel` CORREO envía de verdad; WHATSAPP solo registra.
 */
export const sendQuotationByChannel = async (db = prisma, id, channel, issuers, actor = {}, deps = {}) => {
    if (!DELIVERY_CHANNELS.includes(channel)) throw httpError(400, 'Elige por dónde se envía: correo o WhatsApp.');
    const quotation = await db.quotation.findUnique({ where: { id } });
    if (!quotation) throw httpError(404, 'Cotización no encontrada.');
    if (quotation.status === 'BORRADOR') throw httpError(409, 'Emite la propuesta antes de enviarla.');
    if (channel === 'WHATSAPP') return noteWhatsAppDelivery(db, quotation, actor, deps.now);
    return emailQuotation(db, quotation, issuers?.[quotation.emisor_type] || null, { ...deps, actor });
};
