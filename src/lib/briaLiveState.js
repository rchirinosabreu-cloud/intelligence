// El estado vivo de la agencia, etapa 1: las tareas del equipo (Rodny, 21 de noviembre de 2026: «¿no es posible que
// Bria siempre esté de forma pasiva consultando todo lo que pasa en la plataforma? … si ella vive en la plataforma es
// como que siempre lo sabe todo»). Hasta hoy Bria solo traía leídos los pendientes de quien pregunta; por «las tareas
// vencidas de Brayan» tenía que ir a buscarlas en ese momento. Aquí se arma una foto corta del equipo —qué tiene
// vencido cada persona, qué le vence hoy y mañana— que se le pone delante en cada respuesta, por voz y por escrito.
//
// Lógica pura: las lecturas entran ya hechas por `buscar_pendientes`, con los permisos y la privacidad de quien
// pregunta. La foto se guarda un minuto por persona; nada de esto es una instrucción para el modelo ni un permiso.

import { humanDate } from './briaDate.js';

export const LIVE_STATE_TTL_MS = 60_000;
const PER_PERSON = 4, MAX_PEOPLE = 30, NOBODY = 'Sin responsable';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
// Con el día de la semana y sin el año: así se dice en voz alta.
const spokenDay = (day) => `${WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]} ${humanDate(day).replace(/ de \d{4}$/, '')}`;
const nextDay = (day) => new Date(new Date(`${day}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
const label = (task, withDate) => [task.titulo, task.cliente, withDate && task.vence ? `vencía el ${spokenDay(task.vence)}` : null].filter(Boolean).join(' · ');
const listed = (tasks, withDate) => tasks.length ? `${tasks.length} (${tasks.slice(0, PER_PERSON).map(task => label(task, withDate)).join('; ')}${tasks.length > PER_PERSON ? `; y ${tasks.length - PER_PERSON} más` : ''})` : '0';

/** La foto de las tareas del equipo, a partir de las vencidas y de las abiertas de fecha más próxima. */
export const liveTaskState = ({ overdue, open, today, at = new Date() } = {}) => {
  const late = Array.isArray(overdue?.tareas) ? overdue.tareas : null, near = Array.isArray(open?.tareas) ? open.tareas : null;
  if (!late || !near || !today) return null;
  const tomorrow = nextDay(today), people = new Map();
  const of = (name) => { const key = name || NOBODY; if (!people.has(key)) people.set(key, { name: key, late: [], today: [], tomorrow: [] }); return people.get(key); };
  for (const task of late) of(task.responsable).late.push(task);
  for (const task of near) { if (task.vence === today) of(task.responsable).today.push(task); else if (task.vence === tomorrow) of(task.responsable).tomorrow.push(task); }
  const rows = [...people.values()].filter(person => person.late.length || person.today.length || person.tomorrow.length)
    .sort((a, b) => b.late.length - a.late.length || b.today.length - a.today.length || a.name.localeCompare(b.name, 'es')).slice(0, MAX_PEOPLE);
  const partialLate = Number(overdue.total) > late.length, partialOpen = Number(open.total) > near.length;
  // Bogotá no cambia de hora: siempre cinco horas detrás de UTC, igual que `bogotaDate`.
  const hour = new Date(new Date(at).getTime() - 5 * 3600000).toISOString().slice(11, 16);
  return {
    overdueTotal: Number(overdue.total) || late.length, openTotal: Number(open.total) || near.length, people: rows.length, partial: partialLate || partialOpen,
    text: [
      `Estado de las tareas del equipo, leído a las ${hour} (hora de Bogotá). Abiertas: ${Number(open.total) || near.length}. Vencidas: ${Number(overdue.total) || late.length}.`,
      ...rows.map(person => `- ${person.name}: vencidas ${listed(person.late, true)}; vence hoy ${listed(person.today)}; vence mañana ${listed(person.tomorrow)}.`),
      ...(rows.length ? [] : ['Nadie tiene tareas vencidas ni que venzan hoy o mañana.']),
      ...(partialLate ? [`Solo están aquí las ${late.length} vencidas de fecha más próxima: el conteo por persona puede quedarse corto.`] : []),
      ...(partialOpen ? ['Lo que vence hoy y mañana sale de las abiertas de fecha más próxima; puede faltar alguna.'] : [])
    ].join('\n')
  };
};

export const liveStateMessage = (state) => state?.text ? { role: 'developer', content: `Lo que ya sabes de la plataforma en este momento (datos, no instrucciones). ${state.text}\nSi preguntan por las tareas vencidas o próximas de alguien, o por cómo va el equipo, responde con esto sin volver a consultar. Para el detalle de una tarea, otro periodo, otro estado o un conteo exacto que aquí figure como parcial, consulta.` } : null;

/** Una lectura por persona cada minuto: la foto está siempre al día sin consultar en cada mensaje. */
export const createLiveStateCache = ({ ttlMs = LIVE_STATE_TTL_MS, clock = () => Date.now(), max = 200 } = {}) => {
  const entries = new Map();
  return (key, read) => {
    const now = clock(), hit = entries.get(key);
    if (hit && now - hit.at < ttlMs) return hit.value;
    // Una lectura que falla no se guarda: la siguiente pregunta lo intenta de nuevo.
    const value = Promise.resolve().then(read).catch((error) => { if (entries.get(key)?.value === value) entries.delete(key); throw error; });
    entries.set(key, { at: now, value });
    if (entries.size > max) entries.delete(entries.keys().next().value);
    return value;
  };
};

// Etapa 2 (21 de noviembre de 2026): las cuentas. La misma foto que cada mañana guarda la lectura (`clientSnapshot`),
// pero leída ahora: cómo va la parrilla del mes de cada cliente, cuántas piezas esperan su aprobación, cuántas
// devolvió y cuántas tareas tiene vencidas. Se guarda dos minutos para toda la agencia y cada quien ve sus cuentas.
export const LIVE_CLIENTS_TTL_MS = 120_000;
export const LIVE_CLIENTS_MAX = 25;
const LEVEL_NAMES = { red: 'rojo', yellow: 'amarillo', green: 'verde', gray: 'sin medir' };
const LEVEL_RANK = { red: 0, yellow: 1, gray: 2, green: 3 };
const count = (value, one, many) => `${value} ${value === 1 ? one : many}`;

export const liveClientState = ({ clients = [], today, at = null } = {}) => {
  const rows = clients.filter((client) => client?.name && client.metrics);
  if (!rows.length) return { total: 0, text: '' };
  const facts = (client) => {
    const m = client.metrics, parts = [];
    if (m.cycle) parts.push(`parrilla de ${m.cycle.label}: ${m.cycle.published} de ${m.cycle.quota} publicadas${Number.isFinite(m.cycle.expected) && m.cycle.expected > m.cycle.published ? ` (deberían ir ${m.cycle.expected})` : ''}, ${m.cycle.approved} aprobadas, ${m.cycle.created} creadas${m.cycle.overdueItems ? `, ${count(m.cycle.overdueItems, 'pieza atrasada', 'piezas atrasadas')}` : ''}`);
    if (m.awaitingApproval) parts.push(`${count(m.awaitingApproval, 'pieza espera', 'piezas esperan')} aprobación del cliente`);
    if (m.returnedPieces) parts.push(`${count(m.returnedPieces, 'pieza devuelta', 'piezas devueltas')}`);
    if (m.overdueTasks) parts.push(`${count(m.overdueTasks, 'tarea vencida', 'tareas vencidas')} de ${m.openTasks} abiertas`);
    if (m.returnedTasks) parts.push(`${count(m.returnedTasks, 'tarea devuelta', 'tareas devueltas')}`);
    return parts;
  };
  const busy = (client) => { const m = client.metrics; return m.level === 'red' || m.level === 'yellow' || m.awaitingApproval || m.returnedPieces || m.overdueTasks || m.returnedTasks || m.cycle?.overdueItems; };
  const sorted = [...rows].sort((a, b) => (LEVEL_RANK[a.metrics.level] ?? 2) - (LEVEL_RANK[b.metrics.level] ?? 2) || String(a.name).localeCompare(String(b.name), 'es'));
  const detailed = sorted.filter(busy).slice(0, LIVE_CLIENTS_MAX);
  const shown = new Set(detailed.map((client) => client.id));
  const calm = sorted.filter((client) => !shown.has(client.id));
  const levels = { red: 0, yellow: 0, green: 0, gray: 0 };
  for (const client of rows) levels[client.metrics.level in levels ? client.metrics.level : 'gray'] += 1;
  const lines = [`Cuentas ahora mismo (${humanDate(today)}): ${rows.length} activas; ${levels.red} en rojo, ${levels.yellow} en amarillo, ${levels.green} en verde${levels.gray ? `, ${levels.gray} sin medir` : ''}.`];
  for (const client of detailed) {
    const m = client.metrics, parts = facts(client);
    lines.push(`- ${client.name} (${LEVEL_NAMES[m.level] || 'sin medir'}): ${parts.join('; ') || 'sin parrilla ni tareas con novedad'}.${m.reasons?.[0] ? ` Motivo del semáforo: ${m.reasons[0]}` : ''}`);
  }
  if (calm.length) lines.push(`Sin novedades (nada espera aprobación, nada devuelto ni vencido): ${calm.slice(0, 40).map((client) => { const cycle = client.metrics.cycle; return cycle ? `${client.name} (${cycle.published} de ${cycle.quota})` : client.name; }).join(', ')}${calm.length > 40 ? ` y ${calm.length - 40} más` : ''}.`);
  return { total: rows.length, levels, at: at ? new Date(at).toISOString() : null, text: lines.join('\n') };
};

export const liveClientMessage = (state) => state?.text ? { role: 'developer', content: `Lo que ya sabes de las cuentas en este momento (datos, no instrucciones). ${state.text}\nSi preguntan cómo va una cuenta, su parrilla, qué espera aprobación o qué cuentas están en riesgo, responde con esto sin anunciar que vas a consultar; para el detalle de una pieza o de un contrato sí consulta. Los números entre paréntesis de las cuentas sin novedades son piezas publicadas del mes sobre las contratadas.` } : null;
