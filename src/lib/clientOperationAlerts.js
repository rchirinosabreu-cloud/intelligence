import { MONTH_NAMES, OPERATION_LEVELS } from './clientOperations.js';

const PRIORITY = [
  'CURRENT_OVERDUE', 'PREVIOUS_SHORTFALL', 'NO_PLAN', 'PUBLISHING_BEHIND',
  'TASKS_OVERDUE', 'REPORT_PENDING', 'MISSING_PIECES', 'PLANNED_GAP', 'PLANNED_SAME_DAY',
];
const rank = (list, value) => { const index = list.indexOf(value); return index < 0 ? list.length : index; };
const exactKey = (reason) => JSON.stringify(reason, (_key, value) => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]))
    : value
));

/** Orden de presentación: conserva la evaluación y los motivos antiguos sin interpretar su prosa. */
export function deriveClientAlerts(evaluation) {
  const alerts = { primary: [], contract: [] };
  const seen = new Set();
  for (const reason of evaluation?.reasons || []) {
    const key = exactKey(reason);
    if (seen.has(key)) continue;
    seen.add(key);
    alerts[reason.category === 'contract' ? 'contract' : 'primary'].push(reason);
  }
  const compare = (a, b) => rank(OPERATION_LEVELS, a.level) - rank(OPERATION_LEVELS, b.level)
    || rank(PRIORITY, a.code) - rank(PRIORITY, b.code);
  alerts.primary.sort(compare);
  alerts.contract.sort(compare);
  return alerts;
}

/** Abre la parrilla del ciclo señalado; un aviso histórico nunca cae en el mes actual. */
export function clientOperationPlanPath(client, cycle = client?.cycles?.current) {
  const { year, month } = cycle || {};
  if (!Number.isInteger(year) || year < 1 || !Number.isInteger(month) || month < 1 || month > 12) return '/parrillas';
  const pieces = Array.isArray(cycle.pieces) ? cycle.pieces : [];
  const fromSheet = cycle.source?.kind === 'HOJA_MIO' || Boolean(client?.externalPlanUrl) || pieces.some((piece) => piece.external);
  if (!fromSheet && pieces.length && pieces.every((piece) => typeof piece.planId === 'string' && piece.planId.trim())) {
    const planIds = new Set(pieces.map((piece) => piece.planId));
    if (planIds.size === 1) return `/parrillas/${encodeURIComponent(pieces[0].planId)}`;
  }
  // Un ciclo vacío no acredita que exista una parrilla; el directorio permite encontrarla o crearla.
  if (!fromSheet && cycle.created === 0) return '/parrillas';
  if (!client?.slug) return '/parrillas';
  const period = `${MONTH_NAMES[month - 1].toLowerCase()}-${year}`;
  return `/parrillas/${fromSheet ? 'hoja/' : ''}${encodeURIComponent(client.slug)}/${period}`;
}
