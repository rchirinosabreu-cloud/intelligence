import jwt from 'jsonwebtoken';

// Pase de reproducción (Rodny, 21 de noviembre de 2026). Un `<video>` no puede mandar la cabecera de sesión, y
// por eso antes había que bajar el archivo entero con `fetch` para poder mostrarlo. El pase va en la dirección
// (`?access_token=`), vale solo para LEER piezas finales de parrillas y pasa por las mismas comprobaciones que
// la sesión: persona activa, sesión no revocada y permiso del módulo. No sirve como sesión en ninguna otra ruta.
export const MEDIA_TICKET_AUDIENCE = 'content-media';
export const MEDIA_TICKET_SECONDS = 6 * 60 * 60;

const INTERNAL_MEDIA = /^\/api\/content\/items\/[^/]+\/final-assets\/[^/]+$/;
const PUBLIC_MEDIA = /^\/api\/public\/parrilla\/[^/]+\/items\/[^/]+\/final-assets\/[^/]+$/;
const pathOf = req => String(req.originalUrl || '').split('?', 1)[0];

/** ¿Es la lectura de una pieza final desde la plataforma? Solo ahí se admite el pase. */
export const isMediaTicketRoute = req => req.method === 'GET' && INTERNAL_MEDIA.test(pathOf(req));

/** ¿Es una lectura de pieza final, interna o del portal? Un reproductor hace muchos pedidos cortos por archivo. */
export const isMediaDelivery = req => req.method === 'GET' && (INTERNAL_MEDIA.test(pathOf(req)) || PUBLIC_MEDIA.test(pathOf(req)));

export const mediaTicketFromRequest = req => (isMediaTicketRoute(req) && typeof req.query?.access_token === 'string' && req.query.access_token) || null;

export const signMediaTicket = (user, secret, { expiresIn = MEDIA_TICKET_SECONDS } = {}) => jwt.sign(
  { userId: user.userId || user.id, sessionVersion: user.sessionVersion ?? 0 },
  secret,
  { audience: MEDIA_TICKET_AUDIENCE, algorithm: 'HS256', expiresIn }
);

export const verifyMediaTicket = (ticket, secret) => jwt.verify(String(ticket || ''), secret, { audience: MEDIA_TICKET_AUDIENCE, algorithms: ['HS256'] });

/** Un pase nunca vale como sesión: si llega por la cabecera, se rechaza. */
export const isMediaTicketPayload = payload => [].concat(payload?.aud || []).includes(MEDIA_TICKET_AUDIENCE);
