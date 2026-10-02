// Operación de clientes (Rodny, 2 de octubre de 2026: «lo que dice la plataforma es lo que se refleja en
// la operación»). Sustituye por completo al Excel «PENDIENTES BRAIN STUDIO 2026»: lo que allí se escribía
// a mano (estado de redacción, diseño, aprobación, programación, porcentaje del mes) aquí se calcula con
// las piezas, sus fechas y las tareas. Lo único que se escribe es lo que nadie más sabe: el contrato.
// Las mismas reglas las usan la pantalla y el servidor.

// Etapas de una pieza, en orden. Cada una cuenta las piezas que llegaron *al menos* hasta ahí.
export const OPERATION_STAGES = [
  { key: 'redactada', label: 'Redactada', hint: 'Tiene guion y texto escritos' },
  { key: 'disenada', label: 'Diseñada', hint: 'Tiene la pieza final cargada' },
  { key: 'aprobada', label: 'Aprobada', hint: 'El cliente la aprobó en el portal' },
  { key: 'programada', label: 'Programada', hint: 'Tiene «Programar» en Meta' },
  { key: 'publicada', label: 'Publicada', hint: 'Meta confirmó la publicación o alguien la marcó publicada' },
];

// Columnas del Excel que pasan a la ficha operativa (hoja MIO e INDICADORES).
export const CLIENT_AGENCIES = [{ value: 'BRAIN', label: 'Brain Studio' }, { value: 'MIO', label: 'MIO Agencia' }];
export const CLIENT_COMPLEXITY = [{ value: 'ALTA', label: 'Alta' }, { value: 'MEDIA', label: 'Media' }, { value: 'BAJA', label: 'Baja' }];
// «Parrilla mensual» se mide contra un cupo de piezas; «Servicios» (web, mapas, Power BI, jornadas
// sueltas) no tiene cupo y se sigue por sus tareas.
export const SERVICE_TYPES = [{ value: 'PARRILLA', label: 'Parrilla mensual' }, { value: 'SERVICIOS', label: 'Servicios' }];
export const CONTRACT_STATUSES = [{ value: 'ACTIVO', label: 'Activo' }, { value: 'STAND_BY', label: 'Stand by' }, { value: 'TERMINADO', label: 'Terminado' }];
export const STORY_FREQUENCIES = [
  { value: 0, label: 'Sin historias' },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n} por semana` })),
  { value: 7, label: 'Todos los días' },
];

export const labelOf = (list, value) => list.find((option) => option.value === value)?.label || '';

export const OPERATION_LEVELS = ['red', 'yellow', 'green', 'gray'];
export const MAX_DAYS_BETWEEN_POSTS = 3;
export const CONTRACT_WARNING_DAYS = 30;
export const NO_PLAN_RED_FROM_DAY = 5;

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «2026-10-20» → «20 oct». Se lee el texto, nunca un Date: el día no se corre con la zona horaria. */
export function shortDate(dateKey) {
  const [, month, day] = String(dateKey || '').split('-').map(Number);
  if (!month || !day) return '';
  return `${day} ${MONTHS[month - 1]}`;
}

export function daysBetween(fromKey, toKey) {
  const toUtc = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(toKey) - toUtc(fromKey)) / 86_400_000);
}

export function contractQuota(contract) {
  return (contract?.deliverables || []).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
}

export const isMeasured = (client) => client.contract?.serviceType === 'PARRILLA' && contractQuota(client.contract) > 0;

/** Cuántas piezas deberían ir publicadas a esta altura del ciclo, repartidas de forma pareja. */
export function expectedPublished(cycle) {
  if (!cycle?.quota || !cycle.length) return 0;
  return Math.floor((cycle.quota * Math.min(cycle.day, cycle.length)) / cycle.length);
}

function pieces(n) { return n === 1 ? '1 pieza' : `${n} piezas`; }

function taskReasons(client) {
  const overdue = (client.openTasks || []).filter((task) => task.overdue).length;
  if (!overdue) return [];
  return [{ level: 'yellow', text: overdue === 1 ? '1 tarea vencida en Gestión.' : `${overdue} tareas vencidas en Gestión.` }];
}

function finish(reasons) {
  const level = reasons.some((r) => r.level === 'red') ? 'red' : reasons.length ? 'yellow' : 'green';
  reasons.sort((a, b) => OPERATION_LEVELS.indexOf(a.level) - OPERATION_LEVELS.indexOf(b.level));
  return { level, reasons };
}

/**
 * El semáforo de un cliente. Devuelve el color y, sobre todo, los motivos en una frase cada uno:
 * un rojo sin motivo no le sirve a nadie.
 */
export function evaluateClientOperation(client, { today }) {
  const { contract } = client;
  if (!contract) return { level: 'gray', reasons: [{ level: 'gray', text: 'Sin contrato cargado: no hay contra qué medir el avance.' }] };
  if (contract.status === 'STAND_BY') {
    return { level: 'gray', reasons: [{ level: 'gray', text: contract.standBySince ? `En stand by desde el ${shortDate(contract.standBySince)}.` : 'En stand by.' }] };
  }
  if (contract.status === 'TERMINADO') return { level: 'gray', reasons: [{ level: 'gray', text: 'Contrato terminado.' }] };

  const reasons = [];
  if (contract.endDate) {
    const left = daysBetween(today, contract.endDate);
    if (left < 0) reasons.push({ level: 'yellow', text: `El contrato venció el ${shortDate(contract.endDate)}: renovarlo o cerrarlo.` });
    else if (left <= CONTRACT_WARNING_DAYS) reasons.push({ level: 'yellow', text: `El contrato vence el ${shortDate(contract.endDate)}.` });
  }

  // Servicios: sin cupo de piezas, lo que dice si va bien son sus tareas.
  if (!isMeasured(client)) {
    reasons.push(...taskReasons(client));
    if (!(client.openTasks || []).length && !reasons.length) return { level: 'gray', reasons: [{ level: 'gray', text: 'Servicios sin trabajo abierto en Gestión.' }] };
    return finish(reasons);
  }

  const { previous, current } = client.cycles || {};
  if (previous && previous.reached.publicada < previous.quota) {
    const missing = previous.quota - previous.reached.publicada;
    reasons.push({ level: 'red', text: `${previous.label} cerró con ${previous.reached.publicada} de ${previous.quota} publicadas: faltaron ${pieces(missing)}.` });
  }
  if (contract.monthlyReport && previous && !previous.report?.deliveredAt) {
    reasons.push({ level: 'yellow', text: `Falta entregar el informe de ${previous.label.toLowerCase()}.` });
  }

  if (current) {
    if (!current.created) {
      reasons.push({ level: current.day >= NO_PLAN_RED_FROM_DAY ? 'red' : 'yellow', text: `${current.label} todavía no tiene parrilla.` });
    } else if (current.created < current.quota) {
      reasons.push({ level: 'yellow', text: `${current.label}: ${current.created} de ${current.quota} piezas creadas, faltan ${current.quota - current.created}.` });
    }
    if (current.overdueItems > 0) {
      reasons.push({ level: 'red', text: `${pieces(current.overdueItems)} con fecha pasada y sin publicar.` });
    }
    const expected = expectedPublished(current);
    if (current.created && expected - current.reached.publicada >= 2 && !current.overdueItems) {
      reasons.push({ level: 'red', text: `Van ${current.reached.publicada} publicadas; a esta fecha deberían ir ${expected}.` });
    }
    if (current.longestGap && current.longestGap.days > MAX_DAYS_BETWEEN_POSTS) {
      reasons.push({ level: 'yellow', text: `${current.longestGap.days} días entre publicaciones (del ${shortDate(current.longestGap.from)} al ${shortDate(current.longestGap.to)}).` });
    }
    for (const day of current.sameDay || []) {
      reasons.push({ level: 'yellow', text: `${day.count} piezas el mismo día: ${shortDate(day.date)}.` });
    }
  }

  reasons.push(...taskReasons(client));
  return finish(reasons);
}

/** Del ciclo a segmentos de una sola barra: cada pieza se pinta en la etapa más avanzada que alcanzó. */
export function cycleSegments(cycle) {
  if (!cycle) return [];
  const r = cycle.reached;
  const segments = [];
  let above = 0;
  for (const key of ['publicada', 'programada', 'aprobada', 'disenada', 'redactada']) {
    segments.push({ key, count: Math.max(0, (r[key] || 0) - above) });
    above = Math.max(above, r[key] || 0);
  }
  segments.push({ key: 'creada', count: Math.max(0, cycle.created - above) });
  segments.push({ key: 'faltante', count: Math.max(0, cycle.quota - Math.max(cycle.created, above)) });
  return segments;
}

/** «Clientes a cargo» del Excel, con números: por persona, cuántos clientes y cuántos van mal. */
export function teamLoad(evaluatedClients, roleKey = 'communityManager') {
  const byMember = new Map();
  for (const { client, evaluation } of evaluatedClients) {
    const member = client[roleKey];
    const key = member?.id || 'sin-asignar';
    if (!byMember.has(key)) byMember.set(key, { member: member || null, clients: [], red: 0, yellow: 0, quota: 0, published: 0, overdueTasks: 0 });
    const row = byMember.get(key);
    row.clients.push({ client, evaluation });
    if (evaluation.level === 'red') row.red += 1;
    if (evaluation.level === 'yellow') row.yellow += 1;
    if (isMeasured(client) && client.contract.status === 'ACTIVO' && client.cycles?.current) {
      row.quota += client.cycles.current.quota;
      row.published += client.cycles.current.reached.publicada;
    }
    row.overdueTasks += (client.openTasks || []).filter((t) => t.overdue).length;
  }
  return [...byMember.values()].sort((a, b) => b.red - a.red || b.clients.length - a.clients.length);
}

// Los mismos formatos que ofrece la pieza en la parrilla: lo contratado y lo hecho se cuentan igual.
export const CONTRACT_FORMATS = ['Reel', 'Carrusel', 'Post', 'Otro'];
export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (y, m, d) => { const date = new Date(Date.UTC(y, m - 1, d)); return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`; };
const clampCut = (cutDay) => Math.min(28, Math.max(1, Math.trunc(Number(cutDay) || 1)));

