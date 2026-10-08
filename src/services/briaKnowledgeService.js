import { validateLearning, learningVisible, knowledgeError } from '../lib/briaKnowledge.js';
export const createBriaKnowledgeService = ({ repository, resolveActor }) => {
  const authorize = (actor, row, write = false) => {
    if (!['ADMIN', 'PROJECT_MANAGER'].includes(actor?.role) || !learningVisible(row, actor)) throw knowledgeError('No tienes acceso a este aprendizaje.', 403, 'BRIA_KNOWLEDGE_FORBIDDEN');
    if (write && row.scope === 'AGENCY' && actor.role !== 'ADMIN') throw knowledgeError('Las reglas generales las confirma un administrador.', 403, 'BRIA_KNOWLEDGE_FORBIDDEN');
  };
  return {
    async registryHistory(user, id) {
      if ((await resolveActor(user)).role !== 'ADMIN') throw knowledgeError('El Registro está disponible solo para administradores.', 403);
      const rows = await this.history(user, id);
      if ((await resolveActor(user)).role !== 'ADMIN') throw knowledgeError('El Registro está disponible solo para administradores.', 403);
      return rows;
    },
    async registry(user, query = '') {
      if ((await resolveActor(user)).role !== 'ADMIN') throw knowledgeError('El Registro está disponible solo para administradores.', 403);
      const rows = await this.list(user, query);
      if ((await resolveActor(user)).role !== 'ADMIN') throw knowledgeError('El Registro está disponible solo para administradores.', 403);
      return rows;
    },
    async list(user, query = '') {
      const rows = await repository.list(await resolveActor(user), String(query).slice(0, 1000));
      const actor = await resolveActor(user);
      return rows.filter(row => learningVisible(row, actor));
    },
    async save(user, input) {
      const actor = await resolveActor(user), learning = validateLearning(input);
      authorize(actor, { ...learning, subjectRef: actor.ref }, true);
      const revalidate = async row => { Object.assign(actor, await resolveActor(user)); authorize(actor, row || { ...learning, subjectRef: actor.ref }, true); };
      return repository.save({ actor, learning, id: input.id || null, expectedRevision: input.expectedRevision, reason: String(input.reason || 'Enseñanza explícita del equipo').slice(0, 500), revalidate });
    },
    async history(user, id) {
      const rows = await repository.history(await resolveActor(user), id);
      const actor = await resolveActor(user);
      if (rows.length) authorize(actor, rows[0].after);
      return rows;
    },
    async undo(user, id, expectedRevision) {
      const actor = await resolveActor(user);
      return repository.undo({ actor, id, expectedRevision, revalidate: async row => { Object.assign(actor, await resolveActor(user)); authorize(actor, row, true); } });
    },
    async revoke(user, id, expectedRevision) {
      const actor = await resolveActor(user);
      return repository.revoke({ actor, id, expectedRevision, revalidate: async row => { Object.assign(actor, await resolveActor(user)); authorize(actor, row, true); } });
    }
  };
};
