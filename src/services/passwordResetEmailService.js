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

export const buildPasswordResetEmail = ({ code, expiresInMinutes }) => {
  const preheader = `Tu codigo de recuperacion expira en ${expiresInMinutes} minutos.`;

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Codigo de recuperacion</title>
      </head>
      <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#1c242c;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
          ${preheader}
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;margin:0;padding:32px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dbe5f2;border-radius:18px;overflow:hidden;box-shadow:0 18px 45px rgba(20,76,140,0.10);">
                <tr>
                  <td style="background:#144c8c;padding:28px 32px;">
                    <div style="font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#8ab9ee;">
                      Brainstudio Intelligence
                    </div>
                    <h1 style="margin:10px 0 0;font-size:26px;line-height:34px;font-weight:800;color:#ffffff;">
                      Recupera tu acceso
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:34px 32px 30px;">
                    <p style="margin:0 0 18px;font-size:16px;line-height:25px;color:#1f3c58;">
                      Recibimos una solicitud para crear una nueva contrasena de acceso a Brainstudio Intelligence.
                    </p>
                    <p style="margin:0 0 22px;font-size:15px;line-height:24px;color:#627d9f;">
                      Ingresa este codigo en la pantalla de recuperacion:
                    </p>
                    <div style="background:#eef5ff;border:1px solid #c9dcf3;border-radius:16px;padding:22px 18px;text-align:center;">
                      <div style="font-size:34px;line-height:42px;font-weight:800;letter-spacing:10px;color:#144c8c;">
                        ${code}
                      </div>
                    </div>
                    <p style="margin:22px 0 0;font-size:14px;line-height:22px;color:#627d9f;">
                      Este codigo expira en <strong style="color:#1f3c58;">${expiresInMinutes} minutos</strong>. Por seguridad, no lo compartas con nadie.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 32px;">
                    <div style="border-top:1px solid #e6edf6;padding-top:20px;">
                      <p style="margin:0;font-size:13px;line-height:21px;color:#7b8fa8;">
                        Si no solicitaste este cambio, puedes ignorar este correo. Tu contrasena actual no cambiara.
                      </p>
                      <p style="margin:18px 0 0;font-size:12px;line-height:18px;color:#9aaac0;">
                        Enviado automaticamente por Brainstudio Intelligence.
                      </p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

export const sendPasswordResetCode = async ({ to, code, expiresInMinutes }) => {
  const config = getSmtpConfig();
  const transporter = getTransporter();

  await transporter.sendMail({
    from: config.from,
    to,
    subject: 'Codigo de recuperacion - Brainstudio Intelligence',
    text: `Tu codigo de recuperacion es ${code}. Expira en ${expiresInMinutes} minutos. Si no solicitaste este cambio, ignora este correo.`,
    html: buildPasswordResetEmail({ code, expiresInMinutes })
  });
};
