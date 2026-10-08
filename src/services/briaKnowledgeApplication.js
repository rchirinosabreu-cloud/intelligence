import pg from 'pg';
import prisma from '../lib/prisma.js';
import { hasModulePermission } from '../config/security.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { createBriaKnowledgeRepository } from './briaKnowledgeRepository.js';
import { createBriaKnowledgeService } from './briaKnowledgeService.js';
let instance;
export const resolveKnowledgeActor = async (user, db = prisma) => {
  const row = await db.user.findUnique({ where: { id: user?.userId || user?.id || '' }, select: { id: true, name: true, role: true, isActive: true, modulePermissions: true, sessionVersion: true, teamMember: { select: { isActive: true } } } });
  if (!row || row.sessionVersion !== (user.sessionVersion ?? 0) || (user.exp && user.exp * 1000 <= Date.now())) throw knowledgeError('Tu sesión ya no está activa.', 401, 'TOKEN_REVOKED');
  if (!canUseBria(row) || !row.teamMember?.isActive) throw knowledgeError('Bria no está activada para tu cuenta.', 403, 'BRIA_DISABLED');
  const accountIds = row.role === 'ADMIN' || !hasModulePermission(row, 'parrillas') ? [] : (await db.client.findMany({ where: { isArchived: false }, select: { id: true, name: true, slug: true } })).flatMap(client => [client.id, client.name, client.slug].filter(Boolean));
  Object.assign(user, { role: row.role, modulePermissions: row.modulePermissions });
  return { ref: row.id, name: row.name, role: row.role, accountIds, permissions: row.modulePermissions };
};
export const getApplicationKnowledgeService = () => instance ||= createBriaKnowledgeService({ repository: createBriaKnowledgeRepository({ pool: new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }), workspace: 'application' }), resolveActor: resolveKnowledgeActor });
