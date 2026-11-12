import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// Pautas: lecturas y escrituras contra `/api/ad-budgets`. Lo que cambia en pantalla espera la respuesta del servidor.

const BOARD_KEY = ['ad-budgets'];

async function request(path, options = {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/ad-budgets${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[AdBudgets] El servidor rechazó la petición:', body);
    throw Object.assign(new Error(body.error || 'No se pudo completar la operación. Inténtalo de nuevo.'), { status: response.status });
  }
  return body;
}

export function useAdBudgets({ clientId = null, includeFinished = false, enabled = true } = {}) {
  const query = new URLSearchParams();
  if (clientId) query.set('clientId', clientId);
  if (includeFinished) query.set('terminadas', '1');
  const suffix = query.toString() ? `?${query}` : '';
  return useQuery({ queryKey: [...BOARD_KEY, 'list', clientId, includeFinished], queryFn: () => request(suffix), enabled, staleTime: 15_000 });
}

export function useAdBudgetDetail(id) {
  return useQuery({ queryKey: [...BOARD_KEY, 'detail', id], queryFn: () => request(`/${encodeURIComponent(id)}`), enabled: Boolean(id), staleTime: 10_000 });
}

export function useAdBudgetOptions({ enabled = true } = {}) {
  return useQuery({ queryKey: [...BOARD_KEY, 'options'], queryFn: () => request('/options'), enabled, staleTime: 60_000 });
}

function useBoardMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: BOARD_KEY }) });
}

export const useSaveAdBudget = () => useBoardMutation(({ id, input }) => (id
  ? request(`/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
  : request('', { method: 'POST', body: JSON.stringify(input) })));

export const useRecordAdSpend = () => useBoardMutation(({ id, input }) => request(`/${id}/spend`, { method: 'POST', body: JSON.stringify(input) }));

export const useAdjustAdCarryOver = () => useBoardMutation(({ id, input }) => request(`/${id}/carry-over`, { method: 'PUT', body: JSON.stringify(input) }));

export const useClearAdCarryOver = () => useBoardMutation(({ id, cycleKey }) => request(`/${id}/carry-over?cycleKey=${encodeURIComponent(cycleKey)}`, { method: 'DELETE' }));

export const useDeleteAdBudget = () => useBoardMutation(({ id }) => request(`/${id}`, { method: 'DELETE' }));

export const useUpdateAdReading = () => useBoardMutation(({ id, readingId, input }) => request(`/${id}/readings/${readingId}`, { method: 'PATCH', body: JSON.stringify(input) }));

export const useDeleteAdReading = () => useBoardMutation(({ id, readingId }) => request(`/${id}/readings/${readingId}`, { method: 'DELETE' }));

export const useUpdateAdCycle = () => useBoardMutation(({ id, cycleKey, input }) => request(`/${id}/cycles/${cycleKey}`, { method: 'PATCH', body: JSON.stringify(input) }));

export const useReopenAdCycle = () => useBoardMutation(({ id, cycleKey }) => request(`/${id}/cycles/${cycleKey}/reopen`, { method: 'POST' }));

export const useDeleteAdCampaign = () => useBoardMutation(({ budgetId, campaignId }) => request(`/${budgetId}/campaigns/${campaignId}`, { method: 'DELETE' }));

// Meta: lo que la plataforma lee de las cuentas publicitarias. Ligar o descartar espera la respuesta del servidor.
export function useAdMeta({ enabled = true } = {}) {
  return useQuery({ queryKey: [...BOARD_KEY, 'meta'], queryFn: () => request('/meta'), enabled, staleTime: 30_000 });
}

export function useAdMetaSuggestions(id, { enabled = true } = {}) {
  return useQuery({ queryKey: [...BOARD_KEY, 'meta-suggestions', id], queryFn: () => request(`/${encodeURIComponent(id)}/meta-suggestions`), enabled: enabled && Boolean(id), staleTime: 30_000 });
}

export const useSyncAdMeta = () => useBoardMutation(() => request('/meta/sync', { method: 'POST' }));

export const useAssignAdMeta = () => useBoardMutation(({ id, campaignIds }) => request(`/${id}/meta-campaigns`, { method: 'PUT', body: JSON.stringify({ campaignIds }) }));

export const useIgnoreAdMeta = () => useBoardMutation(({ campaignId, ignored }) => request(`/meta/campaigns/${campaignId}/ignore`, { method: 'POST', body: JSON.stringify({ ignored }) }));

export const useSaveAdCampaign = () => useBoardMutation(({ budgetId, campaignId, input }) => (campaignId
  ? request(`/${budgetId}/campaigns/${campaignId}`, { method: 'PATCH', body: JSON.stringify(input) })
  : request(`/${budgetId}/campaigns`, { method: 'POST', body: JSON.stringify(input) })));
