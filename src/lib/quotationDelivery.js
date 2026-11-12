// Enviar la propuesta al cliente al emitirla (reunión del 4 de noviembre de 2026, Pacho: «debería enviarse la propuesta
// automáticamente cuando sale … el link para que ya le diga aceptar … los dos, porque hay gente que no leerá esto, sino
// PDF»). Hasta ese día «Emitir» solo emitía y Elisa descargaba el PDF y lo mandaba a mano.
//
// Lógica pura: la usan el servidor (correo) y la pantalla (WhatsApp), y las pruebas.
import { LEGAL_ENTITY } from '../components/public/legalEntity.js';

// Rodny, 12 de noviembre de 2026: las propuestas salen de contacto@ (verificado como «Enviar como» en la cuenta labs@
// del SMTP) y las respuestas del cliente vuelven ahí. Solo las cotizaciones: el resto de correos sigue saliendo de labs@.
export const QUOTATION_SENDER_ADDRESS = 'contacto@brainstudioagencia.com';
export const QUOTATION_SENDER = `Brain Studio <${QUOTATION_SENDER_ADDRESS}>`;

export const quotationCode =(consecutive) => `COT-${String(consecutive ?? 0).padStart(4, '0')}`;

/** El enlace público de la propuesta: el mismo de «Copiar enlace», con el dominio de la plataforma. */
export const quotationPublicUrl = (slug, base = LEGAL_ENTITY.platformUrl) => (slug ? `${String(base).replace(/\/+$/, '')}/cotizaciones/ver/${slug}` : null);

const firstName = (value) => String(value || '').trim().split(/\s+/)[0] || '';

const formatDay = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' });
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

// El correo en HTML (Rodny, 12 de noviembre de 2026). Los clientes de correo no leen hojas de estilo ni variables: todo
// va en tablas con estilos en línea, con los hexadecimales de la paleta oficial (el cian «deep» del botón da contraste
// AA con texto blanco). El logo es el horizontal de los documentos, servido desde la plataforma. Gmail no carga fuentes
// web, así que Roboto Condensed se queda en los clientes que sí y el resto cae a Roboto o Arial.
const EMAIL = Object.freeze({
    font: "'Roboto Condensed',Roboto,Arial,Helvetica,sans-serif",
    page: '#F3F5F7', card: '#FFFFFF', border: '#E3E8EC', text: '#1F2933', muted: '#5B6670',
    cyan: '#009BBF', green: '#31AA8A', cyanDeep: '#007A96', cyanSoft: '#E6F5F9'
});
const LOGO_URL = `${LEGAL_ENTITY.platformUrl}/brainstudio-logo-horizontal.png`;
const AGENCY_WHATSAPP = `https://wa.me/${String(LEGAL_ENTITY.phone).replace(/\D/g, '')}`;

const summaryRow = (label, value) => `
              <tr>
                <td style="padding:6px 0;font-family:${EMAIL.font};font-size:14px;color:${EMAIL.muted};width:120px;vertical-align:top;">${label}</td>
                <td style="padding:6px 0;font-family:${EMAIL.font};font-size:15px;font-weight:700;color:${EMAIL.text};vertical-align:top;">${value}</td>
              </tr>`;

const proposalEmailHtml = ({ code, name, recipient, link, issuerName, until }) => {
    const href = escapeHtml(link);
    const paragraph = (content, extra = '') => `<p style="margin:0 0 16px;font-family:${EMAIL.font};font-size:16px;line-height:1.55;color:${EMAIL.text};${extra}">${content}</p>`;
    const rows = [
        summaryRow('Propuesta', escapeHtml(code)),
        recipient ? summaryRow('Para', escapeHtml(recipient)) : '',
        until ? summaryRow('Vigente hasta', escapeHtml(until)) : ''
    ].join('');
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Propuesta ${escapeHtml(code)}</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${EMAIL.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Tu propuesta ${escapeHtml(code)} está lista para revisar y aceptar.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL.page};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${EMAIL.card};border:1px solid ${EMAIL.border};border-radius:16px;overflow:hidden;">
        <tr><td height="5" bgcolor="${EMAIL.cyan}" style="height:5px;line-height:5px;font-size:0;background:${EMAIL.cyan};background-image:linear-gradient(90deg,${EMAIL.cyan},${EMAIL.green});">&nbsp;</td></tr>
        <tr>
          <td style="padding:28px 40px 8px;">
            <img src="${LOGO_URL}" width="168" alt="Brain Studio" style="display:block;width:168px;max-width:100%;height:auto;border:0;">
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 8px;">
            ${paragraph(`Hola${name ? ` ${escapeHtml(name)}` : ''},`)}
            ${paragraph('Te compartimos nuestra propuesta. Puedes revisarla con calma y, si estás de acuerdo, aceptarla desde el mismo enlace.')}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL.cyanSoft};border-radius:12px;margin:8px 0 28px;">
              <tr>
                <td style="padding:16px 20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}
                  </table>
                </td>
              </tr>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
              <tr>
                <td bgcolor="${EMAIL.cyanDeep}" style="border-radius:10px;background:${EMAIL.cyanDeep};">
                  <a href="${href}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${EMAIL.font};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">Ver y aceptar la propuesta</a>
                </td>
              </tr>
            </table>
            ${paragraph(`¿El botón no abre? Copia este enlace en tu navegador:<br><a href="${href}" target="_blank" style="color:${EMAIL.cyanDeep};word-break:break-all;">${href}</a>`, `font-size:13px;color:${EMAIL.muted};`)}
            ${paragraph('Adjuntamos también el PDF por si prefieres leerla así.')}
            ${paragraph(`Cualquier duda, respóndenos a este correo o <a href="${AGENCY_WHATSAPP}" target="_blank" style="color:${EMAIL.cyanDeep};">escríbenos por WhatsApp</a>.`)}
            ${paragraph(`Un saludo,<br><strong>${escapeHtml(issuerName)}</strong>`, 'margin-bottom:28px;')}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 28px;border-top:1px solid ${EMAIL.border};font-family:${EMAIL.font};font-size:13px;line-height:1.6;color:${EMAIL.muted};">
            Brain Studio · Cartagena de Indias, Colombia<br>
            <a href="mailto:${QUOTATION_SENDER_ADDRESS}" style="color:${EMAIL.muted};">${QUOTATION_SENDER_ADDRESS}</a> · ${escapeHtml(LEGAL_ENTITY.phone)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
};

/** Lo que recibe el cliente: saludo por su nombre, el enlace para ver y aceptar, y el PDF adjunto. */
export const proposalEmail = ({ consecutive, clientName, clientCompany, link, issuerName = 'Brain Studio', expiresAt = null }) => {
    const code = quotationCode(consecutive);
    const name = firstName(clientName);
    const company = String(clientCompany || '').trim();
    const who = company ? ` para ${company}` : '';
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
    const html = proposalEmailHtml({ code, name, recipient: company || String(clientName || '').trim(), link, issuerName, until });
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
