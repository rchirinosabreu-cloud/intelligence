// La memoria de la agencia vista desde la persona que conversa con Bria: se vuelve a leer su cuenta en cada
// consulta (rol, Bria activada, permisos de módulo, nivel financiero, sesión y pertenencia al equipo), así
// que un permiso retirado no sobrevive en un token viejo.

import { getSidecarPool } from '../lib/sidecarPool.js';
import prisma from '../lib/prisma.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { factAccess, factError, presentFact } from '../lib/briaAgencyFacts.js';
import { createBriaAgencyFactRepository } from './briaAgencyFactRepository.js';

const NOTE = 'Memoria de la agencia: lo confirmado por el equipo manda sobre la lectura del negocio, y la plataforma actual manda sobre ambas para el estado de hoy. Di la certeza con estas palabras.';

export const createBriaAgencyFactService = ({ repository, db = prisma }) => {
  const resolve = async (user) => {
    const row = await db.user.findUnique({
      where: { id: user?.userId || user?.id || '' },
      select: { id: true, name: true, role: true, isActive: true, modulePermissions: true, financialRole: true, sessionVersion: true, teamMember: { select: { name: true, isActive: true } } }
    });
    if (!row || row.sessionVersion !== (user?.sessionVersion ?? 0) || (user?.exp && user.exp * 1000 <= Date.now())) throw factError('Tu sesión ya no está activa.', 401, 'TOKEN_REVOKED');
    if (!canUseBria(row) || !row.teamMember?.isActive) throw factError('Bria no está activada para tu cuenta.', 403, 'BRIA_DISABLED');
    return { user: row, access: factAccess(row), actor: { ref: row.id, name: row.teamMember?.name || row.name || 'Equipo' } };
  };

  return {
    async consult(user, { consulta = '', clientId = null, entidad = null } = {}) {
      const { access } = await resolve(user);
      const rows = await repository.search(access, { query: consulta, clientId, entity: entidad, limit: 30 });
      const questions = (clientId || entidad) ? await repository.openQuestions(access, { clientId, entity: entidad, limit: 3 }) : [];
      return {
        hechos: rows.map(presentFact),
        dudas: questions.map((q) => ({ id: q.id, entidad: q.entity, pregunta: q.question, porQueImporta: q.why, quienResponde: q.who, prioridad: q.priority })),
        nota: NOTE
      };
    },

    async record(user, args = {}) {
      const { user: row, access, actor } = await resolve(user);
      const result = await repository.record({
        actor, access, user: row,
        fact: {
          entidad: args.entidad, tipoEntidad: args.tipoEntidad || 'cliente', tema: args.tema, afirmacion: args.afirmacion,
          certeza: args.certeza || 'CONFIRMADO', proposito: args.proposito || 'operacion', desde: args.desde || null, hasta: args.hasta || null,
          fuentes: [{ tipo: 'equipo', ref: `Conversación con Bria (${actor.name})`, fecha: null }]
        },
        clientId: args.clientId || null,
        replaces: (args.reemplaza || []).map((r) => ({ id: String(r.id), revision: Number.isInteger(r.revision) ? r.revision : null })),
        answersQuestion: args.respondeDuda || null
      });
      await resolve(user);
      return result;
    },

    async retire(user, { id, revision } = {}) {
      const { user: row, access, actor } = await resolve(user);
      return repository.retire({ actor, access, user: row, id: String(id || ''), revision: Number.isInteger(revision) ? revision : null, reason: `Retirado por ${actor.name} en conversación` });
    }
  };
};

let instance;
export const getAgencyFactService = () => instance ||= createBriaAgencyFactService({
  repository: createBriaAgencyFactRepository({
    pool: getSidecarPool(),
    workspace: 'application'
  })
});
