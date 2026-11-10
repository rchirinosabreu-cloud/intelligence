// Las decisiones de Manager (Rodny, 10 de noviembre de 2026: «los botones de descartar, resolver, aplazar no significan
// nada para el algoritmo, no van a ningún lado … que Bria esté ahí y que alimente todo eso»). Una sola lista con lo que
// Bria propone en la lectura de la mañana y lo que el Observer detectó en reuniones y tareas, ordenada por urgencia, con
// tres respuestas que sí llegan a algún lado:
//   «Me encargo»  → lectura: HECHO en el libro de decisiones (se mide su desenlace). Observer: REVIEWED, queda en curso
//                   hasta que la fuente deje de detectarlo.
//   «Descartar»   → con su motivo. Lectura: NO (tres días distintos sobre el mismo problema y Bria deja de proponerlo).
//                   Observer: DISMISSED con el motivo guardado; tres del mismo tipo y cliente en 30 días y Bria lo agrupa
//                   aparte («ya aprendí que esto no te sirve»). «Ya está resuelto» resuelve, no descarta.
//   «Más tarde»   → lectura: DESPUES con la fecha. Observer: SNOOZED hasta un día hábil a las 8:00 de Bogotá.
// Lógica pura: la comparten el servidor y la pantalla. Nunca un juicio sobre personas; nunca un código en inglés a la vista.

import { addBusinessDays, bogotaDate, isBusinessDay } from './colombiaBusinessDays.js';

export const RESPONSES = Object.freeze(['HACER', 'DESCARTAR', 'MAS_TARDE']);
export const SOURCES = Object.freeze(['LECTURA', 'OBSERVER']);
export const NOTE_MAX = 300;
export const LEARN_AFTER = 3;
export const LEARN_DAYS = 30;


export const DISCARD_REASONS = Object.freeze([
  { value: 'ESPERA_CLIENTE', label: 'Espera al cliente' },
  { value: 'YA_RESUELTO', label: 'Ya está resuelto' },
  { value: 'NO_PRIORIDAD', label: 'No es prioridad ahora' },
  { value: 'INFO_INCORRECTA', label: 'La información no es correcta' },
  { value: 'OTRO', label: 'Otro motivo' }
]);

export const LATER_OPTIONS = Object.freeze([
  { value: 'MANANA', label: 'Mañana' },
  { value: 'TRES_DIAS', label: 'En 3 días' },
  { value: 'PROXIMA_SEMANA', label: 'La próxima semana' }
]);

export const RESPONSE_LABELS = Object.freeze({ HACER: 'Me encargo', DESCARTAR: 'Descartada', MAS_TARDE: 'Más tarde' });

// Lo que el Observer y las minutas escriben como categoría. Cada código que aparezca se traduce aquí; uno nuevo sin
// traducir nunca se muestra crudo (cae al origen de la señal).
const CATEGORY_LABELS = Object.freeze({
  PROCESS_GAP: 'Proceso y operación',
  DATA_QUALITY: 'Información pendiente',
  PENDING_REVIEW: 'Espera revisión',
  DELIVERY_RISK: 'Alcance y entregables',
  INFORMATION_GAP: 'Información pendiente',
  FINANCIAL_RISK: 'Dinero',
  ACCESS_BLOCKER: 'Accesos',
  DEADLINE_PRESSURE: 'Fecha encima',
  PENDING_REGISTRATION: 'Falta registrar algo',
  WORKLOAD_RISK: 'Equipo y responsables',
  OPERATIONAL_RISK: 'Proceso y operación',
  OPERATIONS: 'Operación',
  RESOURCE_DEFINITION: 'Falta definir un recurso',
  COMMERCIAL_CLARIFICATION: 'Aclaración comercial',
  SCOPE_AMBIGUITY: 'Alcance y entregables',
  CAPACITY_CONSTRAINT: 'Equipo y responsables',
  CLIENT_DEPENDENCY: 'Depende del cliente',
  DEPENDENCY: 'Depende de otro',
  DEPENDENCIA: 'Depende de otro',
  AMBIGUEDAD: 'Ambigüedad',
  RIESGO: 'Riesgo',
  BLOQUEO: 'Bloqueo',
  COMPROMISO: 'Compromiso',
  DECISION: 'Decisión pendiente',
  MEETING: 'Señal de una reunión'
});
const SOURCE_LABELS = Object.freeze({ MEETING_MINUTE: 'Reunión', TASK_ANALYTICS: 'Tareas' });
const SOURCE_FALLBACK = Object.freeze({ MEETING_MINUTE: 'Señal de una reunión', TASK_ANALYTICS: 'Señal de las tareas' });

