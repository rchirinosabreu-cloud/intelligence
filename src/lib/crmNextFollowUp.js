// El plan vive en la oportunidad. El aviso solo proyecta su acción y fecha vigentes.
export { bogotaDateKey } from './crmRules.js';
export const CRM_NOTICE_KINDS = ['CRM_FOLLOW_UP', 'CRM_REVIEW', 'CRM_NEXT_FOLLOW_UP'];
export function followUpDateKey(value) {
  const key = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key ? key : null;
}
export function nextFollowUpPlan(lead) {
  const date = followUpDateKey(lead?.nextFollowUpAt);
  const action = typeof lead?.nextAction === 'string' ? lead.nextAction.trim() : '';
  return date && action ? { date, action, dueAt: new Date(`${date}T08:00:00-05:00`) } : null;
}
export function plannedNoticeProjection(notice, lead) {
  const plan = nextFollowUpPlan(lead);
  if (!plan) return { ...notice, kind: 'CRM_REVIEW', label: 'Revisión de oportunidad',
    message: `${lead.company || lead.contactName || 'Esta oportunidad'}: revisa el próximo paso.`, snoozedUntil: notice.snoozedUntil || null };
  const dateLabel = plan.date.split('-').reverse().join('/');
  return { ...notice, label: `Próximo seguimiento · ${dateLabel}`, message: `${lead.company || lead.contactName || 'Oportunidad'}: ${plan.action}`,
    snoozedUntil: new Date(Math.max(plan.dueAt.getTime(), notice.snoozedUntil ? new Date(notice.snoozedUntil).getTime() : 0)) };
}
