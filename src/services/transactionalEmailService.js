import nodemailer from 'nodemailer';

// Plain transactional email over the same SMTP the password reset uses. Silent no-op when SMTP is not configured.
let cachedTransporter = null;

const smtpConfig = () => {
  const user = process.env.SMTP_USER || process.env.GMAIL_SMTP_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_SMTP_PASS;
  if (!user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  return { host: process.env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465, auth: { user, pass }, from: process.env.CRM_REQUEST_FROM || process.env.SMTP_FROM || user };
};

/**
 * Un correo con texto, HTML opcional y adjuntos opcionales (`{ filename, content, contentType }`). `from` cambia el
 * remitente de ese correo: Gmail solo lo respeta si esa dirección está verificada como «Enviar como» en la cuenta del
 * SMTP (si no, la reemplaza por la cuenta). `replyTo` dice a dónde vuelven las respuestas.
 */
export const sendEmail = async ({ to, subject, text, html = null, attachments = [], from = null, replyTo = null }, { transporterFactory = null } = {}) => {
  const config = smtpConfig();
  if (!config || !to) return { sent: false, reason: config ? 'no-recipient' : 'smtp-not-configured' };
  if (!cachedTransporter) cachedTransporter = transporterFactory ? transporterFactory(config) : nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: config.auth });
  await cachedTransporter.sendMail({ from: from || config.from, to, subject, text, ...(replyTo ? { replyTo } : {}), ...(html ? { html } : {}), ...(attachments.length ? { attachments } : {}) });
  return { sent: true };
};

export const sendPlainEmail = async ({ to, subject, text }, options = {}) => sendEmail({ to, subject, text }, options);
