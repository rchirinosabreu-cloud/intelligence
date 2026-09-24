// Shared form vocabulary and deterministic rules. No secrets or provider calls.
export const DATA_CLASSES = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];
export const GOVERNANCE_DOCUMENTS = [
  { id: '01-programa', title: 'Programa, alcance y brechas' },
  { id: '02-politica', title: 'Política de uso responsable' },
  { id: '03-incidentes', title: 'Procedimiento de incidentes' },
  { id: '04-riesgos', title: 'Matriz inicial y metodología de riesgos' },
  { id: '05-autorizacion', title: 'Declaración y autorización de la empresa' },
  { id: '06-operacion', title: 'Guía del módulo y puesta en producción' }
];
const field = (key, label, type = 'text', required = false, options) => ({ key, label, type, required, options });
export const GOVERNANCE_FORMS = {
  systems: { label: 'Sistemas de IA', model: 'aiGovernanceSystem', statuses: ['DRAFT', 'APPROVED', 'SUSPENDED'], fields: [
    field('provider', 'Proveedor', 'text', true), field('model', 'Modelo o producto exacto', 'text', true),
    field('systemType', 'Tipo de sistema', 'select', true, ['GENERATIVE', 'ML', 'NEURAL']),
    field('purpose', 'Finalidad', 'textarea', true), field('ownerId', 'Responsable', 'person', true),
    field('dataClasses', 'Datos previstos', 'classes', true), field('region', 'Países o regiones de tratamiento'),
    field('retention', 'Retención y eliminación', 'textarea'), field('training', 'Uso para entrenamiento', 'textarea'),
    field('subprocessors', 'Subencargados', 'textarea'), field('evidenceRef', 'Referencia privada del contrato y evaluación del proveedor', 'textarea')
  ] },
  risks: { label: 'Riesgos', model: 'aiGovernanceRisk', statuses: ['OPEN', 'MITIGATED'], fields: [
    field('description', 'Escenario y consecuencias', 'textarea', true), field('ownerId', 'Responsable', 'person', true),
    field('probability', 'Probabilidad inicial (1–5)', 'number', true), field('impact', 'Impacto inicial (1–5)', 'number', true),
    field('controls', 'Controles y plan de tratamiento', 'textarea', true), field('residualProbability', 'Probabilidad residual (1–5)', 'number'),
    field('residualImpact', 'Impacto residual (1–5)', 'number'), field('evidenceRef', 'Referencia privada de las pruebas de controles', 'textarea')
  ] },
  authorizations: { label: 'Autorizaciones', model: 'aiGovernanceAuthorization', statuses: ['DRAFT', 'APPROVED', 'REVOKED'], fields: [
    field('contractRef', 'Referencia del contrato', 'text', true), field('useCase', 'Caso de uso', 'text', true),
    field('dataClasses', 'Categorías autorizadas', 'classes', true), field('ownerId', 'Responsable interno', 'person', true),
    field('recipientEmail', 'Correo contractual de la empresa', 'email', true),
    field('noticeAt', 'Aviso enviado (Bogotá)', 'datetime'), field('noticeEvidenceRef', 'Referencia del correo de aviso', 'textarea'),
    field('approvedAt', 'Autorización escrita recibida (Bogotá)', 'datetime'), field('approverName', 'Nombre y cargo de quien autoriza por la empresa'),
    field('startsAt', 'Inicio permitido (Bogotá)', 'datetime', true), field('expiresAt', 'Fin de vigencia (Bogotá)', 'datetime', true),
    field('evidenceRef', 'Referencia privada de la autorización escrita', 'textarea')
  ] },
  incidents: { label: 'Incidentes', model: 'aiGovernanceIncident', statuses: ['OPEN', 'CONTAINED', 'RECOVERED', 'CLOSED'], fields: [
    field('description', 'Qué ocurrió y qué información afecta', 'textarea', true), field('ownerId', 'Responsable', 'person', true),
    field('severity', 'Severidad', 'select', true, ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    field('occurredAt', 'Ocurrencia, si se conoce (Bogotá)', 'datetime'), field('detectedAt', 'Conocimiento del incidente (Bogotá)', 'datetime', true),
    field('impact', 'Impacto en confidencialidad, integridad y disponibilidad', 'textarea', true),
    field('recipientEmail', 'Correo contractual de la empresa', 'email', true),
    field('notifiedAt', 'Aviso enviado (Bogotá)', 'datetime'), field('notificationEvidence', 'Referencia del correo enviado', 'textarea'),
    field('containment', 'Acciones de contención', 'textarea'), field('recovery', 'Recuperación y validación', 'textarea'),
    field('rootCause', 'Causa raíz', 'textarea'), field('remediation', 'Plan de remediación, responsables y fechas', 'textarea'),
    field('finalReportEvidence', 'Referencia del informe posterior enviado', 'textarea'), field('lessons', 'Aprendizaje y prevención', 'textarea')
  ] }
};
export const STATUS_LABELS = { DRAFT: 'Borrador', APPROVED: 'Aprobado', SUSPENDED: 'Suspendido', OPEN: 'Abierto', MITIGATED: 'Mitigado', REVOKED: 'Revocado', CONTAINED: 'Contenido', RECOVERED: 'Recuperado', CLOSED: 'Cerrado' };
export const governanceError = (message, status = 400, code = 'GOVERNANCE_INVALID') => Object.assign(new Error(message), { status, code });
export function parseGovernanceDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return new Date(value);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) throw governanceError('Fecha no válida. Usa fecha y hora de Bogotá.');
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59) throw governanceError('Hora imposible.');
  const calendar = new Date(Date.UTC(y, m - 1, d));
  if (calendar.getUTCFullYear() !== y || calendar.getUTCMonth() !== m - 1 || calendar.getUTCDate() !== d) throw governanceError('Fecha imposible.');
  const result = new Date(value.length === 16 ? `${value}:00-05:00` : value);
  if (!Number.isFinite(result.getTime()) || (value.length !== 16 && !/(Z|[+-]\d{2}:\d{2})$/.test(value))) throw governanceError('Fecha sin zona horaria válida.');
  return result;
}
export function addNoticeMonth(value) {
  const local = new Date(parseGovernanceDate(value).getTime() - 5 * 3600000);
  const day = local.getUTCDate(); local.setUTCDate(1); local.setUTCMonth(local.getUTCMonth() + 1);
  const last = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
  local.setUTCDate(Math.min(day, last));
  return new Date(local.getTime() + 5 * 3600000);
}
export function incidentDeadline(data) {
  const detected = parseGovernanceDate(data.detectedAt);
  return new Date(Math.min(+detected, data.occurredAt ? +parseGovernanceDate(data.occurredAt) : +detected) + 24 * 3600000);
}
export function riskScore({ probability, impact }) {
  for (const n of [probability, impact]) if (!['string', 'number'].includes(typeof n) || !Number.isInteger(Number(n)) || Number(n) < 1 || Number(n) > 5) throw governanceError('Probabilidad e impacto deben ser enteros de 1 a 5.');
  return Number(probability) * Number(impact);
}
const need = (data, keys) => { for (const key of keys) if (!data[key] || (Array.isArray(data[key]) && !data[key].length)) {
  const label = Object.values(GOVERNANCE_FORMS).flatMap(f => f.fields).find(f => f.key === key)?.label || key;
  throw governanceError(`Completa ${label}: falta información o evidencia.`);
} };
export function validateRecord(kind, input, { now = new Date() } = {}) {
  if (!Object.hasOwn(GOVERNANCE_FORMS, kind)) throw governanceError('Registro desconocido.');
  const form = GOVERNANCE_FORMS[kind];
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 180) throw governanceError('Indica un nombre de hasta 180 caracteres.');
  const status = input.status || form.statuses[0];
  if (!form.statuses.includes(status)) throw governanceError('Estado no válido.');
  const data = {};
  if (!input.data || typeof input.data !== 'object' || Array.isArray(input.data)) throw governanceError('Datos no válidos.');
  const allowed = new Set(form.fields.map(f => f.key));
  for (const key of Object.keys(input.data)) if (!allowed.has(key)) throw governanceError(`Campo no permitido: ${key}`);
  for (const f of form.fields) {
    const value = input.data[f.key];
    if (value == null || value === '') { if (f.required) throw governanceError(`Completa ${f.label}.`); continue; }
    if (f.type === 'classes') {
      if (!Array.isArray(value) || !value.length || value.some(v => !DATA_CLASSES.includes(v))) throw governanceError('Categorías de datos inválidas.');
      data[f.key] = [...new Set(value)]; continue;
    }
    if (f.type === 'number') { riskScore({ probability: value, impact: 1 }); data[f.key] = Number(value); continue; }
    if (typeof value !== 'string' || !value.trim() || value.length > 6000) throw governanceError(`Valor inválido: ${f.label}.`);
    data[f.key] = value.trim();
    if (f.type === 'datetime') data[f.key] = parseGovernanceDate(value).toISOString();
    if (f.options && !f.options.includes(value)) throw governanceError(`Opción inválida: ${f.label}.`);
    if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw governanceError('Correo no válido.');
  }
  if (kind === 'systems' && status === 'APPROVED') need(data, ['region', 'retention', 'training', 'subprocessors', 'evidenceRef']);
  if (kind === 'risks' && status === 'MITIGATED') need(data, ['residualProbability', 'residualImpact', 'evidenceRef']);
  if (kind === 'authorizations') {
    if (+parseGovernanceDate(data.startsAt) >= +parseGovernanceDate(data.expiresAt)) throw governanceError('El vencimiento debe ser posterior al inicio.');
    if (status === 'APPROVED') {
      need(data, ['noticeAt', 'approvedAt', 'approverName', 'evidenceRef', 'noticeEvidenceRef']);
      if (+parseGovernanceDate(data.noticeAt) > +now || +parseGovernanceDate(data.approvedAt) > +now) throw governanceError('No registres como recibida o enviada una comunicación futura.');
      if (+parseGovernanceDate(data.approvedAt) > +parseGovernanceDate(data.startsAt) || +addNoticeMonth(data.noticeAt) > +parseGovernanceDate(data.startsAt)) throw governanceError('Se requiere autorización previa y un mes calendario de aviso antes del inicio.');
    }
  }
  if (kind === 'incidents') {
    if (+parseGovernanceDate(data.detectedAt) > +now || (data.occurredAt && +parseGovernanceDate(data.occurredAt) > +parseGovernanceDate(data.detectedAt))) throw governanceError('Revisa las fechas de ocurrencia y conocimiento.');
    if (data.notifiedAt) {
      need(data, ['notificationEvidence']);
      if (+parseGovernanceDate(data.notifiedAt) > +now || +parseGovernanceDate(data.notifiedAt) < +parseGovernanceDate(data.detectedAt)) throw governanceError('La notificación debe ser posterior al conocimiento y no futura.');
    }
    if (status !== 'OPEN') need(data, ['containment']);
    if (['RECOVERED', 'CLOSED'].includes(status)) need(data, ['recovery']);
    if (status === 'CLOSED') need(data, ['notifiedAt', 'notificationEvidence', 'rootCause', 'remediation', 'finalReportEvidence', 'lessons']);
  }
  return { name: input.name.trim(), status, data };
}
export function authorizationDecision({ authorization: a, system: s, risk: r, context: c, now = new Date() }) {
  const denied = reason => ({ allowed: false, reason });
  if (!a || a.status !== 'APPROVED') return denied('Falta autorización escrita aprobada.');
  if (!s || s.status !== 'APPROVED' || a.data.systemVersion !== s.version) return denied('Sistema sin aprobación vigente o con una versión diferente.');
  if (!r || r.status !== 'MITIGATED' || a.data.riskVersion !== r.version || r.systemId !== s.id || r.clientId !== a.clientId) return denied('La evaluación de riesgos no está vigente para este alcance.');
  if (a.systemId !== s.id || a.riskId !== r.id || a.clientId !== c.clientId || a.data.useCase !== c.useCase || s.data.provider !== c.provider || s.data.model !== c.model) return denied('La autorización no cubre cliente, modelo o finalidad.');
  if (!c.dataClasses?.length || c.dataClasses.some(d => !a.data.dataClasses?.includes(d))) return denied('Datos fuera del alcance autorizado.');
  try {
    if (riskScore({ probability: r.data.residualProbability, impact: r.data.residualImpact }) > 4) return denied('Riesgo residual superior al umbral de esta primera versión (4/25).');
    if (!a.data.evidenceRef || !a.data.noticeEvidenceRef || +parseGovernanceDate(a.data.approvedAt) > +now) return denied('Falta evidencia de autorización previa.');
    if (+parseGovernanceDate(a.data.approvedAt) > +parseGovernanceDate(a.data.startsAt) || +addNoticeMonth(a.data.noticeAt) > +parseGovernanceDate(a.data.startsAt)) return denied('No se cumple el mes calendario de aviso.');
    if (+now < +parseGovernanceDate(a.data.startsAt) || +now >= +parseGovernanceDate(a.data.expiresAt)) return denied('Autorización fuera de vigencia.');
  } catch { return denied('Fechas o evaluación incompletas.'); }
  return { allowed: true, reason: 'Alcance y evidencia vigentes.', authorizationId: a.id };
}
