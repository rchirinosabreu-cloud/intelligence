// El libro de decisiones (Rodny, 19 de octubre de 2026: «avanza con el libro de decisiones»). Cada decisión que Bria
// propone en la lectura de la mañana queda anotada con lo que decidió la persona —la hizo, la descartó o la dejó para
// después— y, días más tarde, con lo que pasó, leído de las señales y nunca supuesto. Con eso Bria mide su acierto,
// cuenta lo que decidiste y deja de repetir lo que la dirección descarta. Es el primer lazo de aprendizaje: el código
// mide, la persona decide, y Bria solo ajusta lo que propone. Lógica pura; nunca un juicio sobre nadie.

export const VERDICTS = Object.freeze(['HECHO', 'NO', 'DESPUES']);
export const OUTCOMES = Object.freeze(['MEJORO', 'YA_NO_SE_VE', 'SIGUE']);
export const OUTCOME_AFTER_DAYS = 1;   // El desenlace se mira desde la lectura siguiente…
export const OUTCOME_UNTIL_DAYS = 14;  // …y hasta dos semanas; después queda sin desenlace.
export const SUPPRESS_AFTER = 3;       // Tres «no» seguidos a la misma decisión…
export const SUPPRESS_DAYS = 30;       // …en los últimos 30 días, y Bria deja de proponerla.
export const SUPPRESS_SEVERITY = 3;    // Salvo que la señal llegue a la gravedad máxima.

const fold = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const round2 = (value) => Math.round(value * 100) / 100;
const DAY = 86_400_000;
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY);

/** Lo que dijo la persona, en uno de los tres veredictos; `null` si no se entiende. */
export const normalizeVerdict = (value) => {
  const said = fold(value);
  if (!said) return null;
  if (/^(hecho|hecha|listo|lista|ya|si|hice|la hice|lo hice|hecho ya|realizada|realizado)$|\b(hice|hecha|hecho|listo|resuelt[oa]|ya lo|ya la|ya est[aá])\b/.test(said) && !/\bno\b/.test(said)) return 'HECHO';
  if (/\b(despues|luego|mas tarde|manana|semana|proxim[ao]|otro dia|aplaz|pospon|pendiente|dejo para|dejar(la|lo) para)\b/.test(said)) return 'DESPUES';
  if (/^(no|nop|no lo hice|descartada|descartado)$|\b(no|descart|rechaz|omit)\b/.test(said)) return 'NO';
  return null;
};

export const verdictWord = (verdict) => ({ HECHO: 'la hiciste', NO: 'la descartaste', DESPUES: 'la dejaste para después' })[verdict] || verdict;

/** A qué decisión de la lectura se refiere la persona: su número, su id o una palabra única de su título. */
export const resolveDecisionRef = (ref, decisions = []) => {
  const text = fold(ref);
  if (!text) return null;
  if (/^\d+$/.test(text)) return decisions[Number(text) - 1] || null;
  const byId = decisions.find((d) => d.id === String(ref).trim());
  if (byId) return byId;
  if (text.length < 3) return null;
  const matches = decisions.filter((d) => fold(d.title).includes(text));
  return matches.length === 1 ? matches[0] : null;
};

/**
 * Qué pasó con una decisión, leído de las señales de hoy. `null` para NO_HACER: no prometía mover nada.
 * Sigue si el sujeto todavía tiene una señal que empeora; mejoró si tiene una que mejora; si no, ya no se ve.
 */
export const decisionOutcome = (entry, { signals = [], current = null } = {}) => {
  if (entry.kind === 'NO_HACER') return null;
  const ofSubject = signals.filter((s) => s.subjectType === entry.subjectType && s.subjectId === entry.subjectId);
  const worse = ofSubject.find((s) => (entry.evidence || []).includes(s.id)) || ofSubject.find((s) => s.direction === 'peor');
  if (worse) return { outcome: 'SIGUE', text: worse.text };
  const better = ofSubject.find((s) => s.direction === 'mejor');
  if (better) return { outcome: 'MEJORO', text: better.text };
  // Sin señal nueva, la foto de hoy decide: una cuenta que sigue en rojo o una persona que sigue con vencidas no «se resolvió».
  if (entry.subjectType === 'CLIENT') {
    const client = (current?.clients || []).find((c) => c.id === entry.subjectId);
    if (client?.metrics?.level === 'red') return { outcome: 'SIGUE', text: `${client.name} sigue en rojo${client.metrics.reasons?.[0] ? `: ${client.metrics.reasons[0]}` : '.'}` };
  }
  if (entry.subjectType === 'PERSON') {
    const person = (current?.people || []).find((p) => p.id === entry.subjectId);
    if ((person?.metrics?.overdue || 0) >= 2) return { outcome: 'SIGUE', text: `${person.name} sigue con ${person.metrics.overdue} tareas vencidas.` };
  }
  return { outcome: 'YA_NO_SE_VE', text: 'La señal que la sostenía ya no aparece en la lectura.' };
};

const suppressKey = (row) => `${row.kind}|${row.subjectType}|${row.subjectId}`;

