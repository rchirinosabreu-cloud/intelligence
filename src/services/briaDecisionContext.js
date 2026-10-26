// Contexto unido a la lectura, no una clasificación del cliente ni una autorización.
// No hay interpretación de frases: el modelo contrasta hechos, periodos y compromisos.
export const readDecisionContext = async (context, clients) => {
  const unique = [...new Map(clients.filter(row => row.id).map(row => [row.id, { id: row.id, name: row.name }])).values()];
  let result;
  try {
    await context.revalidate?.();
    if (context.agencyFacts?.contextForClients) result = await context.agencyFacts.contextForClients(context.user, unique);
    await context.revalidate?.();
  } catch (error) {
    if ([401, 403].includes(error?.status)) throw error;
    (context.logger || console).warn('[BriaDecisionContext] BRIA_CONTEXT_UNAVAILABLE');
  }
  const accounts = new Map((result?.cuentas || []).map(row => [row.clientId, row]));
  return {
    partial: unique.some(client => !accounts.has(client.id) || accounts.get(client.id).parcial || accounts.get(client.id).estado !== 'CONSULTADO'),
    forClient: id => accounts.get(id) || { clientId: id, estado: 'NO_DISPONIBLE', parcial: true, hechos: [], nota: 'No se pudo contrastar la memoria de esta cuenta. Los contadores no prueban por sí solos un compromiso vigente.' },
    sources: (result?.cuentas || []).flatMap(row => row.hechos.map(fact => ({ kind: 'hecho_agencia', id: fact.id, label: fact.entidad || clients.find(client => client.id === row.clientId)?.name || 'Contexto de la cuenta' })))
  };
};

export const decisionContract = contract => contract ? {
  estado: contract.status, inicio: contract.startDate, fin: contract.endDate ?? null,
  notas: contract.notes ?? null,
  alcance: 'Registro operativo; su estado no demuestra firma ni renovación para otro periodo.'
} : null;
