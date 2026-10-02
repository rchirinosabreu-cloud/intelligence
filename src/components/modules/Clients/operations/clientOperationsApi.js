import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// Operación de clientes: lecturas y escrituras contra `/api/client-operations`. Los cambios se reflejan
// en pantalla solo después de que el servidor responde (regla de la verdad de AGENTS.md).

const BOARD_KEY = ['client-operations'];
const clientKey = (slug) => ['client-operations', slug];

async function request(path, options = {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/client-operations${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[ClientOperations] El servidor rechazó la petición:', body);
    throw Object.assign(new Error(body.error || 'No se pudo completar la operación. Inténtalo de nuevo.'), { status: response.status, errors: body.errors || null });
  }
  return body;
}

export function useClientOperations({ enabled = true } = {}) {
  return useQuery({ queryKey: BOARD_KEY, queryFn: () => request(''), enabled, staleTime: 30_000 });
}

export function useClientOperation(slug) {
  return useQuery({ queryKey: clientKey(slug), queryFn: () => request(`/${encodeURIComponent(slug)}`), enabled: Boolean(slug), staleTime: 15_000 });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: BOARD_KEY });
}

export function useSaveOperationProfile() {
  const refresh = useRefresh();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, input }) => request(`/${clientId}/profile`, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (saved) => {
      queryClient.setQueryData(clientKey(saved.slug), saved);
      refresh();
    },
  });
}

export function useSetMonthlyReport() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ clientId, year, month, delivered }) => request(`/${clientId}/reports/${year}/${month}`, { method: 'PUT', body: JSON.stringify({ delivered }) }),
    onSuccess: refresh,
  });
}

export function useMarkPiecePublished() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ clientId, itemId }) => request(`/${clientId}/pieces/${itemId}/published`, { method: 'POST' }),
    onSuccess: refresh,
  });
}
