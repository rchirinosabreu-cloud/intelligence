// La bóveda vista desde la persona: en cada llamada se vuelve a leer su cuenta (rol, sesión, pertenencia
// al equipo) y los clientes que lleva hoy como PM, así que un cambio de responsable o una baja se aplican en
// el acto, sin esperar a que venza la sesión.

import { getSidecarPool } from '../lib/sidecarPool.js';
import prisma from '../lib/prisma.js';
import { canUseVault } from '../lib/vaultAccess.js';
import { vaultKey } from '../lib/vaultCrypto.js';
import { requestNudge, answerNudge, requestNotificationText, answerNotificationText, decisionMessage, cleanAccessNote } from '../lib/vaultAccessRequests.js';
import { createVaultRepository } from './vaultRepository.js';
import { createNotification } from './notificationService.js';
import { alertByWhatsApp } from './whatsappAlertSender.js';
import { accessAlert } from '../lib/whatsappAlerts.js';

const vaultError = (message, status, code) => Object.assign(new Error(message), { status, code });
export const VAULT_ACCESS_REQUESTED = 'VAULT_ACCESS_REQUESTED';
export const VAULT_ACCESS_SHARED = 'VAULT_ACCESS_SHARED';
export const VAULT_ACCESS_DENIED = 'VAULT_ACCESS_DENIED';

export const createVaultService = ({ repository, db = prisma, notify = createNotification, logger = console, whatsapp = alertByWhatsApp }) => {
  const resolve = async (user) => {
    const row = await db.user.findUnique({
      where: { id: user?.userId || user?.id || '' },
      select: { id: true, name: true, role: true, isActive: true, sessionVersion: true, teamMember: { select: { id: true, name: true, isActive: true } } }
    });
    if (!row || row.sessionVersion !== (user?.sessionVersion ?? 0) || (user?.exp && user.exp * 1000 <= Date.now())) throw vaultError('Tu sesión ya no está activa.', 401, 'TOKEN_REVOKED');
    if (!canUseVault(row) || !row.teamMember?.isActive) throw vaultError('La bóveda está disponible para administradores y project managers del equipo.', 403, 'VAULT_FORBIDDEN');
    const managed = row.role === 'PROJECT_MANAGER'
      ? (await db.client.findMany({ where: { projectManagerId: row.teamMember.id }, select: { id: true } })).map((client) => client.id)
      : [];
    return { ref: row.id, name: row.teamMember?.name || row.name || 'Equipo', role: row.role, active: true, managedClientIds: managed };
  };
  // Un aviso que no se entrega nunca deshace un pedido ni una decisión que sí quedaron guardados.
  const safeNotify = async (row) => {
    try { await notify(row); } catch (failure) { logger.error('[Vault] No se pudo avisar del pedido de acceso:', failure?.message || failure); }
  };
  const activeAdmins = async () => (await db.user.findMany({
    where: { role: 'ADMIN', isActive: true, teamMember: { is: { isActive: true } } },
    select: { id: true, name: true, teamMember: { select: { name: true } } }
  })).map((row) => ({ id: row.id, name: row.teamMember?.name || row.name || 'Administración' }));

  return {
    resolve,
    list: async (user, filters) => repository.list(await resolve(user), filters),
    get: async (user, id) => repository.get(await resolve(user), id),
    reveal: async (user, id, via) => repository.reveal(await resolve(user), id, via),
    create: async (user, input) => repository.create(await resolve(user), input),
    update: async (user, id, revision, input) => repository.update(await resolve(user), id, revision, input),
    retire: async (user, id, revision, reason) => repository.retire(await resolve(user), id, revision, reason),
    reveals: async (user, id) => repository.reveals(await resolve(user), id),

    // Pedir un acceso (Rodny, 15 de octubre de 2026): lo que existe pero esta persona no ve, y pedírselo a quien
    // administra. Cada administrador activo recibe el aviso una sola vez; decide el primero.
    requestable: async (user, filters) => repository.requestable(await resolve(user), filters),
    async requestAccess(user, credentialId, note) {
      const actor = await resolve(user);
      const out = await repository.requestAccess(actor, credentialId, cleanAccessNote(note));
      if (out.alreadyVisible || out.deniedRecently) return out;
      const admins = await activeAdmins();
      if (out.created) {
        for (const admin of admins) {
          await safeNotify({ userId: admin.id, type: VAULT_ACCESS_REQUESTED, message: requestNotificationText(out.request), relatedId: out.request.id });
          // Y por WhatsApp, con Compartir / Denegar (22 de octubre de 2026). Nunca lleva un valor de la bóveda.
          whatsapp({ userId: admin.id, ...accessAlert({ type: 'VAULT', request: out.request, text: requestNotificationText(out.request) }) });
        }
      }
      return { ...out, admins: admins.map((admin) => admin.name) };
    },
    async decideRequest(user, id, decision) {
      const actor = await resolve(user);
      if (actor.role !== 'ADMIN') throw vaultError('Un pedido de acceso lo decide un administrador.', 403, 'VAULT_FORBIDDEN');
      const request = await repository.getRequest(id);
      if (!request) throw vaultError('Ese pedido ya no existe.', 404, 'VAULT_REQUEST_NOT_FOUND');
      if (decision === 'APPROVE' && request.status === 'PENDING') {
        // Solo se comparte con quien sigue siendo project manager activo del equipo.
        const requester = await db.user.findUnique({ where: { id: request.requesterRef }, select: { id: true, role: true, isActive: true, teamMember: { select: { isActive: true } } } });
        if (!requester || requester.role !== 'PROJECT_MANAGER' || !requester.isActive || !requester.teamMember?.isActive) throw vaultError(`${request.requesterName} ya no es project manager activa del equipo: no se puede compartir.`, 409, 'VAULT_REQUESTER_INACTIVE');
      }
      const out = await repository.decideRequest(actor, id, decision);
      if (out.decided) {
        await safeNotify({ userId: out.request.requesterRef, type: out.request.status === 'APPROVED' ? VAULT_ACCESS_SHARED : VAULT_ACCESS_DENIED, message: answerNotificationText(out.request), relatedId: out.request.id });
      }
      return { ...out, message: decisionMessage(out.request, { alreadyDecided: Boolean(out.alreadyDecided) }) };
    },
    /** Lo que va encima de Bria: a un administrador, los pedidos por decidir; a quien pidió, las respuestas. */
    async accessNudges(user) {
      const actor = await resolve(user);
      if (actor.role === 'ADMIN') return (await repository.pendingRequests(actor)).map(requestNudge);
      return (await repository.requestAnswers(actor)).map(answerNudge);
    },
    dismissAnswer: async (user, id) => repository.markRequestSeen(await resolve(user), id)
  };
};

let instance;
export const getVaultService = () => instance ||= createVaultService({
  repository: createVaultRepository({
    pool: getSidecarPool(),
    key: vaultKey()
  })
});
