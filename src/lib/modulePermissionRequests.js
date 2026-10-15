// La versión general de pedir un acceso (Rodny, 15 de octubre de 2026: «si Camila está solicitando algo a lo que Bria
// no le puede dar acceso por su rol, no tiene que pedírmelo directamente, me debería aparecer a mí el anuncio … y así
// nos adelantamos aún más»). Lo que no es una contraseña es un módulo de la lista única (`platformModules.js`): qué le
// falta a la persona, cómo se ve el aviso de quien decide y la respuesta, y qué cambia en la cuenta al dar acceso.
// Dar acceso marca la misma casilla que Equipo y nada más; Financiero entra en solo lectura.
import { PLATFORM_MODULES, MODULE_KEYS, hasModuleAccess, sanitizeModulePermissions } from './platformModules.js';
import { bogotaTime, firstName } from './briaNudges.js';

export const PERMISSION_REQUEST_KEY = 'PERMISO';
export const PERMISSION_NOTE_MAX = 200;
export const PERMISSION_DENIAL_DAYS = 7;
const MANAGER_ROLES = ['ADMIN', 'PROJECT_MANAGER'];
const FINANCIAL_LEVELS = ['VIEWER', 'EDITOR', 'APPROVER'];

export const moduleOf = (key) => PLATFORM_MODULES.find((module) => module.key === key) || null;
const labelOf = (key) => moduleOf(key)?.label || key;

/** Los módulos que esta persona no tiene hoy. Un administrador entra a todo. */
export const missingModules = (user) => PLATFORM_MODULES.filter((module) => !hasModuleAccess(user, module.key)).map(({ key, label }) => ({ key, label }));

/**
 * Lo que se escribe en la cuenta al dar acceso: la misma casilla que en Equipo, sin tocar las demás. Bria solo la
 * conservan administradores y project managers, como en Equipo. Financiero entra en solo lectura salvo que ya tuviera
 * un nivel; el nivel se cambia en Equipo.
 */
export const grantModule = (user, key) => {
  if (!MODULE_KEYS.includes(key)) throw Object.assign(new Error('Ese módulo no existe.'), { status: 400, code: 'MODULE_UNKNOWN' });
  const modulePermissions = { ...sanitizeModulePermissions(user?.modulePermissions), [key]: true };
  if (!MANAGER_ROLES.includes(String(user?.role || '').toUpperCase())) modulePermissions.bria = false;
  if (key !== 'financiero') return { modulePermissions };
  const level = String(user?.financialRole || '').toUpperCase();
  return { modulePermissions, hasFinancialAccess: true, financialRole: FINANCIAL_LEVELS.includes(level) ? level : 'VIEWER' };
};

/** Lo que ve un administrador encima de Bria. */
export const permissionRequestNudge = (request) => {
  const parts = [];
  if (request.note) parts.push(`Lo pidió para «${String(request.note).slice(0, PERMISSION_NOTE_MAX)}».`);
  if (request.moduleKey === 'financiero') parts.push('Se le da en solo lectura; el nivel se cambia en Equipo.');
  if (request.createdAt) parts.push(`Lo pidió a las ${bogotaTime(request.createdAt)}.`);
  const decide = (decision) => ({ scope: 'permission', requestId: request.id, decision });
  return {
    key: `${PERMISSION_REQUEST_KEY}:${request.id}`, kind: 'PERMISO_SOLICITADO', personName: request.requesterName || null,
    title: `${firstName(request.requesterName)} necesita acceso a ${labelOf(request.moduleKey)}`,
    body: parts.join(' ') || null, url: null, taskIds: [],
    actions: [{ label: 'Dar acceso', decide: decide('APPROVE') }, { label: 'Denegar', decide: decide('DENY') }]
  };
};

/** Lo que ve quien pidió cuando un administrador decide. «Abrir» recarga la página: el menú lee el permiso nuevo. */
export const permissionAnswerNudge = (request) => {
  const who = firstName(request.decidedByName), label = labelOf(request.moduleKey), granted = request.status === 'APPROVED';
  return {
    key: `${PERMISSION_REQUEST_KEY}:${request.id}`, kind: granted ? 'PERMISO_CONCEDIDO' : 'PERMISO_DENEGADO', personName: null,
    title: granted ? `${who} te dio acceso a ${label}` : `${who} denegó tu acceso a ${label}`,
    body: granted ? 'Ya puedes abrirlo y volver a preguntarle a Bria.' : null, url: null, taskIds: [],
    actions: granted && moduleOf(request.moduleKey)?.path ? [{ label: `Abrir ${label}`, href: moduleOf(request.moduleKey).path }] : []
  };
};

export const permissionRequestText = (request) => `${firstName(request.requesterName)} necesita acceso a ${labelOf(request.moduleKey)}.`;
export const permissionAnswerText = (request) => (request.status === 'APPROVED'
  ? `${firstName(request.decidedByName)} te dio acceso a ${labelOf(request.moduleKey)}.`
  : `${firstName(request.decidedByName)} denegó tu acceso a ${labelOf(request.moduleKey)}.`);

/** La línea que ve quien decidió, después de que el servidor respondió (70 caracteres como máximo). */
export const permissionDecisionMessage = (request, { alreadyDecided = false } = {}) => {
  if (alreadyDecided) return `${firstName(request.decidedByName)} ya lo había decidido.`.slice(0, 70);
  const who = firstName(request.requesterName), label = labelOf(request.moduleKey);
  const text = request.status === 'APPROVED' ? `Le diste acceso a ${label} a ${who}.` : `Le negaste a ${who} el acceso a ${label}.`;
  return text.length <= 70 ? text : (request.status === 'APPROVED' ? `Le diste el acceso a ${who}.` : `Le negaste el acceso a ${who}.`);
};

export const cleanPermissionNote = (note) => {
  const text = String(note ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, PERMISSION_NOTE_MAX) : null;
};
