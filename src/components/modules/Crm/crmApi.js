import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { activeCrmFilters } from '@/lib/crmFilterSession';

const authHeaders = () => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** Every CRM request goes through here so errors carry the server message. */
export async function crmRequest(path, { method = 'GET', body, params } = {}) {
  const query = params ? new URLSearchParams(activeCrmFilters(params)).toString() : '';
  const url = `${getApiBaseUrl()}/api/crm${path}${query ? `?${query}` : ''}`;
  const response = await fetch(url, {
    method,
    cache: 'no-store',
    headers: { ...authHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'No pudimos completar la operación.');
  return payload;
}

export const crmKeys = {
  all: ['crm'],
  catalogs: ['crm', 'catalogs'],
  team: ['crm', 'team'],
  leads: filters => ['crm', 'leads', activeCrmFilters(filters)],
  lead: id => ['crm', 'lead', id],
  followUps: filters => ['crm', 'followups', activeCrmFilters(filters)],
  metrics: filters => ['crm', 'metrics', activeCrmFilters(filters)]
};

export const useCrmCatalogs = () => useQuery({ queryKey: crmKeys.catalogs, queryFn: () => crmRequest('/catalogs'), staleTime: Infinity });

export const useCrmTeam = () => useQuery({
  queryKey: crmKeys.team,
  queryFn: async () => {
    const response = await fetch(`${getApiBaseUrl()}/api/team`, { headers: authHeaders(), cache: 'no-store' });
    if (!response.ok) throw new Error('No pudimos cargar el equipo.');
    const members = await response.json();
    return (Array.isArray(members) ? members : []).filter(member => member.isActive !== false);
  },
  staleTime: 60_000
});

export const useCrmLeads = filters => useQuery({ queryKey: crmKeys.leads(filters), queryFn: () => crmRequest('/leads', { params: filters }) });
export const useCrmLead = id => useQuery({ queryKey: crmKeys.lead(id), queryFn: () => crmRequest(`/leads/${id}`), enabled: Boolean(id) });
export const useCrmFollowUps = filters => useQuery({ queryKey: crmKeys.followUps(filters), queryFn: () => crmRequest('/followups', { params: filters }) });
export const useCrmMetrics = filters => useQuery({ queryKey: crmKeys.metrics(filters), queryFn: () => crmRequest('/metrics', { params: filters }) });

const useCrmMutation = (mutationFn, options = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    ...options,
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.all });
      return options.onSuccess?.(...args);
    }
  });
};

export const useCreateLead = options => useCrmMutation(payload => crmRequest('/leads', { method: 'POST', body: payload }), options);
export const useUpdateLead = options => useCrmMutation(({ id, ...payload }) => crmRequest(`/leads/${id}`, { method: 'PATCH', body: payload }), options);
export const useChangeStage = options => useCrmMutation(({ id, ...payload }) => crmRequest(`/leads/${id}/stage`, { method: 'POST', body: payload }), options);
export const useAddActivity = options => useCrmMutation(({ id, ...payload }) => crmRequest(`/leads/${id}/activities`, { method: 'POST', body: payload }), options);
export const useSetTrafficLight = options => useCrmMutation(({ id, ...payload }) => crmRequest(`/leads/${id}/traffic-light`, { method: 'POST', body: payload }), options);
export const useArchiveLead = options => useCrmMutation(({ id }) => crmRequest(`/leads/${id}/archive`, { method: 'POST' }), options);