/** La parrilla del mes `month` va del día de corte al día anterior del mes siguiente (mes calendario si el corte es 1). */
export function cycleOf(year, month, cutDay = 1) {
  const cut = clampCut(cutDay);
  return { year, month, start: dateKey(year, month, cut), end: dateKey(year, month + 1, cut - 1), label: MONTH_NAMES[month - 1] };
}

/** Qué parrilla corre en un día (texto «YYYY-MM-DD», día de Bogotá). */
export function cycleForDate(todayKey, cutDay = 1) {
  const [y, m, d] = todayKey.split('-').map(Number);
  const cut = clampCut(cutDay);
  if (d >= cut) return cycleOf(y, m, cut);
  return m === 1 ? cycleOf(y - 1, 12, cut) : cycleOf(y, m - 1, cut);
}

export function previousCycle({ year, month }, cutDay = 1) {
  return month === 1 ? cycleOf(year - 1, 12, cutDay) : cycleOf(year, month - 1, cutDay);
}

const WRITTEN_STATUSES = new Set(['EN_REVISION', 'EN_PRODUCCION', 'REALIZADO', 'APROBADO', 'PUBLICADO']);
const DESIGNED_STATUSES = new Set(['REALIZADO', 'APROBADO', 'PUBLICADO']);
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * Hasta qué etapa llegó una pieza (0 = nada, 1 redactada … 5 publicada). Sale de lo que la pieza tiene
 * —texto, archivo final, aprobación, programación en Meta— y nunca de un estado escrito a mano aparte.
 */
