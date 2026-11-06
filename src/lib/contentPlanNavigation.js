import { getContentPlanMonthName } from './contentPlanPeriod.js';

const clientIdOf = plan => plan?.clientId || plan?.client?.id;
const periodLabel = plan => {
  const month = getContentPlanMonthName(plan?.month);
  return month && Number.isInteger(Number(plan?.year)) && Number(plan.year) > 0
    ? `${month[0].toUpperCase()}${month.slice(1)} ${plan.year}` : null;
};
const byRecentPeriod = (a, b) => Number(b.year) - Number(a.year) || Number(b.month) - Number(a.month);
const nativePath = plan => plan.client?.slug
  ? `/parrillas/${encodeURIComponent(plan.client.slug)}/${getContentPlanMonthName(plan.month)}-${plan.year}`
  : `/parrillas/${encodeURIComponent(plan.id)}`;
const sheetPath = plan => `/parrillas/hoja/${encodeURIComponent(plan.client.slug)}/${getContentPlanMonthName(plan.month)}-${plan.year}`;
const optionsOf = (plans, path) => [...new Map(plans.filter(periodLabel).sort(byRecentPeriod)
  .map(plan => [path(plan), { value: path(plan), label: periodLabel(plan) }])).values()];

export const planPeriodOptions = (currentPlan, plans = []) => {
  if (!currentPlan?.id || !clientIdOf(currentPlan)) return [];
  return optionsOf([currentPlan, ...(Array.isArray(plans) ? plans : []).filter(plan => plan?.id && clientIdOf(plan) === clientIdOf(currentPlan))], nativePath);
};

export const externalPeriodOptions = (currentPlan, groups = []) => {
  if (!currentPlan?.client?.slug || !clientIdOf(currentPlan)) return [];
  const group = (Array.isArray(groups) ? groups : []).find(row => clientIdOf(row) === clientIdOf(currentPlan));
  const readMonths = (group?.months || []).filter(month => month.tabName && month.readAt)
    .map(month => ({ ...month, client: currentPlan.client }));
  return optionsOf([currentPlan, ...readMonths], sheetPath);
};

// Elegir otro período conserva la vista y la procedencia, pero una pieza pertenece a una sola parrilla.
export const periodDestination = (pathname, search = '') => {
  const params = new URLSearchParams(search);
  params.delete('item');
  params.delete('itemId');
  return { pathname, search: params.toString() };
};