const fold = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().trim();
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

// El análisis de minutas escribe la categoría a su manera (el 10 de noviembre de 2026 había 115 señales vivas con 113
// categorías distintas). Para leerlas y para aprender de ellas se agrupan en familias por las palabras del código. El
// orden importa: lo de dinero o contrato gana sobre lo genérico.
const FAMILIES = Object.freeze([
  [/FINANC|BUDGET|PRESUPUEST|CARTERA|SALDO|BILLING|FACTUR|COST|CHARGE|PROFIT|BALANCE|COMPENSATION|SOBREGASTO|TARJETA|PAYMENT|PAGO/, 'Dinero'],
  [/CONTRACT|CONTRATO|LEGAL/, 'Contrato'],
  [/ACCESS|ACCESO|SECURITY|SEGURIDAD|PASSWORD/, 'Accesos'],
  [/DEADLINE|DATE|FECHA|TIMING|URGENT|PUNTUALIDAD|SCHEDULED|PLANNING|PROXIMITY/, 'Fechas'],
  [/SCOPE|ALCANCE|DELIVERABLE|ENTREGABLE/, 'Alcance y entregables'],
  [/WORKLOAD|CAPACITY|BOTTLENECK|OPERATING_LOAD|RESPONSIB|ROLE|CARGA|TRAINING|PRESENCIAL|MEDICAL/, 'Equipo y responsables'],
  [/CLIENT|COMMERCIAL|COMUNICA|COMMUNICATION|COORDINA|MEETING|PROPUESTA/, 'Cliente y comunicación'],
  [/CONTENT|PUBLICATION|PUBLICACION|BRAND|WEB|MARKETING|PAID_MEDIA|REPORT|PRODUCTION/, 'Contenido y producción'],
  [/QUALITY|CALIDAD|REWORK/, 'Calidad'],
  [/DATA|INFORMATION|INFORMACION|TRACEAB|VISIBILITY|INPUT|MATERIAL|ATTACHMENT|VERIFICATION|VALIDATION|INTEGRITY|CLASSIFICATION|INCONSISTEN/, 'Información pendiente'],
  [/PROCESS|WORKFLOW|SYSTEM|SETUP|ADMINISTRATIVE|EDITABILITY|CONFIG|NOTIFICATION|MANUAL|BRECHA|GAP|CONTINUITY|AMBIGU|DEFINITION|PENDING|COMMITMENT|RISK|RIESGO|ACCOUNT|ASSET/, 'Proceso y operación']
]);

export const observerCategoryFamily = (category) => {
  const code = fold(category);
  if (!code) return null;
  return FAMILIES.find(([pattern]) => pattern.test(code))?.[1] || null;
};

export const observerCategoryLabel = (category, sourceKind = null) => {
  const label = CATEGORY_LABELS[fold(category)];
  if (label) return label;
  return observerCategoryFamily(category) || SOURCE_FALLBACK[sourceKind] || 'Señal del Observer';
};

const KIND_LABELS = Object.freeze({ HACER: 'Hacer', CONVERSAR: 'Conversar', VIGILAR: 'Vigilar', NO_HACER: 'No haría' });
const KIND_WEIGHT = Object.freeze({ HACER: 3, CONVERSAR: 2, VIGILAR: 1 });
// El análisis de minutas marca «crítica» más de la mitad de lo que ve; la lectura ya filtró sus señales. Por eso una
// señal crítica de una reunión pesa menos que una decisión grave de la lectura, y más que una de gravedad media.
const OBSERVER_SEVERITY = Object.freeze({ critical: 2.5, warning: 2, attention: 1.5, info: 1 });
const OBSERVER_LEVEL = Object.freeze({ critical: 'alta', warning: 'media', attention: 'baja', info: 'baja' });
const levelOf = (severity) => (severity >= 3 ? 'alta' : severity >= 2 ? 'media' : 'baja');

