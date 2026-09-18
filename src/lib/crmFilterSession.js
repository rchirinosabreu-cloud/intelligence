export const CRM_FILTERS_KEY = 'brainstudio:crm-filters:v1';

const KEYS = ['search', 'stage', 'group', 'origin', 'priority', 'ownerId', 'trafficLight', 'bucket', 'from', 'to'];

export const defaultCrmFilters = () => Object.fromEntries(KEYS.map(key => [key, '']));

export function readCrmFilters(storage, user) {
  const initial = defaultCrmFilters();
  if (!user?.id || !storage) return initial;
  try {
    const saved = JSON.parse(storage.getItem(CRM_FILTERS_KEY) || 'null');
    if (saved?.userId !== user.id || !saved.filters) return initial;
    for (const key of KEYS) {
      if (typeof saved.filters[key] === 'string') initial[key] = saved.filters[key];
    }
    return initial;
  } catch {
    return initial;
  }
}

export function writeCrmFilters(storage, user, filters) {
  if (!user?.id || !storage) return;
  try {
    const clean = Object.fromEntries(KEYS.map(key => [key, typeof filters?.[key] === 'string' ? filters[key] : '']));
    storage.setItem(CRM_FILTERS_KEY, JSON.stringify({ userId: user.id, filters: clean }));
  } catch {
    // Filters simply stay in memory when storage is blocked.
  }
}

/** Query-string params for the API: only the filters that carry a value. */
export const activeCrmFilters = (filters = {}) => Object.fromEntries(
  Object.entries(filters).filter(([key, value]) => KEYS.includes(key) && typeof value === 'string' && value.trim() !== '')
);
