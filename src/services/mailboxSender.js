// El envío desde un buzón compartido (Rodny, 20 de noviembre de 2026: «enviar correos con tu aprobación»). Usa la
// misma contraseña de aplicación con la que Bria lee ese buzón, por el SMTP de Gmail; Gmail deja la copia en
// Enviados. Solo texto, un destinatario, sin adjuntos. Lo llama únicamente `mailboxService.sendReply`.
import nodemailer from 'nodemailer';

/** Los parámetros SMTP del buzón. Los buzones de la agencia viven en Gmail o en Google Workspace. */
export const smtpFor = (account) => ({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: account.username || account.email, pass: account.secret } });

export const createMailboxSender = ({ transportFactory = (config) => nodemailer.createTransport({ ...config, connectionTimeout: 15000, socketTimeout: 20000 }) } = {}) => ({
  async send(account, { to, subject, text, inReplyTo = null, references = null }) {
    const transport = transportFactory(smtpFor(account));
    try { return await transport.sendMail({ from: account.email, to, subject, text, ...(inReplyTo ? { inReplyTo } : {}), ...(references ? { references } : {}) }); }
    finally { transport.close?.(); }
  }
});