const DATE_FORMAT = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dayWords = (day) => DATE_FORMAT.format(new Date(`${day}T12:00:00Z`)).replace(',', '');
const at8 = (day) => `${day}T13:00:00.000Z`; // 8:00 de Bogotá (UTC-5, sin horario de verano)

const laterDay = (option, now) => {
  const today = bogotaDate(now);
  if (option === 'MANANA') return addBusinessDays(today, 1);
  if (option === 'TRES_DIAS') return addBusinessDays(today, 3);
  if (option === 'PROXIMA_SEMANA') {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const monday = new Date(Date.parse(`${today}T12:00:00Z`) + ((8 - weekday) % 7 || 7) * 86_400_000).toISOString().slice(0, 10);
    return isBusinessDay(monday) ? monday : addBusinessDays(monday, 1);
  }
  return null;
};

/** El instante en que vuelve algo aplazado: un día hábil a las 8:00 de Bogotá. */
export const laterUntil = (option, now = new Date()) => {
  const day = laterDay(option, now);
  return day ? at8(day) : null;
};

const reasonOf = (value) => DISCARD_REASONS.find((reason) => reason.value === value) || null;
const laterOf = (value) => LATER_OPTIONS.find((option) => option.value === value) || null;

/** Por qué no se puede guardar una respuesta; `null` si se puede. Lo comparten la pantalla y el servidor. */
export const responseProblem = ({ source, id, respuesta, motivo, nota, hasta } = {}) => {
  if (!SOURCES.includes(source)) return 'No reconozco el origen de esta decisión.';
  if (typeof id !== 'string' || !id.trim() || id.length > 200) return 'No sé cuál decisión estás respondiendo.';
  if (!RESPONSES.includes(respuesta)) return 'Elige «Me encargo», «Descartar» o «Más tarde».';
  if (nota != null && typeof nota !== 'string') return 'La nota no es válida.';
  if (clean(nota).length > NOTE_MAX) return `La nota puede tener hasta ${NOTE_MAX} caracteres.`;
  if (respuesta === 'DESCARTAR') {
    if (!reasonOf(motivo)) return 'Elige el motivo para descartarla.';
    if (motivo === 'OTRO' && !clean(nota)) return 'Cuéntame en pocas palabras por qué la descartas.';
  }
  if (respuesta === 'MAS_TARDE' && !laterOf(hasta)) return 'Elige cuándo te lo vuelvo a mostrar.';
  return null;
};

/** Lo que la respuesta escribe en el libro de decisiones de la lectura. */
export const readingVerdictFor = ({ respuesta, motivo, nota, hasta }, { now = new Date() } = {}) => {
  const extra = clean(nota);
  if (respuesta === 'HACER') return { veredicto: 'HECHO', nota: extra || null };
  if (respuesta === 'DESCARTAR') return { veredicto: 'NO', nota: (motivo === 'OTRO' ? `Descartada: ${extra}` : `Descartada: ${reasonOf(motivo).label}.${extra ? ` ${extra}` : ''}`).slice(0, NOTE_MAX) };
  const day = laterDay(hasta, now);
  return { veredicto: 'DESPUES', nota: `Más tarde: ${laterOf(hasta).label.toLowerCase()} (${dayWords(day)}).${extra ? ` ${extra}` : ''}`.slice(0, NOTE_MAX) };
};

/** La transición del Observer que corresponde a la respuesta, con el motivo que se guarda para aprender. */
export const observerActionFor = ({ respuesta, motivo, nota, hasta }, { now = new Date() } = {}) => {
  if (respuesta === 'HACER') return { action: 'REVIEW' };
  if (respuesta === 'MAS_TARDE') return { action: 'SNOOZE', snoozedUntil: laterUntil(hasta, now) };
  const reason = reasonOf(motivo);
  const dismissal = { reason: reason.value, label: reason.label, note: clean(nota) || null };
  return { action: motivo === 'YA_RESUELTO' ? 'RESOLVE' : 'DISMISS', dismissal };
};

// Se aprende por la categoría ya traducida (o su familia) y el cliente: el código crudo casi nunca se repite.
const learnKey = (category, clientId) => `${observerCategoryLabel(category)}|${clientId || ''}`;

/**
 * Tipos de señal que la dirección ya dijo tres veces, en días distintos y en los últimos 30, que no le aplican para ese
 * cliente. «La información no es correcta» no cuenta: no enseña a callar, enseña que el detector se equivocó.
 */
