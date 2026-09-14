import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { isActiveTeamUser } from './teamRosterService.js';

const fail = (message, statusCode = 409) => { throw Object.assign(new Error(message), { statusCode }); };

// Plaintext exists only for the successful admin response; never persist it or log it.
export async function createInitialCredential() {
  const temporaryPassword = `Bs!${randomBytes(18).toString('base64url')}`;
  return { temporaryPassword, hash: await bcrypt.hash(temporaryPassword, 12) };
}

export async function prepareInitialAccess({ requester, memberId, confirmation, expectedSessionVersion }, db = prisma) {
  if (requester?.role !== 'ADMIN') fail('Solo un administrador puede preparar el acceso inicial.', 403);
  if (confirmation !== 'GENERAR' || !Number.isInteger(expectedSessionVersion) || expectedSessionVersion < 0) {
    fail('Confirma la generación del acceso y actualiza el equipo antes de continuar.', 400);
  }
  const credential = await createInitialCredential();
  return db.$transaction(async tx => {
    const actor = await tx.user.findUnique({ where: { id: requester.userId || requester.id }, include: { teamMember: true } });
    if (!isActiveTeamUser(actor) || actor.role !== 'ADMIN') fail('Tu cuenta no tiene permisos para preparar accesos.', 403);
    const member = await tx.teamMember.findUnique({ where: { id: memberId }, include: { user: true } });
    const user = member?.user;
    if (!member?.isActive || !user?.isActive || !user.mustChangePassword || user.passwordChangedAt !== null || user.sessionVersion !== expectedSessionVersion) {
      fail('El acceso inicial ya cambió o no está disponible. Actualiza Equipo; las cuentas que ya eligieron su contraseña deben usar recuperación.');
    }
    const changed = await tx.user.updateMany({
      where: { id: user.id, isActive: true, mustChangePassword: true, passwordChangedAt: null, sessionVersion: expectedSessionVersion, teamMember: { is: { id: memberId, isActive: true } } },
      data: { password: credential.hash, sessionVersion: { increment: 1 } },
    });
    if (changed.count !== 1) fail('El acceso cambió durante la solicitud. Actualiza Equipo y vuelve a intentarlo.');
    const now = new Date();
    await tx.passwordResetCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    await tx.pushSubscription.updateMany({ where: { userId: user.id, isActive: true }, data: { isActive: false } });
    await tx.operationalTraceEvent.create({ data: { eventType: 'ACCOUNT_INITIAL_ACCESS_PREPARED', actorId: actor.id, subjectUserId: user.id, metadata: { memberId }, occurredAt: now } });
    return { initialAccess: { name: member.name, email: user.email, temporaryPassword: credential.temporaryPassword } };
  }, { isolationLevel: 'Serializable' });
}
