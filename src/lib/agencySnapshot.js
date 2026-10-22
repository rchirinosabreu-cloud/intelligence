// La memoria del tiempo (Rodny, 19 de octubre de 2026: «quiero que BRIA sea mi project, mis ojos, mi cerebro»).
// Cada día, a primera hora, la plataforma guarda una foto de cada cuenta y de cada persona: cómo amaneció. Con esas
// fotos Bria deja de ver solo «cómo está» y empieza a ver «cómo se movió»: lo que empeoró, lo que lleva días igual y
// lo que mejoró, siempre comparado con la propia historia de esa cuenta o esa persona, nunca con una cifra inventada.
//
// Lógica pura. El servicio lee la plataforma y guarda; aquí se arma la foto y se leen las señales. Cada señal es un
// hecho con sus números, nunca un juicio sobre nadie. Sin historia suficiente, la señal simplemente no aparece.

import { isBusinessDay } from './colombiaBusinessDays.js';
import { expectedPublished } from './clientOperations.js';
import { formatHours } from './teamLoad.js';

const H = 3_600_000;
const DAY = 86_400_000;
export const SIGNAL_KINDS = Object.freeze([
  'CUENTA_EMPEORO', 'CUENTA_MEJORO', 'ROJO_SOSTENIDO', 'APROBACION_DETENIDA', 'DEVOLUCIONES', 'SIN_MOVIMIENTO', 'HORAS_SUBEN',
  'VENCIDAS_SOSTENIDAS', 'VENCIDAS_SUBEN', 'CARGA_INUSUAL', 'DEVUELTAS_PERSONA', 'VENCIDAS_RESUELTAS', 'FUERA_DE_ALCANCE'
]);
const LEVELS = { green: 'verde', yellow: 'amarillo', red: 'rojo', gray: 'gris' };
const RANK = { green: 0, yellow: 1, red: 2 };
export const levelLabel = (level) => LEVELS[level] || 'gris';