export const learnedObserverKeys = (dismissed = [], { now = new Date() } = {}) => {
  const since = now.getTime() - LEARN_DAYS * 86_400_000;
  const days = new Map();
  for (const row of dismissed) {
    const at = new Date(row.dismissedAt).getTime();
    if (!Number.isFinite(at) || at < since || at > now.getTime()) continue;
    if (row.metadata?.dismissal?.reason === 'INFO_INCORRECTA') continue;
    const key = learnKey(row.category, row.clientId);
    if (!days.has(key)) days.set(key, new Set());
    days.get(key).add(bogotaDate(row.dismissedAt));
  }
  return new Set([...days].filter(([, set]) => set.size >= LEARN_AFTER).map(([key]) => key));
};

const ANSWER_FROM_VERDICT = Object.freeze({ HECHO: 'HACER', NO: 'DESCARTAR', DESPUES: 'MAS_TARDE' });

const readingCard = (decision, { signalsById, entry }) => {
  const severity = Math.max(0, ...(decision.evidence || []).map((id) => Number(signalsById.get(id)?.severity) || 0));
  const respuesta = entry ? ANSWER_FROM_VERDICT[entry.verdict] : null;
  // Lo concreto va al frente: la señal dice el hecho («lleva 23 días en rojo: faltan 5 piezas»). El porqué de la
  // decisión acompaña, salvo cuando es la nota genérica de contexto cambiado, que ya dice su propia línea.
  const facts = (decision.evidence || []).map((id) => clean(signalsById.get(id)?.text)).filter(Boolean).join(' ');
  const reason = decision.needsContextReview ? '' : clean(decision.why);
  // Cuando la decisión es la revisión genérica que ponen las reglas («Revisar el compromiso de X»), el título es el hecho
  // mismo: «Aristea lleva 23 días en rojo», y el detalle lo que sigue a los dos puntos.
  const [head, ...tail] = decision.needsContextReview && facts ? facts.split(':') : [];
  const title = head ? clean(head) : clean(decision.title);
  const why = head ? clean(tail.join(':')) || null : facts || reason || null;
  return {
    key: `L:${decision.id}`, source: 'LECTURA', ref: decision.id, title, why,
    quote: facts && reason && reason !== facts ? reason : null,
    ask: clean(decision.ask) || null, url: decision.url || null, subjectName: decision.subjectName || null,
    kind: decision.kind, kindLabel: KIND_LABELS[decision.kind] || null, categoryLabel: null, sourceLabel: 'Lectura de la mañana',
    severity, level: levelOf(severity), score: severity * 10 + (KIND_WEIGHT[decision.kind] || 0), detectedAt: null,
    needsContextReview: Boolean(decision.needsContextReview),
    answer: respuesta ? { respuesta, label: RESPONSE_LABELS[respuesta], note: entry.note || null, at: entry.decidedAt || null, outcome: entry.outcomeText || null } : null
  };
};

const SHORT_DATE = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
const observerCard = (signal, clients) => {
  const severity = OBSERVER_SEVERITY[signal.severity] || 1;
  const meta = signal.metadata && typeof signal.metadata === 'object' ? signal.metadata : {};
  const meetingAt = Number.isFinite(new Date(meta.meetingAt).getTime()) ? new Date(meta.meetingAt).toISOString() : null;
  const meeting = clean(meta.meetingTitle);
  const sourceLabel = signal.sourceKind === 'MEETING_MINUTE' && meeting
    ? `Reunión «${meeting}»${meetingAt ? `, ${SHORT_DATE.format(new Date(meetingAt)).replace('.', '').replace(' de ', ' ')}` : ''}`
    : SOURCE_LABELS[signal.sourceKind] || 'Observer';
  return {
    key: `O:${signal.id}`, source: 'OBSERVER', ref: signal.id, title: clean(signal.title), why: clean(signal.suggestedAction) || null,
    quote: clean(signal.evidence) || null, ask: null, url: signal.sourceUrl || null,
    subjectName: clients[signal.clientId] || null, owner: clean(meta.owner) || null, kind: null, kindLabel: null,
    categoryLabel: observerCategoryLabel(signal.category, signal.sourceKind), sourceLabel,
    severity, level: OBSERVER_LEVEL[signal.severity] || 'baja', score: severity * 10 + 1.5, detectedAt: meetingAt || signal.lastDetectedAt || null,
    needsContextReview: false, answer: null
  };
};

