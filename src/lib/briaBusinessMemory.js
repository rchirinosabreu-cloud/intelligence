// Adaptador de lectura para enseñanzas anteriores al registro de hechos. No
// migra datos, no cambia su certeza y nunca mezcla preferencias personales.
import { learningKey } from './briaKnowledge.js';

export const businessMemoryClientKeys = (clients, catalog) => {
  const owners = new Map();
  for (const client of catalog) for (const key of new Set([client.id, client.name, client.slug].filter(Boolean).map(learningKey))) {
    if (!owners.has(key)) owners.set(key, new Set());
    owners.get(key).add(client.id);
  }
  const native = new Map(catalog.map(client => [client.id, client]));
  return [...new Set(clients.map(client => client.id).filter(Boolean))].flatMap(id => {
    const client = native.get(id);
    if (!client) return [];
    const keys = [...new Set([client.id, client.name, client.slug].filter(Boolean).map(learningKey))].filter(key => owners.get(key).size === 1);
    return keys.length ? [{ id, keys }] : [];
  });
};

export const isBusinessLearning = row => ['ACCOUNT', 'AGENCY'].includes(row?.scope) && row.status === 'ACTIVE';

export const buildBusinessMemoryContext = (rows, clients, limit = 6) => {
  const visible = rows.filter(isBusinessLearning);
  const group = selected => ({
    state: 'CONSULTADO', partial: selected.length > limit,
    learnings: selected.slice(0, limit).map(row => ({ ...row, source: { kind: 'aprendizaje', id: row.id } }))
  });
  return {
    agency: group(visible.filter(row => row.scope === 'AGENCY')),
    accounts: [...new Map(clients.map(client => [client.id, client])).values()].map(client => ({
      clientId: client.id, ...group(visible.filter(row => row.scope === 'ACCOUNT' && row.contextClientId === client.id))
    }))
  };
};
