import nodemailer from 'nodemailer';

const DEFAULT_SMTP_HOST = 'smtp.gmail.com';
const DEFAULT_SMTP_PORT = 465;

let cachedTransporter = null;

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST || DEFAULT_SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || DEFAULT_SMTP_PORT);
  const user = process.env.SMTP_USER || process.env.GMAIL_SMTP_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_SMTP_PASS;
  const from = process.env.SMTP_FROM || process.env.PASSWORD_RESET_FROM || user;

  if (!user || !pass) {
    throw new Error('SMTP_USER y SMTP_PASS son requeridos para enviar correos de recuperacion');
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    from
  };
};

const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter;
  const config = getSmtpConfig();
  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth
  });
  return cachedTransporter;
};

export const sendPasswordResetCode = async ({ to, code, expiresInMinutes }) => {
  const config = getSmtpConfig();
  const transporter = getTransporter();

  await transporter.sendMail({
    from: config.from,
    to,
    subject: 'Codigo de recuperacion - Brainstudio Intelligence',
    text: `Tu codigo de recuperacion es ${code}. Expira en ${expiresInMinutes} minutos. Si no solicitaste este cambio, ignora este correo.`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#1c242c;line-height:1.5">
        <h2 style="color:#144c8c">Recuperacion de contrasena</h2>
        <p>Usa este codigo para cambiar tu contrasena en Brainstudio Intelligence:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#144c8c">${code}</p>
        <p>Este codigo expira en ${expiresInMinutes} minutos.</p>
        <p style="color:#627d9f">Si no solicitaste este cambio, puedes ignorar este correo.</p>
      </div>
    `
  });
};
