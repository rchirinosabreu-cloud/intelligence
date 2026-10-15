// Pedir acceso a un módulo (15 de octubre de 2026): Bria lo pide por la persona, un administrador da acceso o lo
// deniega desde el aviso, y la persona recibe la respuesta. En cada llamada se vuelve a leer la cuenta; dar acceso
// escribe la misma casilla que Equipo, en una transacción, y solo a quien sigue activo en el equipo.
import prisma from '../lib/prisma.js';
import { MODULE_KEYS, hasModuleAccess } from '../lib/platformModules.js';
import { grantModule, moduleOf, permissionRequestNudge, permissionAnswerNudge, permissionRequestText, permissionAnswerText, permissionDecisionMessage, cleanPermissionNote } from '../lib/modulePermissionRequests.js';
import { createNotification } from './notificationService.js';
import { getPermissionRequestRepository } from './permissionRequestRepository.js';

const requestError = (message, status, code) => Object.assign(new Error(message), { status, code });
export const MODULE_ACCESS_REQUESTED = 'MODULE_ACCESS_REQUESTED';
export const MODULE_ACCESS_GRANTED = 'MODULE_ACCESS_GRANTED';
export const MODULE_ACCESS_DENIED = 'MODULE_ACCESS_DENIED';
const ACCOUNT = { id: true, name: true, role: true, isActive: true, modulePermissions: true, financialRole: true, teamMember: { select: { name: true, isActive: true } } };

export const createPermissionRequestService = ({ repository, db = prisma, notify = createNotification, logger = console } = {}) => {
  const repo = () => repository || getPermissionRequestRepository();
  const actorOf = async (user) => {
    const row = await db.user.findUnique({ where: { id: user?.userId || user?.id || '' }, select: ACCOUNT });
    if (!row || !row.isActive || !row.teamMember?.isActive) throw requestError('Tu cuenta no está activa en el equipo.', 403, 'ACCOUNT_INACTIVE');
    return { ...row, ref: row.id, name: row.teamMember?.name || row.name || 'Equipo' };
  };
  const safeNotify = async (row) => {
    try { await notify(row); } catch (failure) { logger.error('[PermissionRequests] No se pudo avisar:', failure?.message || failure); }
  };
  const activeAdmins = async () => (await db.user.findMany({
    where: { role: 'ADMIN', isActive: true, teamMember: { is: { isActive: true } } },
    select: { id: true, name: true, teamMember: { select: { name: true } } }
  })).map((row) => ({ id: row.id, name: row.teamMember?.name || row.name || 'Administración' }));
  // Dar acceso: la cuenta se vuelve a leer dentro de la transacción y se escribe una sola vez.
  const grant = (request) => db.$transaction(async (tx) => {
    const account = await tx.user.findUnique({ where: { id: request.requesterRef }, select: ACCOUNT });
    if (!account || !account.isActive || !account.teamMember?.isActive) throw requestError(`${request.requesterName} ya no está activa en el equipo: no se le puede dar acceso.`, 409, 'REQUESTER_INACTIVE');
    await tx.user.update({ where: { id: account.id }, data: grantModule(account, request.moduleKey) });
  });

  return {
    async request(user, moduleKey, note) {
      if (!MODULE_KEYS.includes(moduleKey)) throw requestError('Ese módulo no existe en la plataforma.', 400, 'MODULE_UNKNOWN');
      const actor = await actorOf(user);
      if (actor.role === 'ADMIN') throw requestError('Un administrador ya entra a todos los módulos.', 400, 'MODULE_REQUEST_ADMIN');
      if (hasModuleAccess(actor, moduleKey)) return { alreadyHas: true };
      const out = await repo().create({ moduleKey, requesterRef: actor.ref, requesterName: actor.name, note: cleanPermissionNote(note) });
      if (out.deniedRecently) return out;
      const admins = await activeAdmins();
      if (out.created) for (const admin of admins) await safeNotify({ userId: admin.id, type: MODULE_ACCESS_REQUESTED, message: permissionRequestText(out.request), relatedId: out.request.id });
      return { ...out, admins: admins.map((admin) => admin.name) };
    },
    async decide(user, id, decision) {
      const actor = await actorOf(user);
      if (actor.role !== 'ADMIN') throw requestError('Un pedido de acceso lo decide un administrador.', 403, 'MODULE_REQUEST_FORBIDDEN');
      if (!['APPROVE', 'DENY'].includes(decision)) throw requestError('La decisión es dar acceso o denegar.', 400, 'MODULE_REQUEST_DECISION');
      const current = await repo().get(id);
      if (!current) throw requestError('Ese pedido ya no existe.', 404, 'MODULE_REQUEST_NOT_FOUND');
      const claimed = current.status === 'PENDING' ? await repo().claim(id, decision, actor) : null;
      if (!claimed) {
        const decided = current.status === 'PENDING' ? await repo().get(id) : current;
        return { alreadyDecided: true, request: decided, message: permissionDecisionMessage(decided, { alreadyDecided: true }) };
      }
      if (decision === 'APPROVE') {
        try { await grant(claimed); }
        catch (failure) { await repo().release(id); throw failure; }
      }
      // Tocar el aviso de acceso concedido abre el módulo (`url`); el de denegado no lleva a ningún sitio.
      const path = decision === 'APPROVE' ? moduleOf(claimed.moduleKey)?.path : null;
      await safeNotify({ userId: claimed.requesterRef, type: decision === 'APPROVE' ? MODULE_ACCESS_GRANTED : MODULE_ACCESS_DENIED, message: permissionAnswerText(claimed), relatedId: claimed.id, ...(path ? { url: path } : {}) });
      return { decided: true, request: claimed, message: permissionDecisionMessage(claimed) };
    },
    /** A un administrador, los pedidos por decidir; a quien pidió, las respuestas que no ha visto. */
    async nudges(user) {
      const actor = await actorOf(user);
      if (actor.role === 'ADMIN') return (await repo().pending()).map(permissionRequestNudge);
      return (await repo().answers(actor.ref)).map(permissionAnswerNudge);
    },
    dismissAnswer: async (user, id) => repo().markSeen((await actorOf(user)).ref, id)
  };
};

let instance;
export const getPermissionRequestService = () => instance ||= createPermissionRequestService();