/** El lunes de la semana en curso, a las 0:00 de Bogotá. */
export const currentWeekStart = (now = new Date()) => {
  const today = bogotaDate(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = new Date(Date.parse(`${today}T12:00:00Z`) - ((weekday + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
  return `${monday}T05:00:00.000Z`;
};

/** Qué abre el enlace de una tarjeta, dicho en palabras. */
export const openLabel = (url) => {
  const path = String(url || '');
  if (path.startsWith('/minutas')) return 'Ver la reunión';
  if (path.startsWith('/gestion')) return 'Ver sus tareas';
  if (path.startsWith('/clientes')) return 'Ver la cuenta';
  if (path.startsWith('/parrillas')) return 'Ver la parrilla';
  if (path.startsWith('/financiero')) return 'Ver en Financiero';
  return 'Ver el detalle';
};

const byScore = (a, b) => b.score - a.score || String(b.detectedAt || '').localeCompare(String(a.detectedAt || '')) || a.key.localeCompare(b.key);

/**
 * El tablero de decisiones de una persona. `decisions` ya viene filtrada por su alcance (`visibleReadingDecisions`);
 * `entries` son sus anotaciones en el libro; `signals` las señales vivas del Observer con cita comprobada; `dismissed`
 * lo descartado en los últimos 30 días; `clients` un mapa id → nombre.
 */
export const buildDecisionBoard = ({ reading = null, decisions = [], entries = [], signals = [], dismissed = [], clients = {}, now = new Date() } = {}) => {
  const signalsById = new Map((reading?.signals || []).map((row) => [row.id, row]));
  const today = reading?.day || null;
  const noted = new Map(entries.filter((entry) => entry.dayKey === today).map((entry) => [entry.decisionId, entry]));
  const fromReading = decisions.map((decision) => readingCard(decision, { signalsById, entry: noted.get(decision.id) }));
  const avoid = fromReading.filter((card) => card.kind === 'NO_HACER');
  const actionable = fromReading.filter((card) => card.kind !== 'NO_HACER');

  const learned = learnedObserverKeys(dismissed, { now });
  const learnedGroups = new Map();
  const live = [], taken = [];
  const weekStart = new Date(currentWeekStart(now)).getTime();
  let later = 0, outsideWeek = 0;
  for (const signal of signals) {
    if (signal.status === 'SNOOZED' && new Date(signal.snoozedUntil).getTime() > now.getTime()) { later += 1; continue; }
    const card = observerCard(signal, clients);
    // Rodny, 10 de noviembre de 2026: «deja solo las que tengan que ver con la semana vigente; si ya pasó la semana,
    // desaparece». Lo de semanas anteriores sigue en el historial del Observer y se archiva solo al mes.
    if (card.detectedAt && new Date(card.detectedAt).getTime() < weekStart) { outsideWeek += 1; continue; }
    if (signal.status === 'REVIEWED') { taken.push({ ...card, answer: { respuesta: 'HACER', label: RESPONSE_LABELS.HACER, at: signal.reviewedAt || null } }); continue; }
    const key = learnKey(signal.category, signal.clientId);
    if (learned.has(key) && signal.severity !== 'critical') {
      const label = [card.categoryLabel, card.subjectName].filter(Boolean).join(' · ');
      const group = learnedGroups.get(key) || { key, label, count: 0, cards: [] };
      group.count += 1; group.cards.push(card);
      learnedGroups.set(key, group);
      continue;
    }
    live.push(card);
  }

  const pending = [...actionable.filter((card) => !card.answer), ...live].sort(byScore);
  const answered = actionable.filter((card) => card.answer);
  later += answered.filter((card) => card.answer.respuesta === 'MAS_TARDE').length;
  return {
    day: today, weekStart: currentWeekStart(now), pending, taken: taken.sort(byScore), answered, avoid, learned: [...learnedGroups.values()],
    counts: { pending: pending.length, high: pending.filter((card) => card.level === 'alta').length, taken: taken.length + answered.filter((card) => card.answer.respuesta === 'HACER').length, later, answered: answered.length, outsideWeek }
  };
};
