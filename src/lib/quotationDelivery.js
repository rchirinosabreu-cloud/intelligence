// Enviar la propuesta al cliente al emitirla (reunión del 4 de noviembre de 2026, Pacho: «debería enviarse la propuesta
// automáticamente cuando sale … el link para que ya le diga aceptar … los dos, porque hay gente que no leerá esto, sino
// PDF»). Hasta ese día «Emitir» solo emitía y Elisa descargaba el PDF y lo mandaba a mano.
//
// Lógica pura: la usan el servidor (correo) y la pantalla (WhatsApp), y las pruebas.
import { LEGAL_ENTITY } from '../components/public/legalEntity.js';

export const quotationCode = (consecutive) => `COT-${String(consecutive ?? 0).padStart(4, '0')}`;

/** El enlace público de la propuesta: el mismo de «Copiar enlace», con el dominio de la plataforma. */
export const quotationPublicUrl = (slug, base = LEGAL_ENTITY.platformUrl) => (slug ? `${String(base).replace(/\/+$/, '')}/cotizaciones/ver/${slug}` : null);

const firstName = (value) => String(value || '').trim().split(/\s+/)[0] || '';

const formatDay = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' });
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

/** Lo que recibe el cliente: saludo por su nombre, el enlace para ver y aceptar, y el PDF adjunto. */
export const proposalEmail = ({ consecutive, clientName, clientCompany, link, issuerName = 'Brain Studio', expiresAt = null }) => {
    const code = quotationCode(consecutive);
    const name = firstName(clientName);
    const who = clientCompany ? ` para ${clientCompany}` : '';
    const until = formatDay(expiresAt);
    const subject = `Propuesta ${code} de ${issuerName}${who}`;
    const lines = [
        `Hola${name ? ` ${name}` : ''},`,
        '',
        `Te compartimos la propuesta ${code}${who}. Puedes verla y aceptarla en este enlace:`,
        link,
        '',
        'Adjuntamos también el PDF por si prefieres leerla así.',
        until ? `La propuesta tiene vigencia hasta el ${until}.` : null,
        '',
        'Cualquier duda, respóndenos a este correo o escríbenos por WhatsApp.',
        '',
        `${issuerName}`
    ].filter((line) => line !== null);
    const html = [
        `<p>Hola${name ? ` ${escapeHtml(name)}` : ''},</p>`,
        `<p>Te compartimos la propuesta <strong>${escapeHtml(code)}</strong>${escapeHtml(who)}. Puedes verla y aceptarla aquí:</p>`,
        `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
        '<p>Adjuntamos también el PDF por si prefieres leerla así.</p>',
        until ? `<p>La propuesta tiene vigencia hasta el ${escapeHtml(until)}.</p>` : '',
        '<p>Cualquier duda, respóndenos a este correo o escríbenos por WhatsApp.</p>',
        `<p>${escapeHtml(issuerName)}</p>`
    ].filter(Boolean).join('\n');
    return { subject, text: lines.join('\n'), html, attachmentName: `Propuesta_${code}.pdf` };
};

/** El mensaje de WhatsApp, listo para abrir el chat con el cliente y enviarlo. */
export const proposalWhatsAppText = ({ consecutive, clientName, clientCompany, link, issuerName = 'Brain Studio' }) => {
    const code = quotationCode(consecutive);
    const name = firstName(clientName);
    const who = clientCompany ? ` para ${clientCompany}` : '';
    return `Hola${name ? ` ${name}` : ''}, te compartimos la propuesta ${code}${who}. Puedes verla y aceptarla aquí: ${link}\n\nCualquier duda, quedamos atentos. ${issuerName}`;
};

/** Solo dígitos, con el 57 de Colombia si el número viene sin indicativo; null si no parece un número. */
export const whatsAppNumber = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 7) return null;
    if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
    return digits;
};

/** El enlace que abre WhatsApp con el mensaje escrito; null sin número. */
export const whatsAppLink = (phone, text) => {
    const number = whatsAppNumber(phone);
    return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
};

export const DELIVERY_CHANNELS = Object.freeze(['CORREO', 'WHATSAPP']);
