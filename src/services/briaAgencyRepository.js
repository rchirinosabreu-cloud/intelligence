// The imported mailbox has no per-document team ACL. Only an explicitly configured,
// active administrator may read it; native platform permissions remain independent.
export const createBriaAgencyRepository = ({ repository, resolveActor, ownerIds = [] }) => {
  const owners = new Set(ownerIds);
  const authorize = async user => {
    const actor = await resolveActor(user);
    if (actor.role !== 'ADMIN' || !owners.has(actor.ref)) throw Object.assign(new Error('La memoria de correo y Drive no está habilitada para tu cuenta.'), { status: 403 });
    return actor;
  };
  const read = async (user, action) => {
    const actor = await authorize(user), result = await action(actor);
    await authorize(user);
    return result;
  };
  return {
    async canRead(user) {
      try { await authorize(user); return true; }
      catch (failure) { if ([401, 403].includes(failure.status)) return false; throw failure; }
    },
    search: (user, query) => read(user, actor => repository.search(actor, String(query || '').slice(0, 1000))),
    read: (user, id, offset = 0) => read(user, actor => repository.read(actor, String(id || '').slice(0, 500), offset)),
    overview: user => read(user, async () => ({ ...await repository.status(), continuousSync: false, authority: 'Referencia histórica; consulta la plataforma para el estado actual.' })),
    inbox: user => read(user, async () => []),
    review: user => read(user, async () => { throw Object.assign(new Error('Ese seguimiento no está disponible.'), { status: 404 }); })
  };
};
