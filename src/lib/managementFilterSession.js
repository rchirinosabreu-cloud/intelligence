export const MANAGEMENT_FILTERS_KEY = 'brainstudio:management-filters:v1';
const periods = new Set(['Hoy + Vencidos', 'Solo Vencidos', 'Esta Semana', 'Todos']);
const textOr = (value, fallback) => typeof value === 'string' && value.trim() ? value : fallback;

const defaults = user => ({
    dateFilter: 'Hoy + Vencidos',
    responsibleFilter: user?.name || 'Todos',
    clientFilter: 'Todos',
    responsibleInitialized: false
});

export function readManagementFilters(storage, user) {
    const initial = defaults(user);
    if (!user?.id) return initial;
    try {
        const saved = JSON.parse(storage?.getItem(MANAGEMENT_FILTERS_KEY) || 'null');
        if (saved?.userId !== user.id || !saved.filters) return initial;
        const { filters } = saved;
        return {
            dateFilter: periods.has(filters.dateFilter) ? filters.dateFilter : initial.dateFilter,
            responsibleFilter: textOr(filters.responsibleFilter, initial.responsibleFilter),
            clientFilter: textOr(filters.clientFilter, initial.clientFilter),
            responsibleInitialized: filters.responsibleInitialized === true
        };
    } catch {
        return initial;
    }
}

export function writeManagementFilters(storage, user, filters) {
    if (!user?.id) return;
    try {
        storage?.setItem(MANAGEMENT_FILTERS_KEY, JSON.stringify({ userId: user.id, filters }));
    } catch {
        // The board still keeps its current in-memory choices if storage is blocked.
    }
}

export function clearManagementFilters(storage) {
    try { storage?.removeItem(MANAGEMENT_FILTERS_KEY); } catch { /* Storage may be disabled. */ }
}
