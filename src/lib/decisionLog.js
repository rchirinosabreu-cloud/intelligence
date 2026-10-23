// El libro de decisiones (Rodny, 19 de octubre de 2026: «avanza con el libro de decisiones»). Cada decisión que Bria
// propone en la lectura de la mañana queda anotada con lo que decidió la persona —la hizo, la descartó o la dejó para
// después— y, días más tarde, con lo que pasó, leído de las señales y nunca supuesto. Con eso Bria mide su acierto,
// cuenta lo que decidiste y deja de repetir lo que la dirección descarta. Es el primer lazo de aprendizaje: el código
// mide, la persona decide, y Bria solo ajusta lo que propone. Lógica pura; nunca un juicio sobre nadie.

export const VERDICTS = Object.freeze(['HECHO', 'NO', 'DESPUES']);
// YA_NO_SE_VE se conserva para leer el historial; nunca acredita un resultado ni se vuelve a producir.
export const OUTCOMES = Object.freeze(['MEJORO', 'YA_NO_SE_VE', 'SIGUE', 'SIN_EVIDENCIA']);
export const OUTCOME_AFTER_DAYS = 1;   // El desenlace se mira desde la lectura siguiente…
export const OUTCOME_UNTIL_DAYS = 14;  // …y hasta dos semanas; después queda sin desenlace.
export const SUPPRESS_AFTER = 3;       // Tres días distintos rechazando el mismo problema…
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

const NO_OUTCOME_EVIDENCE = 'No hay evidencia suficiente para comprobar el resultado.';
const withoutEvidence = () => ({ outcome: 'SIN_EVIDENCIA', text: NO_OUTCOME_EVIDENCE });
const isCount = (value) => Number.isInteger(value) && value >= 0;
// Son los problemas que ya observa readSignals, no señales nuevas. Que cambie su nombre no cambia el problema.
export const signalProblem = (kind) => ({
  CUENTA_EMPEORO: 'CUENTA', ROJO_SOSTENIDO: 'CUENTA',
  VENCIDAS_SOSTENIDAS: 'VENCIDAS', VENCIDAS_SUBEN: 'VENCIDAS'
})[kind] || kind;

const countOutcome = (value, name, one, many) => {
  if (!isCount(value)) return null;
  return value > 0
    ? { outcome: 'SIGUE', text: `${name} sigue con ${plural(value, one, many)}.` }
    : { outcome: 'MEJORO', text: `${name} no tiene ${many} en la foto de hoy.` };
};

/** Solo un dato explícito del problema original permite comprobar su resultado: faltar no es valer cero. */
const observedOutcome = (problem, entry, subject) => {
  if (!subject?.metrics) return null;
  const metrics = subject.metrics, name = subject.name || entry.subjectName;
  if (entry.subjectType === 'CLIENT') {
    if (problem === 'CUENTA') {
      if (metrics.level === 'red') return { outcome: 'SIGUE', text: `${name} sigue en rojo${metrics.reasons?.[0] ? `: ${metrics.reasons[0]}` : '.'}` };
      if (metrics.level === 'yellow') return { outcome: 'SIGUE', text: `${name} sigue en amarillo; la cuenta aún no está en verde.` };
      if (metrics.level === 'green') return { outcome: 'MEJORO', text: `${name} está en verde en la foto de hoy.` };
    }
    if (problem === 'APROBACION_DETENIDA') return countOutcome(metrics.awaitingApproval, name, 'pieza esperando aprobación', 'piezas esperando aprobación');
    if (problem === 'DEVOLUCIONES' && isCount(metrics.returnedPieces) && isCount(metrics.returnedTasks)) {
      return countOutcome(metrics.returnedPieces + metrics.returnedTasks, name, 'devolución abierta entre piezas y tareas', 'devoluciones abiertas entre piezas y tareas');
    }
  }
  if (entry.subjectType === 'PERSON') {
    if (problem === 'VENCIDAS') return countOutcome(metrics.overdue, name, 'tarea vencida', 'tareas vencidas');
    if (problem === 'DEVUELTAS_PERSONA') return countOutcome(metrics.returned, name, 'tarea devuelta', 'tareas devueltas');
  }
  // Las tendencias de horas/carga y los demás problemas no tienen aquí la base de comparación ni el compromiso
  // original. Una foto verde o una mejora distinta de ese mismo sujeto no bastan para darles cierre.
  return null;
};

