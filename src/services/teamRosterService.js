// Current membership comes only from Equipo. Historical attribution must not use this filter.
export const activeTeamUserWhere = () => ({
  isActive: true,
  teamMember: { is: { isActive: true } }
});

export const isActiveTeamUser = user => Boolean(
  user?.isActive === true && user.teamMember?.isActive === true
);

export const findActiveTeamUser = (db, userId) => !userId ? Promise.resolve(null) : db.user.findFirst({
  where: { id: userId, ...activeTeamUserWhere() },
  select: { id: true }
});

// Validate only newly selected members; an unchanged historical assignment stays readable/editable.
export const assertActiveTeamMembers = async (db, memberIds, previousIds = []) => {
  const ids = [...new Set(memberIds.filter(Boolean))].filter(id => !previousIds.includes(id));
  if (!ids.length) return;
  const members = await db.teamMember.findMany({
    where: { id: { in: ids }, isActive: true }, select: { id: true }
  });
  if (members.length !== ids.length) {
    const error = new Error('Selecciona una persona activa del módulo Equipo. Actualiza la lista e inténtalo nuevamente.');
    error.statusCode = 400;
    throw error;
  }
};

export const readParticipationRoster = async db => {
  const members = await db.teamMember.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, avatarUrl: true, role: true, isActive: true, userId: true,
      user: { select: { role: true } }
    },
    orderBy: { name: 'asc' }
  });
  return members.map(member => ({
    id: member.userId || member.id,
    name: member.name,
    avatarUrl: member.avatarUrl,
    role: member.user?.role || member.role,
    isActive: member.isActive,
    teamMember: { id: member.id, isActive: member.isActive }
  }));
};

// Must be called in the transaction that changes TeamMember, never as a later side effect.
export const setLinkedAccountStatus = async (tx, member, isActive) => {
  if (!member.userId) return;
  await tx.user.update({
    where: { id: member.userId },
    data: { isActive, sessionVersion: { increment: 1 } }
  });
  if (!isActive) {
    await tx.pushSubscription.updateMany({
      where: { userId: member.userId, isActive: true },
      data: { isActive: false }
    });
  }
};
