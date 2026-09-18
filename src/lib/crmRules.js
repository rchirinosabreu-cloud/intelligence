// Pure commercial rules for the CRM module. No I/O here: the service and the UI both import this file
// so the traffic light, the follow-up buckets and the funnel mean exactly the same thing everywhere.

export const CRM_TIMEZONE = 'America/Bogota';

export const CRM_THRESHOLDS = Object.freeze({
  overdueDays: 7,          // a follow-up this many days late turns the lead red
  staleDays: 21,           // an open lead without any activity for this long turns red
  unansweredFollowUps: 3,  // consecutive outbound touches without a client answer turn red
  recentResponseDays: 7    // a client answer or meeting inside this window keeps the lead green
});

export const CRM_STAGES = Object.freeze([
  { value: 'POR_GESTIONAR', label: 'Por gestionar', group: 'ABIERTO', order: 0 },
  { value: 'CONTACTADO', label: 'Contactado', group: 'ABIERTO', order: 1 },
  { value: 'CITA_SOLICITADA', label: 'Cita solicitada', group: 'ABIERTO', order: 2 },
  { value: 'CITA_REALIZADA', label: 'Cita realizada', group: 'ABIERTO', order: 3 },
  { value: 'PROPUESTA_ENVIADA', label: 'Propuesta enviada', group: 'ABIERTO', order: 4 },
  { value: 'NEGOCIACION', label: 'Negociación', group: 'ABIERTO', order: 5 },
  { value: 'ESPERANDO_CLIENTE', label: 'Esperando cliente', group: 'ABIERTO', order: 6 },
  { value: 'SIN_RESPUESTA', label: 'Sin respuesta', group: 'ABIERTO', order: 7 },
  { value: 'APROBADA', label: 'Aprobada · por formalizar', group: 'APROBADO', order: 8 },
  { value: 'GANADO', label: 'Ganado / contratado', group: 'GANADO', order: 9 },
  { value: 'PERDIDO', label: 'Perdido', group: 'CERRADO', order: 10 },
  { value: 'DESCARTADO', label: 'Descartado', group: 'CERRADO', order: 11 }
]);

export const CRM_STAGE_GROUP_LABELS = Object.freeze({
  ABIERTO: 'Abierto', APROBADO: 'Aprobado', GANADO: 'Ganado', CERRADO: 'Cerrado'
});

export const CRM_ORIGINS = Object.freeze([
  { value: 'LINKEDIN', label: 'LinkedIn' },
  { value: 'CONTACTO_DIRECTO', label: 'Contacto directo' },
  { value: 'REFERIDO', label: 'Referido' },
  { value: 'CLIENTE_ANTERIOR', label: 'Cliente anterior' },
  { value: 'FORMULARIO', label: 'Formulario web' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'CONVOCATORIA', label: 'Convocatoria / RFP' },
  { value: 'ALIADO', label: 'Aliado' },
  { value: 'OTRO', label: 'Otro' }
]);

export const CRM_PRIORITIES = Object.freeze([
  { value: 'ALTA', label: 'Alta' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'BAJA', label: 'Baja' }
]);

export const CRM_TRAFFIC_LIGHTS = Object.freeze([
  { value: 'VERDE', label: 'Verde', description: 'Avanza: hay respuesta o movimiento real.' },
  { value: 'AMARILLO', label: 'Amarillo', description: 'Viva, pero necesita seguimiento o espera decisión.' },
  { value: 'ROJO', label: 'Rojo', description: 'Estancada, sin respuesta, perdida o en riesgo.' }
]);

// direction: OUT = we reached out, IN = the client answered, NONE = internal record.
export const CRM_ACTIVITY_TYPES = Object.freeze([
  { value: 'LLAMADA', label: 'Llamada', direction: 'OUT', contact: true },
  { value: 'CORREO', label: 'Correo', direction: 'OUT', contact: true },
  { value: 'WHATSAPP', label: 'WhatsApp', direction: 'OUT', contact: true },
  { value: 'MENSAJE_LINKEDIN', label: 'Mensaje LinkedIn', direction: 'OUT', contact: true },
  { value: 'REUNION', label: 'Reunión', direction: 'IN', contact: true },
  { value: 'PROPUESTA_ENVIADA', label: 'Propuesta enviada', direction: 'OUT', contact: true },
  { value: 'RESPUESTA_CLIENTE', label: 'Respuesta del cliente', direction: 'IN', contact: true },
  { value: 'NOTA', label: 'Nota interna', direction: 'NONE', contact: false },
  { value: 'CAMBIO_ETAPA', label: 'Cambio de etapa', direction: 'NONE', contact: false }
]);

export const CRM_FOLLOW_UP_BUCKETS = Object.freeze([
  { value: 'VENCIDO', label: 'Vencidos' },
  { value: 'HOY', label: 'Hoy' },
  { value: 'SEMANA', label: 'Esta semana' },
  { value: 'SIN_FECHA', label: 'Sin fecha' }
]);

