// Contexto unido a la lectura, no una clasificación del cliente ni una autorización.
// No hay interpretación de frases: el modelo contrasta hechos, periodos y compromisos.
const unavailableLearning = () => ({ estado: 'NO_DISPONIBLE', parcial: true, registros: [], nota: 'No se pudo consultar la memoria anterior; esto no demuestra ausencia de acuerdos.' });
const learningContext = (group, scope, clientId = null) => {
  if (group?.state !== 'CONSULTADO') return unavailableLearning();
  const rows = group.learnings || [];
  const visible = rows.filter(row => row.status === 'ACTIVE' && row.scope === scope && (scope === 'AGENCY' || row.contextClientId === clientId));
  return {
    estado: 'CONSULTADO', parcial: Boolean(group.partial || visible.length !== rows.length),
    registros: visible.map(row => ({
      id: row.id, revision: row.revision, entidad: row.entity, tema: row.topic,
      afirmacion: row.text, certeza: row.kind, desde: row.validFrom ?? null, hasta: row.validUntil ?? null,
      registradoPor: row.author, actualizadoEn: row.updatedAt, origen: 'Aprendizaje anterior guardado en Bria'
    })),
    nota: 'Contrasta el periodo y la certeza originales con la evidencia actual; una propuesta no es una decisión confirmada.'
  };
};

export const readDecisionContext = async (context, clients) => {
  const unique = [...new Map(clients.filter(row => row.id).map(row => [row.id, { id: row.id, name: row.name }])).values()];
  await context.revalidate?.();
  const canReadLegacy = ['ADMIN', 'PROJECT_MANAGER'].includes(context.user?.role);
  const read = async (action, code) => {
    try { return await action?.(); }
    catch (error) {
      if ([401, 403].includes(error?.status)) throw error;
      (context.logger || console).warn(`[BriaDecisionContext] ${code}`);
      return undefined;
    }
  };
  const [result, legacy] = await Promise.all([
    read(context.agencyFacts?.contextForClients && (() => context.agencyFacts.contextForClients(context.user, unique)), 'BRIA_CONTEXT_UNAVAILABLE'),
    read(canReadLegacy && context.knowledge?.businessContext ? () => context.knowledge.businessContext(context.user, unique) : undefined, 'BRIA_LEGACY_CONTEXT_UNAVAILABLE')
  ]);
  await context.revalidate?.();
  const accounts = new Map((result?.cuentas || []).map(row => [row.clientId, row]));
  const legacyAccounts = new Map((legacy?.accounts || []).map(row => [row.clientId, row]));
  const agency = learningContext(legacy?.agency, 'AGENCY');
  const forClient = id => ({
    ...(accounts.get(id) || { clientId: id, estado: 'NO_DISPONIBLE', parcial: true, hechos: [], nota: 'No se pudo contrastar la memoria de esta cuenta. Los contadores no prueban por sí solos un compromiso vigente.' }),
    aprendizajesAnteriores: learningContext(legacyAccounts.get(id), 'ACCOUNT', id)
  });
  const selected = unique.map(client => forClient(client.id));
  const learningSources = [...agency.registros, ...selected.flatMap(account => account.aprendizajesAnteriores.registros)].map(row => ({ kind: 'aprendizaje', id: row.id, label: row.entidad || 'Memoria de la agencia' }));
  return {
    partial: agency.parcial || selected.some(account => account.parcial || account.estado !== 'CONSULTADO' || account.aprendizajesAnteriores.parcial),
    forClient, agency,
    sources: [...selected.flatMap(row => row.hechos.map(fact => ({ kind: 'hecho_agencia', id: fact.id, label: fact.entidad || clients.find(client => client.id === row.clientId)?.name || 'Contexto de la cuenta' }))), ...new Map(learningSources.map(source => [source.id, source])).values()]
  };
};

export const decisionContract = contract => contract ? {
  estado: contract.status, inicio: contract.startDate, fin: contract.endDate ?? null,
  notas: contract.notes ?? null,
  alcance: 'Registro operativo; su estado no demuestra firma ni renovación para otro periodo.'
} : null;
