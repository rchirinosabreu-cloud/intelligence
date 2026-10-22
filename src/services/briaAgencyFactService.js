// La memoria de la agencia vista desde la persona que conversa con Bria: se vuelve a leer su cuenta en cada
// consulta (rol, Bria activada, permisos de módulo, nivel financiero, sesión y pertenencia al equipo), así
// que un permiso retirado no sobrevive en un token viejo.

import { getSidecarPool } from '../lib/sidecarPool.js';
import prisma from '../lib/prisma.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { factAccess, factError, factKey, presentFact, PERSON_TOPIC } from '../lib/briaAgencyFacts.js';
import { rankByName } from '../lib/fuzzyMatch.js';
import { createBriaAgencyFactRepository } from './briaAgencyFactRepository.js';

const NOTE = 'Memoria de la agencia: lo confirmado por el equipo manda sobre la lectura del negocio, y la plataforma actual manda sobre ambas para el estado de hoy. Di la certeza con estas palabras.';
// Las fichas del equipo (Rodny, 20 de octubre de 2026): cómo trabajar con cada persona, para que Bria le escriba como se
// le habla a ella, sepa qué revisar y qué confiar. Solo administración, y nunca se recitan.
const FICHA_NOTE = 'Úsala sin recitarla: nunca digas «según tu ficha» ni cuentes a nadie —ni a la persona ni a un compañero— qué dice. Cambia el tono, lo que revisas y lo que propones; no es un juicio sobre la persona. Si la dirección te corrige o precisa algo de ella, ofrece guardarlo con guardar_en_memoria (entidad el nombre completo, tipoEntidad persona, tema como-trabajar, proposito personas).';

/** La persona del equipo a la que se refiere un nombre: exacto, por nombre de pila único, o lo más parecido. */
const findMember = (members, name) => {
  const key = factKey(name);
  if (!key) return { member: null };
  const exact = members.find((m) => factKey(m.name) === key);
  if (exact) return { member: exact };
  const byFirst = members.filter((m) => factKey(m.name).split(' ')[0] === key);
  if (byFirst.length === 1) return { member: byFirst[0] };
  if (byFirst.length > 1) return { member: null, candidates: byFirst };
  const close = rankByName(members, name);
  if (close.length === 1 || (close.length > 1 && close[0].score - close[1].score >= 0.15)) return { member: close[0] };
  return { member: null, candidates: close };
};

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

    /** Cómo trabajar con alguien del equipo. Solo administración; sin ficha dice que no la hay, nunca inventa una. */
    async howToWorkWith(user, { nombre = '' } = {}) {
      const { user: row, access } = await resolve(user);
      if (String(row.role).toUpperCase() !== 'ADMIN') throw factError('Las fichas del equipo son de administración.', 403, 'BRIA_FICHA_FORBIDDEN');
      const members = await db.teamMember.findMany({ where: { isActive: true }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } });
      const { member, candidates = [] } = findMember(members, nombre);
      if (!member) {
        return candidates.length
          ? { persona: null, ficha: null, candidatos: candidates.map((m) => m.name), nota: 'Hay varias personas con un nombre parecido: pregunta cuál.' }
          : { persona: null, ficha: null, nota: 'No hay nadie en el equipo activo con ese nombre.' };
      }
      const rows = await repository.search(access, { entity: member.name, topic: PERSON_TOPIC, limit: 20 });
      const persona = { nombre: member.name, rol: member.role || null };
      if (!rows.length) return { persona, ficha: null, nota: `${member.name} no tiene ficha todavía: háblale con lo que pide su rol y lo que veas en la plataforma.` };
      return { persona, ficha: rows.map((fact) => fact.statement), nota: FICHA_NOTE };
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