export function pieceStage(item) {
  const status = item.status;
  let stage = 0;
  if (hasText(item.copyText) || hasText(item.captionText) || WRITTEN_STATUSES.has(status)) stage = 1;
  if (item.hasFinalAsset || DESIGNED_STATUSES.has(status)) stage = 2;
  if (status === 'APROBADO' || status === 'PUBLICADO') stage = 3;
  if (item.hasActivePublication || status === 'PUBLICADO') stage = Math.max(stage, 4);
  if (status === 'PUBLICADO') stage = 5;
  return stage;
}

const STAGE_KEYS = ['redactada', 'disenada', 'aprobada', 'programada', 'publicada'];

/** Resume las piezas de una parrilla contra lo contratado. `items` llevan `date` como «YYYY-MM-DD». */
export function summarizeCycle(cycle, items, { quota, today }) {
  const sorted = [...items].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const stages = sorted.map(pieceStage);
  const reached = Object.fromEntries(STAGE_KEYS.map((key, index) => [key, stages.filter((s) => s >= index + 1).length]));
  const overdueItems = sorted.filter((item) => item.date && item.date < today && item.status !== 'PUBLICADO').length;

  const dates = [...new Set(sorted.map((item) => item.date).filter(Boolean))];
  let longestGap = null;
  for (let i = 1; i < dates.length; i += 1) {
    const days = daysBetween(dates[i - 1], dates[i]);
    if (days > MAX_DAYS_BETWEEN_POSTS && (!longestGap || days > longestGap.days)) longestGap = { days, from: dates[i - 1], to: dates[i] };
  }
  const perDay = new Map();
  for (const item of sorted) if (item.date) perDay.set(item.date, (perDay.get(item.date) || 0) + 1);
  const sameDay = [...perDay].filter(([, count]) => count > 1).map(([date, count]) => ({ date, count }));

  const length = daysBetween(cycle.start, cycle.end) + 1;
  const day = Math.min(length, Math.max(0, daysBetween(cycle.start, today) + 1));
  return {
    ...cycle, quota, created: sorted.length, reached, overdueItems, longestGap, sameDay, day, length,
    pieces: sorted.map((item) => ({ id: item.id, date: item.date, format: item.format, title: item.title, status: item.status, planId: item.planId, markedByHand: Boolean(item.markedByHand) })),
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDateKey = (value) => DATE_RE.test(value) && dateKey(...value.split('-').map(Number)) === value;
const optionalText = (value, max) => { const text = String(value ?? '').trim(); return text ? text.slice(0, max) : null; };
const optionalId = (value) => { const id = String(value ?? '').trim(); return id || null; };
const intIn = (value, min, max) => { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : null; };

/**
 * La ficha operativa y el contrato, validados una sola vez para la pantalla y el servidor. Devuelve
 * `{ valid, value, errors }`; los errores van por campo y en español para mostrarlos junto a cada uno.
 */
export function normalizeOperationProfile(input = {}) {
  const errors = {};
  const value = {
    description: optionalText(input.description, 2000),
    instagramUrl: optionalText(input.instagramUrl, 300),
    agency: input.agency ? String(input.agency) : null,
    complexity: input.complexity ? String(input.complexity) : null,
    projectManagerId: optionalId(input.projectManagerId),
    communityManagerId: optionalId(input.communityManagerId),
    contract: null,
  };
  if (value.instagramUrl && !/^https?:\/\/\S+$/i.test(value.instagramUrl)) errors.instagramUrl = 'Escribe un enlace que empiece por https://.';
  if (value.agency && !CLIENT_AGENCIES.some((o) => o.value === value.agency)) errors.agency = 'Elige Brain Studio o MIO Agencia.';
  if (value.complexity && !CLIENT_COMPLEXITY.some((o) => o.value === value.complexity)) errors.complexity = 'Elige alta, media o baja.';

  const raw = input.contract;
  if (raw) {
    const serviceType = String(raw.serviceType || 'PARRILLA');
    const status = String(raw.status || 'ACTIVO');
    const contract = {
      serviceType, status,
      startDate: String(raw.startDate || ''),
      endDate: raw.endDate ? String(raw.endDate) : null,
      standBySince: raw.standBySince ? String(raw.standBySince) : null,
      cutDay: intIn(raw.cutDay ?? 1, 1, 28),
      deliverables: [],
      storiesPerWeek: Number(raw.storiesPerWeek) || 0,
      productionDays: intIn(raw.productionDays ?? 0, 0, 31),
      monthlyReport: raw.monthlyReport === true,
      notes: optionalText(raw.notes, 2000),
    };
    if (!SERVICE_TYPES.some((o) => o.value === serviceType)) errors['contract.serviceType'] = 'Elige parrilla mensual o servicios.';
    if (!CONTRACT_STATUSES.some((o) => o.value === status)) errors['contract.status'] = 'Elige activo, stand by o terminado.';
    if (!isDateKey(contract.startDate)) errors['contract.startDate'] = 'Falta la fecha de inicio.';
    if (contract.endDate && !isDateKey(contract.endDate)) errors['contract.endDate'] = 'La fecha de fin no es válida.';
    else if (contract.endDate && isDateKey(contract.startDate) && contract.endDate < contract.startDate) errors['contract.endDate'] = 'El fin no puede ser antes del inicio.';
    if (contract.standBySince && !isDateKey(contract.standBySince)) errors['contract.standBySince'] = 'La fecha de stand by no es válida.';
    if (contract.cutDay === null) errors['contract.cutDay'] = 'El día de corte va del 1 al 28.';
    if (contract.productionDays === null) errors['contract.productionDays'] = 'Las jornadas van de 0 a 31.';
    if (!STORY_FREQUENCIES.some((o) => o.value === contract.storiesPerWeek)) errors['contract.storiesPerWeek'] = 'Elige una frecuencia de historias.';
    if (serviceType === 'PARRILLA') {
      const rows = Array.isArray(raw.deliverables) ? raw.deliverables : [];
      const seen = new Set();
      for (const row of rows) {
        const format = String(row?.format || '');
        const quantity = intIn(row?.quantity, 0, 99);
        if (!CONTRACT_FORMATS.includes(format) || quantity === null || seen.has(format)) { errors['contract.deliverables'] = 'Cada formato va una sola vez, con una cantidad de 0 a 99.'; break; }
        seen.add(format);
        if (quantity > 0) contract.deliverables.push({ format, quantity });
      }
    }
    if (contract.status !== 'STAND_BY') contract.standBySince = null;
    value.contract = contract;
  }
  return { valid: Object.keys(errors).length === 0, value, errors };
}