const stageIndex = new Map(CRM_STAGES.map(stage => [stage.value, stage]));
const activityIndex = new Map(CRM_ACTIVITY_TYPES.map(type => [type.value, type]));

export const isValidStage = value => stageIndex.has(value);
export const isValidOrigin = value => CRM_ORIGINS.some(origin => origin.value === value);
export const isValidPriority = value => CRM_PRIORITIES.some(priority => priority.value === value);
export const isValidTrafficLight = value => CRM_TRAFFIC_LIGHTS.some(light => light.value === value);
export const isValidActivityType = value => activityIndex.has(value);

export const stageGroup = stage => stageIndex.get(stage)?.group ?? null;
export const stageLabel = stage => stageIndex.get(stage)?.label ?? stage;
export const stageOrder = stage => stageIndex.get(stage)?.order ?? -1;
export const isOpenStage = stage => stageGroup(stage) === 'ABIERTO';
export const isClosedStage = stage => ['GANADO', 'CERRADO'].includes(stageGroup(stage));
export const isActionableStage = stage => ['ABIERTO', 'APROBADO'].includes(stageGroup(stage));

export const deriveOutcome = stage => {
  const group = stageGroup(stage);
  if (group === 'ABIERTO') return 'ABIERTO';
  if (group === 'APROBADO') return 'APROBADO';
  if (group === 'GANADO') return 'GANADO';
  if (stage === 'DESCARTADO') return 'DESCARTADO';
  if (stage === 'PERDIDO') return 'PERDIDO';
  return null;
};

export const formatLeadCode = consecutive => `CRM-${String(consecutive ?? 0).padStart(4, '0')}`;

// ---- Bogotá calendar helpers -------------------------------------------------------------------

const keyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: CRM_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})/;

/** 'YYYY-MM-DD' for the Bogotá calendar day of any Date/ISO string. Plain date keys pass through. */
export const bogotaDateKey = value => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && DATE_KEY.test(value) && value.length === 10) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return keyFormatter.format(date);
};

const dayNumber = key => {
  const [, year, month, day] = DATE_KEY.exec(key);
  return Math.round(Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86_400_000);
};

/** Whole Bogotá calendar days from `from` to `to` (positive when `to` is later). */
export const daysBetween = (from, to) => {
  const a = bogotaDateKey(from);
  const b = bogotaDateKey(to);
  if (!a || !b) return null;
  return dayNumber(b) - dayNumber(a);
};

const weekdayOf = key => ((dayNumber(key) + 4) % 7 + 7) % 7; // 0 = Sunday, using the epoch Thursday anchor

/** Where a lead sits in the daily work list. `null` for won/lost/discarded leads. */
export const followUpBucket = (lead, now = new Date()) => {
  if (!isActionableStage(lead?.stage)) return null;
  const target = bogotaDateKey(lead?.nextFollowUpAt);
  if (!target) return 'SIN_FECHA';
  const today = bogotaDateKey(now);
  const delta = dayNumber(target) - dayNumber(today);
  if (delta < 0) return 'VENCIDO';
  if (delta === 0) return 'HOY';
  const daysUntilSunday = (7 - weekdayOf(today)) % 7;
  if (delta <= daysUntilSunday) return 'SEMANA';
  return 'FUTURO';
};

// ---- Traffic light -----------------------------------------------------------------------------

const sortDesc = activities => [...activities].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));

/**
 * Returns { value, mode, reason }. `mode` is MANUAL when the lead carries an override.
 * The first matching rule wins; thresholds live in CRM_THRESHOLDS.
 */
export const computeTrafficLight = (lead = {}, activities = [], now = new Date()) => {
  if (isValidTrafficLight(lead.trafficLightOverride)) {
    return { value: lead.trafficLightOverride, mode: 'MANUAL', reason: lead.trafficLightReason || 'Fijado manualmente.' };
  }
  const auto = (value, reason) => ({ value, mode: 'AUTO', reason });
  const group = stageGroup(lead.stage);
  if (group === 'CERRADO') return auto('ROJO', 'Oportunidad cerrada sin venta.');
  if (lead.stage === 'SIN_RESPUESTA') return auto('ROJO', 'El cliente no responde.');
  if (group === 'APROBADO') return auto('VERDE', 'Propuesta aprobada; falta formalizar.');
  if (group === 'GANADO') return auto('VERDE', 'Oportunidad ganada.');

  const overdueDays = lead.nextFollowUpAt ? daysBetween(lead.nextFollowUpAt, now) : null;
  if (overdueDays !== null && overdueDays > CRM_THRESHOLDS.overdueDays) {
    return auto('ROJO', `Seguimiento vencido hace ${overdueDays} días.`);
  }
  const reference = lead.lastActivityAt || lead.enteredAt || lead.createdAt;
  const idleDays = reference ? daysBetween(reference, now) : null;
  if (idleDays !== null && idleDays > CRM_THRESHOLDS.staleDays) {
    return auto('ROJO', `Sin gestión hace ${idleDays} días (límite ${CRM_THRESHOLDS.staleDays}).`);
  }

  const contacts = sortDesc(activities).filter(item => activityIndex.get(item.type)?.contact);
  const latest = contacts.slice(0, CRM_THRESHOLDS.unansweredFollowUps);
  if (latest.length === CRM_THRESHOLDS.unansweredFollowUps && latest.every(item => activityIndex.get(item.type).direction === 'OUT')) {
    return auto('ROJO', `${CRM_THRESHOLDS.unansweredFollowUps} seguimientos sin respuesta del cliente.`);
  }
  const lastInbound = contacts.find(item => activityIndex.get(item.type).direction === 'IN');
  if (lastInbound && daysBetween(lastInbound.occurredAt, now) <= CRM_THRESHOLDS.recentResponseDays) {
    return auto('VERDE', 'Hubo respuesta o reunión reciente.');
  }
  return auto('AMARILLO', 'Viva; requiere seguimiento.');
};

