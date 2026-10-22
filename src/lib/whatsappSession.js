// La sesión corta de Bria por WhatsApp (Rodny, 22 de octubre de 2026: «sí»). Por WhatsApp no hay navegador, así
// que las manos de Bria en la plataforma no tenían con qué entrar. Por cada mensaje de una persona vinculada, el
// puente firma una sesión suya —con la misma clave y la misma forma que la de un inicio de sesión— que dura unos
// minutos y entra por las mismas puertas que el navegador: `authenticateToken` vuelve a leer la cuenta, su
// `sessionVersion` (cambiar la contraseña o cerrar todas las sesiones la mata) y sus permisos en cada llamada.
//
// No se guarda en ningún sitio: viaja en la petición de ese mensaje y muere con ella. Lleva `channel: 'whatsapp'`,
// que el registro operativo anota en cada cambio como «vía WhatsApp». Nunca se le entrega al modelo.
//
// El precio, aceptado por Rodny: quien tenga el celular desbloqueado con WhatsApp abierto puede operar la plataforma
// como esa persona, igual que ya podía crear y eliminar pendientes.
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/security.js';

export const WHATSAPP_SESSION_SECONDS = 180;

export const signWhatsAppSession = (user, secret = getJwtSecret(), { now = Math.floor(Date.now() / 1000) } = {}) => {
  if (String(secret || '').length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
  return jwt.sign({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    hasFinancialAccess: user.hasFinancialAccess,
    financialRole: user.financialRole,
    modulePermissions: user.modulePermissions,
    sessionVersion: user.sessionVersion ?? 0,
    amr: ['whatsapp'],
    channel: 'whatsapp',
    iat: now
  }, secret, { expiresIn: WHATSAPP_SESSION_SECONDS });
};