const plusDays = (day, amount) => new Date(Date.parse(`${day}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const hours = (ms) => formatHours(Math.round(ms / H) * H);
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const clientUrl = (slug) => (slug ? `/clientes/operacion/${encodeURIComponent(slug)}` : '/clientes?tab=operacion');
const personUrl = (name) => `/gestion?responsable=${encodeURIComponent(String(name || '').trim())}`;

/** La foto de una cuenta: lo que ya calcula Operación de clientes, más lo que solo se sabe mirando el día. */
export const clientSnapshot = (operation, extra = {}) => {
  const cycle = operation.cycles?.current || null;
  const open = operation.openTasks || [];
  return {
    id: operation.id, name: operation.name, slug: operation.slug || null,
    pmId: operation.projectManager?.id || null, cmId: operation.communityManager?.id || null,
    metrics: {
      level: operation.evaluation?.level || 'gray',
      reasons: (operation.evaluation?.reasons || []).slice(0, 3).map((reason) => reason.text),
      contract: operation.contract?.status || null,
      cycle: cycle ? {
        label: cycle.label, quota: cycle.quota || 0, created: cycle.created || 0,
        published: cycle.reached?.publicada || 0, approved: cycle.reached?.aprobada || 0,
        overdueItems: cycle.overdueItems || 0, expected: expectedPublished(cycle), day: cycle.day, length: cycle.length
      } : null,
      awaitingApproval: extra.awaitingApproval || 0, returnedPieces: extra.returnedPieces || 0,
      openTasks: open.length, overdueTasks: open.filter((task) => task.overdue).length, returnedTasks: extra.returnedTasks || 0,
      closedTasks: extra.closedTasks || 0, hoursMs: extra.hoursMs || 0
    }
  };
};

/** La foto de una persona: su carga en números. Nada de esto es una calificación. */
export const personSnapshot = (member, extra = {}) => ({
  id: member.id, name: member.name,
  metrics: { open: extra.open || 0, inProgress: extra.inProgress || 0, overdue: extra.overdue || 0, returned: extra.returned || 0, closedTasks: extra.closedTasks || 0, hoursMs: extra.hoursMs || 0 }
});

/** Cuántos valores seguidos, contando desde el último hacia atrás, cumplen `test`. Un hueco (null) corta la racha. */
export const streakDays = (values, test) => {
  let count = 0;
  for (let i = values.length - 1; i >= 0; i -= 1) { if (values[i] != null && test(values[i])) count += 1; else break; }
  return count;
};

const countLevels = (rows) => {
  const out = { red: 0, yellow: 0, green: 0, gray: 0 };
  for (const metrics of rows) out[RANK[metrics.level] == null ? 'gray' : metrics.level] += 1;
  return out;
};
const teamTotals = (rows) => rows.reduce((sum, m) => ({ open: sum.open + m.open, overdue: sum.overdue + m.overdue, returned: sum.returned + m.returned }), { open: 0, overdue: 0, returned: 0 });

/**
 * Las señales de hoy.
 * `current`: { clients: [{ id, name, slug, metrics }], people: [{ id, name, metrics }] } — la foto de hoy.
 * `history`: [{ day, clients: { [id]: metrics }, people: { [id]: metrics } }] — fotos anteriores, de cualquier orden.
 * La base de comparación es la última foto de un día hábil: lo que pasó el fin de semana se suma a la lectura del lunes.
 */
export const readSignals = ({ today, current = {}, history = [] } = {}) => {
  const byDay = new Map(history.filter((row) => row.day < today).map((row) => [row.day, row]));
  const days = [...byDay.keys()].sort();
  const baseDay = [...days].reverse().find((d) => isBusinessDay(d)) || null;
  const base = baseDay ? byDay.get(baseDay) : null;
  const firstDay = days[0] || today;
  const span = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${firstDay}T12:00:00Z`)) / DAY);
  // La serie de una cuenta o una persona, día por día hasta hoy; un día sin foto queda en null.
  const calendar = Array.from({ length: span + 1 }, (_, i) => plusDays(firstDay, i));
  const series = (group, id, todayMetrics) => calendar.map((d) => (d === today ? todayMetrics : byDay.get(d)?.[group]?.[id] ?? null));

  const signals = [];
  const push = (kind, subject, { severity, text, direction = 'peor', evidence = [] }) => {
    signals.push({ id: `${kind}:${subject.id}`, kind, subjectType: subject.type, subjectId: subject.id, subjectName: subject.name, url: subject.url, severity, direction, text, evidence });
  };

  for (const client of current.clients || []) {
    const m = client.metrics;
    const subject = { type: 'CLIENT', id: client.id, name: client.name, url: clientUrl(client.slug) };
    const values = series('clients', client.id, m);
    const was = base?.clients?.[client.id] || null;
    const reason = m.reasons?.[0] ? `: ${m.reasons[0]}` : '.';
    let colorChanged = false;
    if (was && RANK[was.level] != null && RANK[m.level] != null && RANK[was.level] !== RANK[m.level]) {
      colorChanged = true;
      if (RANK[m.level] > RANK[was.level]) push('CUENTA_EMPEORO', subject, { severity: m.level === 'red' ? 3 : 2, text: `${client.name} pasó de ${levelLabel(was.level)} a ${levelLabel(m.level)}${reason}` });
      else push('CUENTA_MEJORO', subject, { severity: 1, direction: 'mejor', text: m.level === 'green' ? `${client.name} volvió a verde: estaba en ${levelLabel(was.level)}.` : `${client.name} salió del rojo: hoy está en ${levelLabel(m.level)}.` });
    }
    const red = streakDays(values, (v) => v.level === 'red');
    if (!colorChanged && m.level === 'red' && red >= 3) push('ROJO_SOSTENIDO', subject, { severity: red >= 7 ? 3 : 2, text: `${client.name} lleva ${red} días en rojo${reason}` });
    const waiting = streakDays(values, (v) => v.awaitingApproval > 0);
    if (m.awaitingApproval > 0 && waiting >= 3) push('APROBACION_DETENIDA', subject, { severity: waiting >= 7 ? 3 : 2, text: `${client.name} lleva ${waiting} días seguidos con piezas esperando su aprobación (hoy ${m.awaitingApproval}).` });
    const returnsNow = m.returnedPieces + m.returnedTasks;
    const returnsBefore = was ? was.returnedPieces + was.returnedTasks : null;
    if (returnsBefore != null && returnsNow - returnsBefore >= 2) push('DEVOLUCIONES', subject, { severity: 2, text: `${client.name} tiene ${returnsNow} devoluciones abiertas entre piezas y tareas; en la última lectura eran ${returnsBefore}.` });

    // Una cuenta que nadie tocó: días hábiles seguidos sin tiempo registrado ni tareas cerradas, con trabajo abierto.
    // Cada foto cuenta la actividad del día anterior; un día sin foto es desconocido y corta la cuenta.
    if (m.contract === 'ACTIVO' && m.openTasks > 0) {
      let quietDays = 0;
      for (let i = values.length - 1; i >= 0; i -= 1) {
        const v = values[i];
        if (v == null) break;
        if (!isBusinessDay(plusDays(calendar[i], -1))) continue;
        if (v.closedTasks === 0 && v.hoursMs === 0) quietDays += 1; else break;
      }
      if (quietDays >= 4) push('SIN_MOVIMIENTO', subject, { severity: 2, text: `Nadie registró tiempo ni cerró tareas de ${client.name} en los últimos ${quietDays} días hábiles; tiene ${plural(m.openTasks, 'tarea abierta', 'tareas abiertas')}.` });
    }

    // Más piezas que las contratadas (regla 10 del manual, 20 de octubre de 2026: «todo extra se cuenta y se cobra por bloque»).
    if (m.cycle?.quota > 0 && m.cycle.created > m.cycle.quota) {
      const extra = m.cycle.created - m.cycle.quota;
      push('FUERA_DE_ALCANCE', subject, { severity: 1, text: `${client.name} tiene ${m.cycle.created} piezas creadas este mes y el contrato dice ${m.cycle.quota}: ${extra} de más que se ${extra === 1 ? 'cuenta y se cobra' : 'cuentan y se cobran'} aparte.` });
    }

    // Horas de la última semana contra las tres anteriores: solo con cuatro semanas de fotos completas.
    if (span >= 27) {
      const window = (from, to) => calendar.map((d, i) => (d > plusDays(today, -to) && d <= plusDays(today, -from) ? values[i] : undefined)).filter((v) => v !== undefined);
      const last = window(0, 7), before = window(7, 28);
      if (last.every(Boolean) && before.every(Boolean) && before.length === 21) {
        const lastMs = last.reduce((sum, v) => sum + v.hoursMs, 0);
        const avgMs = before.reduce((sum, v) => sum + v.hoursMs, 0) / 3;
        if (avgMs > 0 && lastMs >= avgMs * 1.6 && lastMs - avgMs >= 6 * H) push('HORAS_SUBEN', subject, { severity: 1, text: `En ${client.name} se registraron ${hours(lastMs)} en los últimos 7 días; las tres semanas anteriores promediaron ${hours(avgMs)} por semana.` });
      }
    }
  }

  for (const person of current.people || []) {
    const m = person.metrics;
    const subject = { type: 'PERSON', id: person.id, name: person.name, url: personUrl(person.name) };
    const values = series('people', person.id, m);
    const was = base?.people?.[person.id] || null;
    const overdueDays = streakDays(values, (v) => v.overdue > 0);
    if (m.overdue >= 2 && overdueDays >= 3) push('VENCIDAS_SOSTENIDAS', subject, { severity: overdueDays >= 7 && m.overdue >= 5 ? 3 : 2, text: `${person.name} lleva ${overdueDays} días con tareas vencidas (hoy ${m.overdue}).` });
    if (was && m.overdue - was.overdue >= 2) push('VENCIDAS_SUBEN', subject, { severity: 2, text: `${person.name} pasó de ${was.overdue} a ${m.overdue} tareas vencidas desde la última lectura.` });
    if (was && was.overdue >= 3 && m.overdue === 0) push('VENCIDAS_RESUELTAS', subject, { severity: 1, direction: 'mejor', text: `${person.name} quedó sin tareas vencidas; en la última lectura tenía ${was.overdue}.` });
    if (was && m.returned - was.returned >= 2) push('DEVUELTAS_PERSONA', subject, { severity: 1, text: `${person.name} tiene ${m.returned} tareas devueltas; en la última lectura eran ${was.returned}.` });
    const past = values.slice(0, -1).filter(Boolean).slice(-28).map((v) => v.open);
    if (past.length >= 7) {
      const usual = median(past);
      if (m.open >= usual * 1.5 && m.open - usual >= 5) push('CARGA_INUSUAL', subject, { severity: m.open >= usual * 2 ? 2 : 1, text: `${person.name} tiene ${m.open} pendientes abiertos; lo habitual en las últimas semanas eran ${Math.round(usual)}.` });
    }
  }

  signals.sort((a, b) => (a.direction === b.direction ? 0 : a.direction === 'peor' ? -1 : 1) || b.severity - a.severity);

  // Lo que se hizo desde la última lectura: cada foto cuenta el día anterior, así que se suman las posteriores a la base.
  const after = days.filter((d) => !baseDay || d > baseDay).map((d) => byDay.get(d));
  const peopleNow = (current.people || []).map((p) => p.metrics);
  const sinceBase = [...after.flatMap((row) => Object.values(row.people || {})), ...(baseDay ? peopleNow : [])]
    .reduce((sum, m) => ({ closedTasks: sum.closedTasks + (m.closedTasks || 0), hoursMs: sum.hoursMs + (m.hoursMs || 0) }), { closedTasks: 0, hoursMs: 0 });
  return {
    baseDay, signals,
    summary: {
      historyDays: days.length + 1, firstDay,
      clients: countLevels((current.clients || []).map((c) => c.metrics)),
      baseClients: base ? countLevels(Object.values(base.clients || {})) : null,
      team: teamTotals(peopleNow),
      baseTeam: base ? teamTotals(Object.values(base.people || {})) : null,
      sinceBase: baseDay ? sinceBase : null
    }
  };
};
