// La bóveda vista desde la persona: en cada llamada se vuelve a leer su cuenta (rol, sesión, pertenencia
// al equipo) y los clientes que lleva hoy como PM, así que un cambio de responsable o una baja se aplican en
// el acto, sin esperar a que venza la sesión.

import pg from 'pg';
import prisma from '../lib/prisma.js';
import { canUseVault } from '../lib/vaultAccess.js';
import { vaultKey } from '../lib/vaultCrypto.js';
import { createVaultRepository } from './vaultRepository.js';

const vaultError = (message, status, code) => Object.assign(new Error(message), { status, code });

export const createVaultService = ({ repository, db = prisma }) => {
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
  return {
    resolve,
    list: async (user, filters) => repository.list(await resolve(user), filters),
    get: async (user, id) => repository.get(await resolve(user), id),
    reveal: async (user, id, via) => repository.reveal(await resolve(user), id, via),
    create: async (user, input) => repository.create(await resolve(user), input),
    update: async (user, id, revision, input) => repository.update(await resolve(user), id, revision, input),
    retire: async (user, id, revision, reason) => repository.retire(await resolve(user), id, revision, reason),
    reveals: async (user, id) => repository.reveals(await resolve(user), id)
  };
};

let instance;
export const getVaultService = () => instance ||= createVaultService({
  repository: createVaultRepository({
    pool: new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }),
    key: vaultKey()
  })
});