/**
 * Qué pasó con el problema que motivó la decisión. `null` para NO_HACER: no prometía mover nada.
 * Una señal vigente del mismo problema mantiene el seguimiento; MEJORO requiere verificar todos los problemas
 * citados con datos explícitos. Ni la ausencia, ni una mejora parcial, ni otra condición del sujeto son un cierre.
 */
export const decisionOutcome = (entry, { signals = [], current = null } = {}) => {
  if (entry.kind === 'NO_HACER') return null;
  const evidence = Array.isArray(entry.evidence) ? entry.evidence : [];
  if (!entry.subjectId || !evidence.length) return withoutEvidence();
  const suffix = `:${entry.subjectId}`;
  const problems = [...new Set(evidence.map((id) => typeof id === 'string' && id.endsWith(suffix) ? signalProblem(id.slice(0, -suffix.length)) : null))];
  const ofSubject = signals.filter((s) => s.subjectType === entry.subjectType && s.subjectId === entry.subjectId);
  const subjects = entry.subjectType === 'CLIENT' ? current?.clients : entry.subjectType === 'PERSON' ? current?.people : [];
  const subject = subjects?.find((row) => row.id === entry.subjectId);
  const results = problems.map((problem) => {
    if (!problem) return null;
    const ongoing = ofSubject.find((s) => s.direction === 'peor' && s.id === `${s.kind}:${entry.subjectId}` && signalProblem(s.kind) === problem);
    if (ongoing) return { outcome: 'SIGUE', text: ongoing.text };
    return observedOutcome(problem, entry, subject);
  });
  const ongoing = results.find((result) => result?.outcome === 'SIGUE');
  if (ongoing) return ongoing;
  if (results.every((result) => result?.outcome === 'MEJORO')) {
    return { outcome: 'MEJORO', text: [...new Set(results.map((result) => result.text))].join(' ') };
  }
  return withoutEvidence();
};

const suppressKey = (row) => {
  if (!row.subjectId || !Array.isArray(row.evidence) || !row.evidence.length) return null;
  const suffix = `:${row.subjectId}`;
  const problems = row.evidence.map(id => typeof id === 'string' && id.endsWith(suffix) ? signalProblem(id.slice(0, -suffix.length)) : null);
  // Sin evidencia identificable no hay regla sobre todo un sujeto. Rechazar una propuesta conjunta tampoco
  // descarta cada alternativa por separado: se conserva la combinación de problemas que la persona vio.
  if (problems.some(problem => !problem)) return null;
  return `${row.kind}|${row.subjectType}|${row.subjectId}|${[...new Set(problems)].sort().join(',')}`;
};

/** El mismo tipo, sujeto y problema rechazado en tres días distintos, dentro de los últimos 30 días. */
export const suppressedDecisions = (entries = [], { today } = {}) => {
  const recent = entries.filter((e) => e.verdict && daysBetween(e.dayKey, today) <= SUPPRESS_DAYS && daysBetween(e.dayKey, today) >= 0)
    .sort((a, b) => String(a.decidedAt).localeCompare(String(b.decidedAt)));
  const streak = new Map();
  for (const e of recent) {
    const key = suppressKey(e);
    if (!key) continue;
    if (e.verdict !== 'NO') { streak.delete(key); continue; }
    const days = streak.get(key) || new Set();
    days.add(e.dayKey);
    streak.set(key, days);
  }
  return new Set([...streak].filter(([, days]) => days.size >= SUPPRESS_AFTER).map(([key]) => key));
};

export const isSuppressed = (decision, suppressed, { signals = [] } = {}) => {
  const key = suppressKey(decision);
  if (!key || !suppressed?.has(key)) return false;
  const top = Math.max(0, ...signals.filter((s) => (decision.evidence || []).includes(s.id)).map((s) => s.severity || 0));
  return top < SUPPRESS_SEVERITY;
};

