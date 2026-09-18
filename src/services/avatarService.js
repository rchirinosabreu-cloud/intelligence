import prisma from '../lib/prisma.js';
import { uploadAvatar, deleteFileFromGCS } from '../services/storageService.js';

const notFound = () => Object.assign(new Error('Perfil no encontrado.'), { statusCode: 404 });

/** Ruta interna de almacenamiento guardada dentro de la URL del proxy de avatar. */
export const extractAvatarGcsPath = (avatarUrl) => {
  if (typeof avatarUrl !== 'string' || !avatarUrl.includes('gcsPath=')) return null;
  const raw = avatarUrl.split('gcsPath=')[1]?.split('&')[0];
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.startsWith('avatars/') ? decoded : null;
  } catch {
    return null;
  }
};

export const buildAvatarProxyUrl = (targetId, gcsPath) => `/api/talent-radar/member/${targetId}/avatar-image?gcsPath=${encodeURIComponent(gcsPath)}`;

/**
 * Cada persona cambia su propia foto: reemplaza el archivo en almacenamiento y deja la misma URL en
 * `User.avatarUrl` y en `TeamMember.avatarUrl` dentro de una transacción. La foto anterior se borra
 * después de subir la nueva, nunca antes, para no dejar a la persona sin foto si algo falla.
 */
export const replaceProfileAvatar = async ({ userId, file, db = prisma, storage = { uploadAvatar, deleteFileFromGCS } }) => {
  if (!userId) throw Object.assign(new Error('Usuario no autenticado.'), { statusCode: 401 });
  const userProfile = await db.user.findUnique({ where: { id: userId }, select: { id: true, avatarUrl: true } });
  if (!userProfile) throw notFound();
  const teamMember = await db.teamMember.findFirst({ where: { userId }, select: { id: true, avatarUrl: true } });

  const targetId = teamMember?.id || userProfile.id;
  const uploadResult = await storage.uploadAvatar(file, targetId);
  const avatarUrl = buildAvatarProxyUrl(targetId, uploadResult.gcsPath);

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userProfile.id }, data: { avatarUrl } });
    if (teamMember) await tx.teamMember.update({ where: { id: teamMember.id }, data: { avatarUrl } });
  });

  const previousPath = extractAvatarGcsPath(teamMember?.avatarUrl || userProfile.avatarUrl);
  if (previousPath && previousPath !== uploadResult.gcsPath) {
    try {
      await storage.deleteFileFromGCS(previousPath);
    } catch (error) {
      console.error('[Avatar] No se pudo borrar la foto anterior:', error?.message || error);
    }
  }

  return { avatarUrl, targetId };
};
