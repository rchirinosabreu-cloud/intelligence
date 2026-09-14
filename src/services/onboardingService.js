import prisma from '../lib/prisma.js';
import { isActiveTeamUser } from './teamRosterService.js';

const versions = { welcome: 1, cotizaciones: 1 };
const fail = (message, statusCode) => { throw Object.assign(new Error(message), { statusCode }); };
async function currentUser(userId, db) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, modulePermissions: true, isActive: true, mustChangePassword: true, onboardingEligible: true, teamMember: { select: { isActive: true, name: true } } } });
  if (!isActiveTeamUser(user)) fail('Tu cuenta ya no está activa.', 403);
  if (user.mustChangePassword) fail('Primero debes cambiar tu contraseña.', 428);
  return user;
}
export async function getOnboarding(userId, db = prisma) {
  const user = await currentUser(userId, db);
  const rows = await db.userGuideProgress.findMany({ where: { userId } });
  const autoOnboarding = user.onboardingEligible === true;
  const progress = Object.fromEntries(rows.filter(row => versions[row.guideId] === row.version).map(row => [row.guideId, row.status]));
  // Derived exclusions also stop older, already-open clients on their next poll.
  // They are NOT persisted as fake completion and do not hide real guide history.
  if (!autoOnboarding) {
    progress.welcome ||= 'NOT_APPLICABLE';
    progress.cotizaciones ||= 'NOT_APPLICABLE';
  }
  return { user: { id: user.id, name: user.teamMember.name || user.name, role: user.role, modulePermissions: user.modulePermissions }, autoOnboarding, progress };
}
export async function acknowledgeOnboarding(userId, { guideId, version, status } = {}, db = prisma) {
  if (!Object.hasOwn(versions, guideId) || versions[guideId] !== version || !['COMPLETED', 'SKIPPED'].includes(status)) fail('La guía o su versión no es válida.', 400);
  return db.$transaction(async tx => {
    // Serialize acknowledgements for this user; no unrelated user is locked.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await currentUser(userId, tx);
    if (guideId === 'welcome' && user.onboardingEligible !== true) fail('La bienvenida está reservada al primer acceso de cuentas nuevas.', 403);
    if (guideId === 'cotizaciones' && user.role !== 'ADMIN' && user.modulePermissions?.cotizaciones !== true) fail('No tienes acceso a Cotizaciones.', 403);
    const where = { userId_guideId_version: { userId, guideId, version } };
    const existing = await tx.userGuideProgress.findUnique({ where });
    if (existing?.status === 'COMPLETED') return existing;
    return tx.userGuideProgress.upsert({ where, create: { userId, guideId, version, status }, update: { status } });
  });
}
