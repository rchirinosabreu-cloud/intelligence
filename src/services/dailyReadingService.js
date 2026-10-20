// La memoria del tiempo y la mañana de dirección (Rodny, 19 de octubre de 2026: «quiero que BRIA sea mi project, mis
// ojos, mi cerebro … una guía, una ayuda continua»). Tres pasos, cada uno una vez por día aunque el servidor se
// reinicie:
//   1. Desde las 6:00 (Bogotá), todos los días: la foto de cada cuenta y de cada persona (`agency_snapshots`).
//   2. Desde las 6:30, en días hábiles: la lectura del día (`daily_readings`). El código lee las señales comparando
//      con la historia; el modelo propone qué haría y qué no haría; el código deja solo lo que una señal respalda.
//   3. Desde las 7:30, en días hábiles: a cada administrador y project manager con Bria, un chat nuevo con su lectura
//      de la mañana y un aviso en la campana. Un project manager lee sus cuentas; la carga del equipo, quien tiene Manager.
// Bria solo lee y propone: nada de esto cambia una tarea, una parrilla ni le escribe a nadie.

import prisma from '../lib/prisma.js';
import { AI_MODELS } from '../config/aiConfig.js';
import { hasModulePermission } from '../config/security.js';
import { bogotaDate, isBusinessDay } from '../lib/colombiaBusinessDays.js';
import { bogotaClock } from '../lib/briaNudges.js';
import { approvalState, APPROVAL_STATES } from '../lib/contentApproval.js';
import { clientSnapshot, personSnapshot, readSignals, levelLabel } from '../lib/agencySnapshot.js';
import { buildDailyDigest, buildDailyReadingRequest, parseDailyReading, validateDailyReading, composeReading, buildMorningBrief } from '../lib/dailyReading.js';
import { suppressedDecisions, decisionOutcome, scorecard, resolveDecisionRef, normalizeVerdict, VERDICTS, SUPPRESS_DAYS, OUTCOME_AFTER_DAYS, OUTCOME_UNTIL_DAYS } from '../lib/decisionLog.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { createDailyReadingRepository } from './dailyReadingRepository.js';
import { createBriaProactiveRepository } from './briaProactiveRepository.js';
import { createBriaConversationRepository } from './briaConversationRepository.js';
import { clientOperationsService } from './clientOperationsService.js';
import { createOpenAIClient } from './openAIClient.js';
import { createNotification } from './notificationService.js';
import { listBriaPeople } from './weeklyFocusService.js';