/** Cuántas decisiones se propusieron, cuántas se anotaron y cómo salieron. Cifras sobre decisiones, no sobre personas. */
export const scorecard = (entries = [], { proposed = 0 } = {}) => {
  const by = (verdict) => entries.filter((e) => e.verdict === verdict);
  const done = by('HECHO'), declined = by('NO'), later = by('DESPUES');
  const resolved = (rows) => rows.filter((e) => e.outcome === 'MEJORO').length;
  const persists = (rows) => rows.filter((e) => e.outcome === 'SIGUE').length;
  const unknown = (row) => row.outcome === 'SIN_EVIDENCIA' || row.outcome === 'YA_NO_SE_VE';
  const withoutResult = (rows) => rows.filter(unknown).length;
  const doneWithOutcome = resolved(done) + persists(done);
  const declinedWithOutcome = resolved(declined) + persists(declined);
  const card = {
    propuestas: proposed, anotadas: entries.length, hechas: done.length, descartadas: declined.length, aplazadas: later.length,
    hechasQueSeResolvieron: resolved(done), hechasQueSiguen: persists(done),
    descartadasQueSeResolvieronSolas: resolved(declined), descartadasQueSiguen: persists(declined),
    hechasSinEvidencia: withoutResult(done), descartadasSinEvidencia: withoutResult(declined),
    sinEvidenciaDeDesenlace: withoutResult(entries),
    tasaDeAdopcion: proposed ? round2(done.length / proposed) : 0,
    tasaDeAcierto: doneWithOutcome ? round2(resolved(done) / doneWithOutcome) : 0,
    pendientesDeDesenlace: entries.filter((e) => e.verdict && (!e.outcome || unknown(e)) && e.kind !== 'NO_HACER').length
  };
  card.lectura = entries.length
    ? `De ${plural(proposed, 'decisión propuesta', 'decisiones propuestas')} se anotaron ${entries.length}: ${plural(done.length, 'hecha', 'hechas')}, ${plural(declined.length, 'descartada', 'descartadas')} y ${plural(later.length, 'aplazada', 'aplazadas')}.${doneWithOutcome ? ` De las hechas con resultado observado, ${resolved(done)} de ${doneWithOutcome} ya no ${resolved(done) === 1 ? 'presenta' : 'presentan'} el problema.` : ''}${declinedWithOutcome ? ` De las descartadas con resultado observado, ${resolved(declined)} ya no ${resolved(declined) === 1 ? 'presenta' : 'presentan'} el problema y ${persists(declined)} ${persists(declined) === 1 ? 'sigue' : 'siguen'}.` : ''}${card.sinEvidenciaDeDesenlace ? ` Hay ${plural(card.sinEvidenciaDeDesenlace, 'decisión', 'decisiones')} sin evidencia suficiente para comprobar el resultado; no ${card.sinEvidenciaDeDesenlace === 1 ? 'cuenta' : 'cuentan'} como aciertos.` : ''}${doneWithOutcome || declinedWithOutcome ? ' Estos resultados no demuestran que la decisión haya causado el cambio.' : ''}`
    : 'Todavía no hay decisiones anotadas: cuando digas «hice la 1» o «la 2 no», empiezo a medir.';
  return card;
};

const outcomeLine = (entry) => {
  if (!entry.outcome) return '';
  if (entry.outcome === 'SIGUE') return ` Hoy sigue: ${entry.outcomeText}`;
  if (entry.outcome === 'MEJORO') return ` Hoy mejoró: ${entry.outcomeText}`;
  return ` ${NO_OUTCOME_EVIDENCE}`;
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
    const summary = decided.slice(0, 3);
    for (const e of summary) lines.push(`- **${e.title}**: ${verdictWord(e.verdict)}.${outcomeLine(e)}`);
    const remaining = decided.length - summary.length;
    if (remaining > 0) lines.push('', `Además, hay ${remaining === 1 ? 'otra decisión anotada' : `otras ${remaining} decisiones anotadas`}. Puedes ${remaining === 1 ? 'revisarla' : 'revisarlas'} en la conversación de esa lectura.`);
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
