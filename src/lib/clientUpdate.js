// Escribirle al cliente (Rodny, 19 de octubre de 2026: «que Bria sea mi project manager y mi community manager»).
// La parrilla leída como la ve el cliente: qué espera su aprobación, qué se está ajustando según lo que pidió, qué
// salió publicado (con sus enlaces), qué está programado y el enlace del portal que ya tiene. Lógica pura.
// Nunca entra lo que el cliente no ve: ni el guion, ni las notas internas, ni el equipo, ni las horas.
import { approvalState, APPROVAL_STATES, isSettled } from './contentApproval.js';
import { LEGAL_ENTITY } from '../components/public/legalEntity.js';

export const CLIENT_UPDATE_WINDOW = Object.freeze({ pastDays: 7, nextDays: 14 });
const DAY = 24 * 60 * 60 * 1000;
const RED = { INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook' };
const IN_PREPARATION = ['BORRADOR', 'EN_PRODUCCION'];
const LIVE = ['SCHEDULED', 'PUBLISHING'];

// El portal escribe cada pedido del cliente al final de `comments` como «[Cliente - dd/mm/aaaa]: texto»
// (`addClientComment`). Lo último que pidió es lo que producción tiene que atender.
export const lastClientRequest = (comments) => {
  const matches = [...String(comments || '').matchAll(/\[Cliente - ([^\]]+)\]:\s*([\s\S]*?)(?=\n\n\[Cliente - |$)/g)];
  const last = matches.at(-1);
  return last ? { fecha: last[1].trim(), texto: last[2].trim().slice(0, 600) } : null;
};

/** El enlace del portal que ya tiene el cliente. Sin token no hay enlace: nunca se inventa uno. */
export const portalUrlOf = (token, base = LEGAL_ENTITY.platformUrl) => (token ? `${String(base).replace(/\/+$/, '')}/compartir/${token}` : null);

// La fecha de publicación se guarda al mediodía UTC justamente para que el día no se corra: se lee en UTC.
const dayOf = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);
const shift = (day, days) => new Date(new Date(`${day}T12:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
const piece = (item) => ({ titulo: item.objective || 'Pieza', formato: item.format || null, fecha: dayOf(item.publishDate) });
const byDate = (a, b) => String(a.fecha || '').localeCompare(String(b.fecha || ''));

export const buildClientUpdate = ({ clientName, monthLabel, items = [], shareToken = null, today, baseUrl } = {}) => {
  const from = shift(today, -CLIENT_UPDATE_WINDOW.pastDays), until = shift(today, CLIENT_UPDATE_WINDOW.nextDays);
  const live = items.filter((item) => !item.deletedAt);
  const esperanSuAprobacion = live
    .filter((item) => item.status === 'EN_REVISION' || approvalState(item) === APPROVAL_STATES.MATERIAL_NUEVO)
    .map((item) => ({ ...piece(item), materialNuevo: approvalState(item) === APPROVAL_STATES.MATERIAL_NUEVO }))
    .sort(byDate);
  const ajustandoLoQuePidio = live.filter((item) => item.status === 'DEVUELTO')
    .map((item) => ({ ...piece(item), pidio: lastClientRequest(item.comments)?.texto || null }))
    .sort(byDate);
  const publicadas = live.map((item) => {
    const done = (item.publications || []).filter((p) => p.status === 'PUBLISHED' && p.publishedAt);
    const last = done.map((p) => dayOf(p.publishedAt)).sort().at(-1);
    if (!last || last < from || last > today) return null;
    return { ...piece(item), enlaces: done.filter((p) => p.permalink).map((p) => ({ red: RED[p.platform] || p.platform, url: p.permalink })) };
  }).filter(Boolean).sort(byDate);
  const programadas = live.filter((item) => {
    const day = dayOf(item.publishDate);
    const queued = item.status === 'PROGRAMADO' || (item.publications || []).some((p) => LIVE.includes(p.status));
    return queued && day && day >= today && day <= until;
  }).map((item) => ({ ...piece(item), hora: item.publishTime || null })).sort(byDate);
  return {
    cliente: clientName || null, mes: monthLabel || null, enlacePortal: portalUrlOf(shareToken, baseUrl),
    esperanSuAprobacion, ajustandoLoQuePidio, publicadas, programadas,
    enPreparacion: live.filter((item) => IN_PREPARATION.includes(item.status)).length,
    avance: { aprobadas: live.filter(isSettled).length, total: live.length }
  };
};
