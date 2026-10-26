// A recommendation depends on the context the model actually saw, not only on a
// counter. Fingerprints detect changed/retired facts without interpreting words.
import { createHash } from 'node:crypto';
import { factVisible } from './briaAgencyFacts.js';
import { isBusinessLearning } from './briaBusinessMemory.js';

const byId = rows => [...(rows || [])].sort((a, b) => a.id.localeCompare(b.id));
export const dailyMemoryIds = group => [...(group?.facts || []).map(fact => fact.id), ...(group?.learnings || []).filter(isBusinessLearning).map(learning => `aprendizaje:${learning.id}`)];

const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, stable(value[key])])) : value;
export const dailyContextFingerprint = context => createHash('sha256').update(JSON.stringify(stable({
  accounts: (context?.accounts || []).map(account => ({
    clientId: account.clientId, state: account.state, partial: Boolean(account.partial), contract: account.contract || null,
    facts: byId(account.facts), learnings: byId(account.learnings)
  })).sort((a, b) => a.clientId.localeCompare(b.clientId)),
  agency: context?.agency ? { state: context.agency.state, partial: Boolean(context.agency.partial), facts: byId(context.agency.facts), learnings: byId(context.agency.learnings) } : null,
  criteriaState: context?.criteriaState || 'CONSULTADO',
  criteria: [...(context?.criteria || [])].sort((a, b) => a.id.localeCompare(b.id))
}))).digest('hex');

export const saveDailyContext = context => context ? { accounts: context.accounts || [], agency: context.agency || null, criteria: context.criteria || [], criteriaState: context.criteriaState || 'CONSULTADO', fingerprint: dailyContextFingerprint(context) } : null;

export const dailyContextSources = context => [...new Map([
  ...(context?.accounts || []).flatMap(account => (account.facts || []).map(fact => ({ kind: 'hecho_agencia', id: fact.id, label: 'Contexto de la cuenta' }))),
  ...(context?.agency?.facts || []).map(fact => ({ kind: 'hecho_agencia', id: fact.id, label: 'Contexto de la agencia' })),
  ...[...(context?.accounts || []).flatMap(account => account.learnings || []), ...(context?.agency?.learnings || [])].filter(isBusinessLearning).map(row => ({ kind: 'aprendizaje', id: row.id, label: 'Aprendizaje de negocio' })),
  ...(context?.criteria || []).map(fact => ({ kind: 'hecho_agencia', id: fact.id, label: 'Criterio de la agencia' }))
].map(source => [`${source.kind}:${source.id}`, source])).values()];

export const contextualReview = decision => ({
  ...decision, title: `Revisar el compromiso de ${decision.subjectName}`, kind: 'VIGILAR',
  why: 'Hay una señal registrada. Falta contrastar el compromiso, su periodo y el contexto vigente antes de recomendar trabajo o seguimiento.',
  ask: null, rule: null, memoryEvidence: [], source: 'REGLA', needsContextReview: true
});

/** The persisted reading is historical. Return a safe view; never rewrite its
 * proposal ids or past verdicts and never make another model call just to read. */
export const projectReadingContext = (reading, current, access) => {
  const factSourceIds = current?.factSourceIds ? new Set(current.factSourceIds) : null;
  const visible = fact => (!factSourceIds || factSourceIds.has(fact.id)) && factVisible({ ...fact, purpose: fact.purpose || 'operacion' }, access);
  // Original business-learning ACL is revalidated by the repository; fact
  // purpose/sensitivity defaults never grant access to a legacy learning.
  const readableBusinessIds = new Set(current?.businessAccess?.readableIds || []);
  const businessVisible = row => isBusinessLearning(row) && readableBusinessIds.has(row.id);
  const stored = reading.context;
  const facts = [...(stored?.accounts || []).flatMap(account => account.facts || []), ...(stored?.agency?.facts || []), ...(stored?.criteria || [])];
  const learnings = [...(stored?.accounts || []).flatMap(account => account.learnings || []), ...(stored?.agency?.learnings || [])];
  const readable = facts.every(visible) && learnings.every(businessVisible);
  const unchanged = Boolean(stored?.fingerprint && stored.fingerprint === dailyContextFingerprint(current));
  const valid = unchanged && readable;
  const sameAccounts = ids => stored?.fingerprint && dailyContextFingerprint({ ...stored, accounts: stored.accounts.filter(row => ids.has(row.clientId)) })
    === dailyContextFingerprint({ ...current, accounts: (current?.accounts || []).filter(row => ids.has(row.clientId)) });
  const signals = new Map((reading.signals || []).map(signal => [signal.id, signal]));
  const sameDecision = decision => {
    const evidence = (decision.evidence || []).map(id => signals.get(id));
    if (!evidence.length || evidence.some(row => !row)) return false;
    const ids = new Set(evidence.filter(row => row.subjectType === 'CLIENT').map(row => row.subjectId));
    if (decision.subjectType === 'CLIENT') ids.add(decision.subjectId);
    return readable && sameAccounts(ids);
  };
  // Every generated paragraph saw the whole input. A hidden source can affect
  // an uncited sentence too; removing only its citation would not protect it.
  const visibleGroup = group => ({ ...group,
    partial: group.partial || (group.facts || []).some(fact => !visible(fact)) || (group.learnings || []).some(row => !businessVisible(row)),
    facts: (group.facts || []).filter(visible), learnings: (group.learnings || []).filter(businessVisible)
  });
  const context = saveDailyContext({
    ...current,
    accounts: (current?.accounts || []).map(visibleGroup),
    agency: current?.agency ? visibleGroup(current.agency) : null,
    criteria: (current?.criteria || []).filter(visible)
  });
  return {
    ...reading, context, contextChanged: !unchanged, contextRestricted: !readable,
    contextNotice: valid ? null : 'La lectura guardada necesita contrastarse con el contexto actual antes de retomar sus recomendaciones.',
    overview: valid ? reading.overview : null,
    accounts: Object.fromEntries(Object.entries(reading.accounts || {}).map(([id, account]) => [id, { ...account, lectura: readable && sameAccounts(new Set([id])) ? account.lectura : null }])),
    decisions: (reading.decisions || []).map(decision => sameDecision(decision) ? decision : { ...contextualReview(decision), originalSource: decision.source || 'NO_REGISTRADO' })
  };
};