export const MORNING_BRIEF_NOTIFICATION = 'BRIA_LECTURA_MANANA';
export const SNAPSHOT_FROM = 6 * 60;
export const READING_FROM = 6 * 60 + 30;
export const BRIEF_FROM = 7 * 60 + 30;
export const DAILY_READING_CHECK_MS = 10 * 60 * 1000;
export const HISTORY_DAYS = 40;
const H = 3_600_000;
// Una sesión de más de 8 horas es un reloj olvidado (Ritmo): no se suma.
const MAX_SESSION_MS = 8 * H;
const OPEN = ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'];
const DAY = 86_400_000;
const plusDays = (day, amount) => new Date(Date.parse(`${day}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const fold = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const count = (map, key, amount = 1) => { if (key) map.set(key, (map.get(key) || 0) + amount); };

const defaultGenerate = async (request) => {
  const result = await createOpenAIClient({ models: AI_MODELS }).generate(request);
  return { text: result.text, model: result.model, usage: result.usage || null };
};

/** Lo que espera al cliente: una pieza en revisión, o una aprobada que recibió material nuevo. Un borrador no. */
const awaitsClient = (item) => item.status === 'EN_REVISION' || approvalState(item) === APPROVAL_STATES.MATERIAL_NUEVO;

export const createDailyReadingService = ({
  db = prisma, repository, proactive, conversations, operations = clientOperationsService, generate = defaultGenerate,
  now = () => new Date(), notify = createNotification, listPeople = listBriaPeople, logger = console
} = {}) => {
  const repo = repository || createDailyReadingRepository({ pool: getSidecarPool() });
  const deliveries = proactive || createBriaProactiveRepository({ pool: getSidecarPool() });
  const chats = () => conversations || createBriaConversationRepository({ pool: getSidecarPool(), workspace: 'application' });
  const actorOf = (user) => ({ ref: user.id, name: user.name, role: user.role, permissions: user.modulePermissions || {} });

  /** Un project manager lee sus cuentas (si no tiene ninguna asignada, la agencia); la carga del equipo, quien tiene Manager. */
  const scopeFor = (user, reading) => {
    const isAdmin = String(user.role || '').toUpperCase() === 'ADMIN';
    const people = hasModulePermission(user, 'manager');
    if (isAdmin) return { clientIds: null, people };
    const mine = Object.entries(reading?.owners || {}).filter(([, pmId]) => pmId && pmId === user.teamMember?.id).map(([id]) => id);
    return { clientIds: mine.length ? new Set(mine) : null, people };
  };

  return {
    scopeFor,

    /** Cómo amaneció la plataforma. La actividad (tareas cerradas, horas) es la del día anterior completo, en Bogotá. */
    async readToday(at = now()) {
      const today = bogotaDate(at), yesterday = plusDays(today, -1);
      const start = new Date(`${yesterday}T05:00:00.000Z`), end = new Date(`${today}T05:00:00.000Z`);
      const [ops, items, open, closed, sessions, members] = await Promise.all([
        operations.listOperations(),
        db.contentItem.findMany({ where: { deletedAt: null, status: { not: 'PUBLICADO' }, publishDate: { gte: new Date(end.getTime() - 45 * DAY) }, plan: { deletedAt: null, status: { not: 'FINALIZADO' } } }, select: { status: true, revisionRequestedAt: true, plan: { select: { clientId: true } } }, take: 5000 }),
        db.task.findMany({ where: { status: { in: OPEN } }, select: { status: true, dueDate: true, assigneeId: true, clientId: true }, take: 5000 }),
        db.task.findMany({ where: { status: 'REALIZADA', completedAt: { gte: start, lt: end } }, select: { assigneeId: true, clientId: true }, take: 3000 }),
        db.taskWorkSession.findMany({ where: { startedAt: { gte: start, lt: end }, endedAt: { not: null }, isOverlapping: false }, select: { workerId: true, durationMs: true, task: { select: { clientId: true } } }, take: 10000 }),
        db.teamMember.findMany({ where: { isActive: true }, select: { id: true, name: true, user: { select: { role: true } } } })
      ]);
      const awaiting = new Map(), returnedPieces = new Map();
      for (const item of items) { const id = item.plan?.clientId; if (awaitsClient(item)) count(awaiting, id); if (item.status === 'DEVUELTO') count(returnedPieces, id); }
      const returnedTasks = new Map(), closedBy = { client: new Map(), person: new Map() }, hoursBy = { client: new Map(), person: new Map() };
      const personOpen = new Map(), personProgress = new Map(), personOverdue = new Map(), personReturned = new Map();
      for (const task of open) {
        const due = task.dueDate ? bogotaDate(task.dueDate) : null;
        if (task.status === 'DEVUELTA') { count(returnedTasks, task.clientId); count(personReturned, task.assigneeId); }
        count(personOpen, task.assigneeId);
        if (task.status === 'EN_CURSO') count(personProgress, task.assigneeId);
        if (due && due < today) count(personOverdue, task.assigneeId);
      }
      for (const task of closed) { count(closedBy.client, task.clientId); count(closedBy.person, task.assigneeId); }
      for (const session of sessions) {
        const ms = Number(session.durationMs) || 0;
        if (ms <= 0 || ms > MAX_SESSION_MS) continue;
        count(hoursBy.client, session.task?.clientId, ms); count(hoursBy.person, session.workerId, ms);
      }
      const clients = ops.map((op) => clientSnapshot(op, { awaitingApproval: awaiting.get(op.id), returnedPieces: returnedPieces.get(op.id), returnedTasks: returnedTasks.get(op.id), closedTasks: closedBy.client.get(op.id), hoursMs: hoursBy.client.get(op.id) }));
      // El equipo son las personas activas que no administran, como en el cierre del día.
      const people = members.filter((m) => String(m.user?.role || '').toUpperCase() !== 'ADMIN').map((m) => personSnapshot(m, {
        open: personOpen.get(m.id), inProgress: personProgress.get(m.id), overdue: personOverdue.get(m.id), returned: personReturned.get(m.id), closedTasks: closedBy.person.get(m.id), hoursMs: hoursBy.person.get(m.id)
      }));
      return { today, clients, people };
    },

    async takeSnapshot(at = now()) {
      const { today, clients, people } = await this.readToday(at);
      await repo.saveSnapshot(today, { clients, people });
      return { dayKey: today, clients: clients.length, people: people.length };
    },

    /** La lectura de hoy, sobre la foto de hoy y su historia. Si el modelo no responde, lee con las reglas. */
    async generateReading(at = now()) {
      const today = bogotaDate(at);
      const existing = await repo.reading(today);
      if (existing) return existing;
      const [current, history] = await Promise.all([repo.snapshot(today), repo.history(today, HISTORY_DAYS)]);
      const { baseDay, signals, summary } = readSignals({ today, current, history });
      let model = null, usage = null, modelName = null, digestText = null;
      if (signals.length) {
        const digest = buildDailyDigest({ today, baseDay, summary, signals, clients: current.clients });
        digestText = digest.text;
        try {
          const answer = await generate(buildDailyReadingRequest({ digest, today }));
          modelName = answer.model || null; usage = answer.usage || null;
          model = validateDailyReading(parseDailyReading(answer.text), { signals, clients: current.clients, day: today });
        } catch (error) { logger.error('[DailyReading] El modelo no respondió; Bria lee con las reglas:', error?.message || error); }
      }
      // El libro de decisiones: lo que la dirección descartó tres veces en 30 días no se vuelve a proponer.
      const recent = typeof repo.recentDecisions === 'function' ? await repo.recentDecisions(today, { days: SUPPRESS_DAYS }) : [];
      const suppressed = suppressedDecisions(recent, { today });
      const reading = composeReading({ day: today, baseDay, summary, signals, clients: current.clients, model, usage, modelName, suppressed });
      const saved = await repo.saveReading(today, reading, { digest: digestText });
      await this.settleOutcomes(today, signals, current);
      return saved;
    },

    /** Qué pasó con las decisiones anotadas de días anteriores, leído de las señales y de la foto de hoy. Nunca se supone. */
    async settleOutcomes(today, signals, current = null) {
      if (typeof repo.pendingOutcomes !== 'function') return 0;
      let settled = 0;
      for (const entry of await repo.pendingOutcomes(today, { fromDays: OUTCOME_AFTER_DAYS, untilDays: OUTCOME_UNTIL_DAYS })) {
        const verdict = decisionOutcome(entry, { signals, current });
        if (verdict && await repo.setOutcome(entry.id, { outcome: verdict.outcome, text: verdict.text, day: today })) settled += 1;
      }
      return settled;
    },

    /** Lo que esta persona decidió sobre la lectura anterior y qué pasó, y lo que quedó sin contar, para su mensaje de la mañana. */
    async decisionsFor(user, reading) {
      if (typeof repo.readingsBefore !== 'function') return null;
      const previous = (await repo.readingsBefore(reading.day, 7))[0];
      if (!previous?.decisions?.length) return null;
      const scope = scopeFor(user, previous);
      const visible = previous.decisions.filter((d) => (d.subjectType === 'PERSON' ? scope.people : !scope.clientIds || scope.clientIds.has(d.subjectId)));
      const entries = (await repo.recentDecisions(reading.day, { days: 8, userRef: user.id })).filter((e) => e.dayKey === previous.day);
      const noted = new Set(entries.map((e) => e.decisionId));
      return { decided: entries, undecided: visible.filter((d) => !noted.has(d.id)) };
    },

    /**
     * Anota lo que la persona decidió sobre una decisión de la lectura, dicho con sus palabras («ya le escribí a Gema»,
     * «eso no», «la semana que viene»). Si no se entiende a cuál o qué decidió, no se anota y se dice por qué.
     */
    async recordVerdict({ user, ref, veredicto, nota = null, dia = null }) {
      const reading = dia ? await repo.reading(dia) : await repo.latestReading();
      if (!reading) return { saved: false, motivo: 'Todavía no hay una lectura con decisiones.' };
      const decision = resolveDecisionRef(ref, reading.decisions || []);
      if (!decision) return { saved: false, motivo: `No sé a cuál decisión de la lectura del ${reading.day} te refieres: ${(reading.decisions || []).map((d, i) => `${i + 1}. ${d.title}`).join(' · ') || 'no había ninguna'}.` };
      const verdict = VERDICTS.includes(veredicto) ? veredicto : normalizeVerdict(veredicto);
      if (!verdict) return { saved: false, motivo: 'No me quedó claro si la hiciste, la descartaste o la dejaste para después.' };
      const scope = scopeFor(user, reading);
      if (decision.subjectType === 'PERSON' ? !scope.people : scope.clientIds && !scope.clientIds.has(decision.subjectId)) return { saved: false, motivo: 'Esa decisión no es de tus cuentas.' };
      const entry = await repo.recordDecision({ decision, dayKey: reading.day, user: { ref: user.id, name: user.teamMember?.name || user.name || null }, verdict, note: nota ? String(nota).slice(0, 300) : null, decidedAt: now() });
      return { saved: true, decision: decision.title, veredicto: entry.verdict, dia: reading.day };
    },

    /** Deja la lectura de la mañana en un chat nuevo de la persona y la avisa. Una vez por día y persona. */
    async deliver(user, reading) {
      const existing = await deliveries.morningBriefDelivery(reading.day, user.id);
      if (existing) return { ...existing, already: true };
      let decisions = null;
      try { decisions = await this.decisionsFor(user, reading); }
      catch (error) { logger.error('[DailyReading] Sin el libro de decisiones esta vez:', error?.message || error); }
      const { title, text } = buildMorningBrief({ recipientName: user.teamMember?.name || user.name, reading, scope: scopeFor(user, reading), log: decisions });
      const chat = await chats().postAssistantNote(actorOf(user), { title, text, metadata: { note: 'LECTURA_MANANA', dayKey: reading.day } });
      const delivery = await deliveries.recordMorningBriefDelivery(reading.day, user.id, chat.id);
      try { await notify({ userId: user.id, type: MORNING_BRIEF_NOTIFICATION, message: 'Bria dejó tu lectura de la mañana en el chat.', relatedId: chat.id }); }
      catch (error) { logger.error('[DailyReading] No se pudo avisar a una persona:', error?.message || error); }
      return { ...delivery, already: false };
    },

    async runAutomatic() {
      const at = now();
      const today = bogotaDate(at), minutes = bogotaClock(at).minutes;
      const done = {};
      if (minutes < SNAPSHOT_FROM) return { skipped: 'fuera de horario' };
      if (!await repo.hasSnapshot(today)) done.snapshot = await this.takeSnapshot(at);
      if (!isBusinessDay(today) || minutes < READING_FROM) return { dayKey: today, ...done };
      const reading = await this.generateReading(at);
      done.reading = reading?.source || null;
      if (minutes < BRIEF_FROM || !reading) return { dayKey: today, ...done };
      let delivered = 0, already = 0, failed = 0;
      for (const user of await listPeople(db)) {
        try { const result = await this.deliver(user, reading); if (result.already) already += 1; else delivered += 1; }
        catch (error) { failed += 1; logger.error('[DailyReading] No se pudo dejar la lectura a una persona:', error?.message || error); }
      }
      return { dayKey: today, ...done, delivered, already, failed };
    },

    /**
     * Lo que Bria consulta en el chat: la última lectura y, si se pide, la historia de una cuenta o de una persona.
     * Respeta el mismo alcance que el mensaje de la mañana.
     */
    async explain({ user, cliente = '', persona = '', days = 14 } = {}) {
      const reading = await repo.latestReading();
      if (!reading) return { mensaje: 'Todavía no hay una lectura guardada: la primera foto se toma a las 6:00 y la primera lectura sale el siguiente día hábil a las 6:30.' };
      const scope = scopeFor(user, reading);
      const visible = (row) => (row.subjectType === 'PERSON' ? scope.people : !scope.clientIds || scope.clientIds.has(row.subjectId));
      const signalsById = new Map(reading.signals.map((row) => [row.id, row]));
      // El libro de decisiones: qué anotó esta persona y cómo viene el acierto (la agencia para administración; lo propio para un PM).
      const own = typeof repo.recentDecisions === 'function' ? await repo.recentDecisions(reading.day, { days: 30, userRef: user.id }) : [];
      const all = scope.clientIds ? own : (typeof repo.recentDecisions === 'function' ? await repo.recentDecisions(reading.day, { days: 30 }) : []);
      const proposed = typeof repo.readingsBefore === 'function' ? [reading, ...await repo.readingsBefore(reading.day, 30)].reduce((sum, row) => sum + (row.decisions || []).length, 0) : 0;
      const noted = new Map(own.filter((e) => e.dayKey === reading.day).map((e) => [e.decisionId, e]));
      const data = {
        fecha: reading.day, comparadaCon: reading.baseDay, escritaPor: reading.source === 'MODELO' ? 'Bria' : 'las reglas de la plataforma (el modelo no estaba disponible o no hacía falta)',
        historia: `${reading.summary.historyDays} ${reading.summary.historyDays === 1 ? 'foto' : 'fotos'} diarias desde el ${reading.summary.firstDay}`,
        resumen: scope.clientIds ? null : reading.overview,
        decisiones: reading.decisions.map((d, i) => ({ d, numero: i + 1 })).filter(({ d }) => visible(d)).map(({ d, numero }) => ({ numero, titulo: d.title, porque: d.why, tipo: d.kind, sobre: d.subjectName, pedido: d.ask, seVeEn: d.evidence.map((id) => signalsById.get(id)?.text).filter(Boolean), anotada: noted.get(d.id)?.verdict || null })),
        senales: reading.signals.filter(visible).slice(0, 25).map((row) => ({ sobre: row.subjectName, cambio: row.direction, texto: row.text })),
        libroDeDecisiones: scorecard(all, { proposed })
      };
      const span = Math.min(Math.max(Number(days) || 14, 3), 40);
      const latest = await repo.snapshot(reading.day);
      const pick = (rows, query) => { const words = fold(query).split(' ').filter(Boolean); return rows.filter((row) => words.every((w) => fold(`${row.name} ${row.slug || ''}`).includes(w))); };
      if (String(cliente).trim()) {
        const matches = pick(latest.clients, cliente).filter((row) => !scope.clientIds || scope.clientIds.has(row.id));
        if (matches.length !== 1) data.cuenta = matches.length ? { varias: matches.slice(0, 8).map((row) => row.name) } : { mensaje: 'No encontré esa cuenta en la foto de hoy (o no está entre las tuyas).' };
        else {
          const row = matches[0];
          const series = await repo.series('CLIENT', row.id, { days: span, until: reading.day });
          data.cuenta = {
            nombre: row.name, enlace: row.slug ? `/clientes/operacion/${row.slug}` : null, color: levelLabel(row.metrics.level), motivos: row.metrics.reasons,
            lectura: reading.accounts?.[row.id]?.lectura || null,
            senales: reading.signals.filter((s) => s.subjectType === 'CLIENT' && s.subjectId === row.id).map((s) => s.text),
            serie: series.map(({ day, metrics: m }) => ({ fecha: day, color: levelLabel(m.level), publicadas: m.cycle ? `${m.cycle.published} de ${m.cycle.quota} (deberían ir ${m.cycle.expected})` : null, esperanAprobacion: m.awaitingApproval, devoluciones: m.returnedPieces + m.returnedTasks, tareasAbiertas: m.openTasks, vencidas: m.overdueTasks, horasDelDiaAnterior: Math.round((m.hoursMs / H) * 10) / 10 }))
          };
        }
      }
      if (String(persona).trim()) {
        if (!scope.people) data.persona = { mensaje: 'La carga de las personas del equipo se ve con el módulo Manager, que tu cuenta no tiene.' };
        else {
          const matches = pick(latest.people, persona);
          if (matches.length !== 1) data.persona = matches.length ? { varias: matches.slice(0, 8).map((row) => row.name) } : { mensaje: 'No encontré a esa persona en el equipo de hoy.' };
          else {
            const row = matches[0];
            const series = await repo.series('PERSON', row.id, { days: span, until: reading.day });
            data.persona = {
              nombre: row.name, enlace: `/gestion?responsable=${encodeURIComponent(row.name)}`,
              senales: reading.signals.filter((s) => s.subjectType === 'PERSON' && s.subjectId === row.id).map((s) => s.text),
              serie: series.map(({ day, metrics: m }) => ({ fecha: day, abiertas: m.open, enProceso: m.inProgress, vencidas: m.overdue, devueltas: m.returned, cerradasElDiaAnterior: m.closedTasks, horasDelDiaAnterior: Math.round((m.hoursMs / H) * 10) / 10 }))
            };
          }
        }
      }
      return data;
    }
  };
};

let instance;
export const getDailyReadingService = () => instance ||= createDailyReadingService();

export const initDailyReadingScheduler = ({ service = getDailyReadingService, setIntervalFn = setInterval, setTimeoutFn = setTimeout, logger = console } = {}) => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await (typeof service === 'function' ? service() : service).runAutomatic(); }
    catch (error) { logger.error('[DailyReading] La lectura del día falló:', error?.message || error); }
    finally { running = false; }
  };
  setTimeoutFn(tick, 4 * 60 * 1000)?.unref?.();
  setIntervalFn(tick, DAILY_READING_CHECK_MS)?.unref?.();
  logger.log('[DailyReading] Memoria del tiempo y lectura de la mañana programadas (foto 6:00, lectura 6:30, mensaje 7:30, Bogotá).');
  return tick;
};
