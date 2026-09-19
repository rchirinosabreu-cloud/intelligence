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

export const isTransactionalEmailConfigured = () => Boolean(smtpConfig());

export const sendPlainEmail = async ({ to, subject, text }, { transporterFactory = null } = {}) => {
  const config = smtpConfig();
  if (!config || !to) return { sent: false, reason: config ? 'no-recipient' : 'smtp-not-configured' };
  if (!cachedTransporter) cachedTransporter = transporterFactory ? transporterFactory(config) : nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: config.auth });
  await cachedTransporter.sendMail({ from: config.from, to, subject, text });
  return { sent: true };
};
