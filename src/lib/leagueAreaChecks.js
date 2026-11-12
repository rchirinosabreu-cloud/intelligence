// Hábitos por área (Rodny, 12 de noviembre de 2026: «Sí, hábitos por área»). Los hábitos se jugaban casi solo con
// tareas de Gestión: quien vive en el tablero podía sumar 30 puntos al día y quien trabaja en Parrillas, el CRM,
// Pautas o Financiero rara vez pasaba de 15. Los nombres y los puntos no cambian; cambia de dónde sale la evidencia.
//
// Regla pura: el servicio lee la fuente de cada área y cada fuente da un chequeo `{ source, ok, text }` o `null` si la
// persona no tiene nada ahí. Un hábito se juega si se jugó con tareas o con alguna fuente, y se gana solo si todo lo
// jugado salió bien: más fuentes dan más oportunidades de jugarlo, nunca un atajo para ganarlo.
import { followUpBucket, isActionableStage } from './crmRules.js';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const filled = (value) => Boolean(String(value ?? '').trim());

/**
 * Contexto real (Rodny, 12 de noviembre de 2026: «algunos para documentar ponen solo un puntico … al menos un
 * comentario de 20 caracteres»): veinte letras o números, sin contar espacios, puntuación, emojis ni etiquetas. Un
 * enlace es contexto aunque sea corto: lleva al brief, al Drive o a la referencia.
 */
export const MIN_CONTEXT_CHARS = 20;
const LINK = /(https?:\/\/|www\.)\S+/i;
export function hasRealContext(value) {
  const text = String(value ?? '').replace(/<[^>]*>/g, ' ');
  if (LINK.test(text)) return true;
  return (text.match(/[\p{L}\p{N}]/gu) || []).length >= MIN_CONTEXT_CHARS;
}
const listOf = (names) => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;

/** Al día · Parrillas: las cuentas que la persona lleva como community o project manager, con sus piezas atrasadas. */
export function plansOverdueCheck(accounts = []) {
  if (!accounts.length) return null;
  const late = accounts.filter((account) => Number(account.overdue) > 0);
  if (!late.length) return { source: 'Parrillas', ok: true, text: `Sin piezas atrasadas en ${accounts.length === 1 ? 'su cuenta' : `sus ${accounts.length} cuentas`}.` };
  const pieces = late.reduce((sum, account) => sum + Number(account.overdue), 0);
  return { source: 'Parrillas', ok: false, text: `${plural(pieces, 'pieza', 'piezas')} con fecha pasada sin publicar: ${listOf(late.map((account) => account.clientName))}.` };
}

/** Al día · CRM: las oportunidades abiertas que la persona lleva, con su seguimiento vencido. Cerradas o archivadas no juegan. */
export function crmFollowUpCheck(leads = [], now = new Date()) {
  const open = leads.filter((lead) => !lead.archivedAt && isActionableStage(lead.stage));
  if (!open.length) return null;
  const overdue = open.filter((lead) => followUpBucket(lead, now) === 'VENCIDO').length;
  return { source: 'CRM', ok: overdue === 0, text: overdue ? `${plural(overdue, 'seguimiento vencido', 'seguimientos vencidos')}.` : 'Sin seguimientos vencidos.' };
}

/** Al día · Pautas: las pautas activas que la persona lleva; lo único vencido es un ciclo cerrado sin su gasto final. */
export function adBudgetsCheck(budgets = []) {
  if (!budgets.length) return null;
  const pending = budgets.filter((budget) => budget.pendingClose).length;
  return pending
    ? { source: 'Pautas', ok: false, text: `Falta el gasto final de ${plural(pending, 'pauta', 'pautas')}.` }
    : { source: 'Pautas', ok: true, text: `Sin gasto final pendiente en ${budgets.length === 1 ? 'su pauta' : `sus ${budgets.length} pautas`}.` };
}

/** A tiempo · Parrillas: las piezas de hoy de sus cuentas, publicadas o ya programadas en Meta. */
const ON_TIME_STATUSES = new Set(['PUBLICADO', 'PROGRAMADO']);
export function piecesOnTimeCheck(pieces = []) {
  if (!pieces.length) return null;
  const done = pieces.filter((piece) => ON_TIME_STATUSES.has(piece.status)).length;
  return { source: 'Parrillas', ok: done === pieces.length, text: `${done} de ${plural(pieces.length, 'pieza de hoy publicada o programada', 'piezas de hoy publicadas o programadas')}.` };
}

/** Documentado · CRM: las gestiones con el cliente que registró ese día, con una nota o un resultado de contexto real. */
export function crmNotesCheck(activities = []) {
  if (!activities.length) return null;
  const documented = activities.filter((activity) => hasRealContext(activity.note) || hasRealContext(activity.result)).length;
  return { source: 'CRM', ok: documented === activities.length, text: `${documented} de ${plural(activities.length, 'gestión con nota', 'gestiones con nota')}.` };
}

/**
 * Documentado · Financiero: los movimientos y las cuentas por pagar que registró ese día, con soporte o con una nota
 * —el mismo «comentario o archivo» de las tareas: un 4x1000 no tiene factura, pero puede llevar su referencia—.
 */
export function financialSupportCheck(records = [], payables = []) {
  const items = [
    ...records.map((record) => record.hasDocument || filled(record.notes) || filled(record.reference)),
    ...payables.map((payable) => payable.hasDocument || filled(payable.notes) || filled(payable.documentNumber))
  ];
  if (!items.length) return null;
  const documented = items.filter(Boolean).length;
  return { source: 'Financiero', ok: documented === items.length, text: `${documented} de ${plural(items.length, 'registro con soporte o nota', 'registros con soporte o nota')}.` };
}

/**
 * Suma los chequeos de área a los hábitos que ya dio el día. El hábito queda jugado si se jugó con tareas o con alguna
 * fuente, y ganado solo si todo lo jugado salió bien. La evidencia nombra cada fuente; lo de tareas solo se repite si se jugó.
 */
export function mergeAreaChecks(habits, evidence, checksByHabit = {}) {
  for (const [key, list] of Object.entries(checksByHabit)) {
    const checks = (list || []).filter(Boolean);
    if (!checks.length) continue;
    const playedWithTasks = habits[key] === true || habits[key] === false;
    const parts = playedWithTasks ? [`Tareas: ${evidence[key]}`] : [];
    let ok = playedWithTasks ? habits[key] === true : true;
    for (const check of checks) {
      ok = ok && check.ok === true;
      parts.push(`${check.source}: ${check.text}`);
    }
    habits[key] = ok;
    evidence[key] = parts.join(' · ');
  }
  return { habits, evidence };
}