/** Las decisiones (tipo + sujeto) que la dirección descartó tres veces seguidas en los últimos 30 días. */
export const suppressedDecisions = (entries = [], { today } = {}) => {
  const recent = entries.filter((e) => e.verdict && daysBetween(e.dayKey, today) <= SUPPRESS_DAYS && daysBetween(e.dayKey, today) >= 0)
    .sort((a, b) => String(a.decidedAt).localeCompare(String(b.decidedAt)));
  const streak = new Map();
  for (const e of recent) {
    const key = suppressKey(e);
    streak.set(key, e.verdict === 'NO' ? (streak.get(key) || 0) + 1 : 0);
  }
  return new Set([...streak].filter(([, n]) => n >= SUPPRESS_AFTER).map(([key]) => key));
};

export const isSuppressed = (decision, suppressed, { signals = [] } = {}) => {
  if (!suppressed?.has(suppressKey(decision))) return false;
  const top = Math.max(0, ...signals.filter((s) => (decision.evidence || []).includes(s.id)).map((s) => s.severity || 0));
  return top < SUPPRESS_SEVERITY;
};

/** Cuántas decisiones se propusieron, cuántas se anotaron y cómo salieron. Cifras sobre decisiones, no sobre personas. */
export const scorecard = (entries = [], { proposed = 0 } = {}) => {
  const by = (verdict) => entries.filter((e) => e.verdict === verdict);
  const done = by('HECHO'), declined = by('NO'), later = by('DESPUES');
  const resolved = (rows) => rows.filter((e) => e.outcome === 'MEJORO' || e.outcome === 'YA_NO_SE_VE').length;
  const persists = (rows) => rows.filter((e) => e.outcome === 'SIGUE').length;
  const doneWithOutcome = resolved(done) + persists(done);
  const card = {
    propuestas: proposed, anotadas: entries.length, hechas: done.length, descartadas: declined.length, aplazadas: later.length,
    hechasQueSeResolvieron: resolved(done), hechasQueSiguen: persists(done),
    descartadasQueSeResolvieronSolas: resolved(declined), descartadasQueSiguen: persists(declined),
    tasaDeAdopcion: proposed ? round2(done.length / proposed) : 0,
    tasaDeAcierto: doneWithOutcome ? round2(resolved(done) / doneWithOutcome) : 0,
    pendientesDeDesenlace: entries.filter((e) => e.verdict && e.verdict !== 'NO_HACER' && !e.outcome && e.kind !== 'NO_HACER').length
  };
  card.lectura = entries.length
    ? `De ${plural(proposed, 'decisión propuesta', 'decisiones propuestas')} se anotaron ${entries.length}: ${plural(done.length, 'hecha', 'hechas')}, ${plural(declined.length, 'descartada', 'descartadas')} y ${plural(later.length, 'aplazada', 'aplazadas')}.${doneWithOutcome ? ` De las hechas con desenlace, ${resolved(done)} de ${doneWithOutcome} se resolvieron.` : ''}${declined.length && (resolved(declined) + persists(declined)) ? ` De las descartadas, ${resolved(declined)} se ${resolved(declined) === 1 ? 'resolvió sola' : 'resolvieron solas'} y ${persists(declined)} ${persists(declined) === 1 ? 'sigue' : 'siguen'}.` : ''}`
    : 'Todavía no hay decisiones anotadas: cuando digas «hice la 1» o «la 2 no», empiezo a medir.';
  return card;
};

const outcomeLine = (entry) => {
  if (!entry.outcome) return '';
  if (entry.outcome === 'SIGUE') return ` Hoy sigue: ${entry.outcomeText}`;
  if (entry.outcome === 'MEJORO') return ` Hoy mejoró: ${entry.outcomeText}`;
  return ` Hoy ${String(entry.outcomeText || '').replace(/^La/, 'la').replace(/\.$/, '')}.`;
};

/**
 * Lo que va en el mensaje de la mañana sobre la lectura anterior: qué decidió la persona y qué pasó, y qué falta
 * por anotar. `decided`: entradas con veredicto; `undecided`: decisiones de ayer sin veredicto.
 */
export const decisionsSection = ({ decided = [], undecided = [] } = {}) => {
  if (!decided.length && !undecided.length) return [];
  const lines = [];
  if (decided.length) {
    lines.push('**Lo que decidiste ayer**', '');
    for (const e of decided) lines.push(`- **${e.title}**: ${verdictWord(e.verdict)}.${outcomeLine(e)}`);
    lines.push('');
  }
  // Sin formulario (Rodny, 19 de octubre de 2026: «no quiero que se sienta de forma mecánica que uno la está
  // enseñando»): una sola frase, en pasada, y solo por lo que la plataforma no pudo ver sola.
  if (undecided.length) {
    lines.push(undecided.length === 1
      ? `De ayer no supe qué pasó con «${undecided[0].title}»; si la trabajaste o la descartaste, cuéntamelo cuando puedas.`
      : `De ayer no supe qué pasó con ${undecided.length} de las que te propuse; si las trabajaste o las descartaste, cuéntamelo cuando puedas.`, '');
  }
  return lines;
};