// ---- Metrics -----------------------------------------------------------------------------------

const toNumber = value => {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const count = (items, pick) => items.reduce((acc, item) => {
  const key = pick(item);
  if (key === null || key === undefined) return acc;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const average = values => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const round = value => (value === null ? null : Math.round(value * 100) / 100);

// A stage counts as reached only with evidence: the lead is there now or a stage change recorded it.
const reachedStage = (lead, target) => lead.stage === target
  || (lead.activities || []).some(item => item.type === 'CAMBIO_ETAPA' && item.toStage === target);

/**
 * Every number the dashboard and the reports show. `leads` must already be filtered and must carry
 * their `activities` (at least type/occurredAt/toStage) so the funnel can count stages already passed.
 */
export const computeMetrics = (leads = [], now = new Date()) => {
  const lights = leads.map(lead => computeTrafficLight(lead, lead.activities || [], now).value);
  const byTrafficLight = { VERDE: 0, AMARILLO: 0, ROJO: 0 };
  lights.forEach(value => { byTrafficLight[value] += 1; });

  const groups = count(leads, lead => stageGroup(lead.stage));
  const contacted = leads.filter(lead => lead.firstContactAt);
  const meeting = leads.filter(lead => reachedStage(lead, 'CITA_REALIZADA') || (lead.activities || []).some(item => item.type === 'REUNION'));
  const proposal = leads.filter(lead => lead.proposalSentAt || reachedStage(lead, 'PROPUESTA_ENVIADA'));
  const won = leads.filter(lead => lead.stage === 'GANADO');
  const rate = part => (leads.length ? round(part / leads.length) : null);

  const followUps = { VENCIDO: 0, HOY: 0, SEMANA: 0, SIN_FECHA: 0 };
  leads.forEach(lead => {
    const bucket = followUpBucket(lead, now);
    if (bucket in followUps) followUps[bucket] += 1;
  });

  const measurable = leads.filter(lead => lead.enteredAt && !lead.enteredAtEstimated);
  const daysToContact = measurable.filter(lead => lead.firstContactAt).map(lead => daysBetween(lead.enteredAt, lead.firstContactAt));
  const daysToWin = measurable.filter(lead => lead.stage === 'GANADO' && lead.closedAt).map(lead => daysBetween(lead.enteredAt, lead.closedAt));

  return {
    total: leads.length,
    linkedin: leads.filter(lead => lead.origin === 'LINKEDIN').length,
    brainStudio: leads.filter(lead => lead.origin !== 'LINKEDIN').length,
    open: groups.ABIERTO || 0,
    approved: groups.APROBADO || 0,
    won: groups.GANADO || 0,
    lost: groups.CERRADO || 0,
    byTrafficLight,
    byOrigin: count(leads, lead => lead.origin),
    byStage: count(leads, lead => lead.stage),
    byPriority: count(leads, lead => lead.priority),
    byOwner: count(leads, lead => lead.ownerId || 'SIN_RESPONSABLE'),
    funnel: {
      counts: { entered: leads.length, contacted: contacted.length, meeting: meeting.length, proposal: proposal.length, won: won.length },
      rates: { contacted: rate(contacted.length), meeting: rate(meeting.length), proposal: rate(proposal.length), won: rate(won.length) }
    },
    quotedOpenValue: leads.filter(lead => isOpenStage(lead.stage)).reduce((sum, lead) => sum + toNumber(lead.quotedValue), 0),
    quotedTotalValue: leads.reduce((sum, lead) => sum + toNumber(lead.quotedValue), 0),
    wonValue: won.reduce((sum, lead) => sum + toNumber(lead.quotedValue), 0),
    avgDaysToFirstContact: round(average(daysToContact)),
    avgDaysToWin: round(average(daysToWin)),
    followUps
  };
};
