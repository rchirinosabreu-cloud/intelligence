import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// Marcas: lecturas y escrituras contra `/api/brands`. Lo que cambia en pantalla espera la respuesta del servidor.

const KEY = ['brands'];

async function request(path, options = {}) {
    const isForm = options.body instanceof FormData;
    const response = await fetch(`${getApiBaseUrl()}/api/brands${path}`, {
        ...options,
        headers: isForm ? (options.headers || {}) : { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        console.error('[Brands] El servidor rechazó la petición:', body);
        throw Object.assign(new Error(body.error || 'No se pudo completar la operación. Inténtalo de nuevo.'), { status: response.status });
    }
    return body;
}

export const brandFileUrl = (clientId, fileId, { download = false, thumb = false } = {}) =>
    `${getApiBaseUrl()}/api/brands/${encodeURIComponent(clientId)}/files/${encodeURIComponent(fileId)}${download ? '?download=1' : thumb ? '?thumb=1' : ''}`;

export function useBrands({ enabled = true } = {}) {
    return useQuery({ queryKey: [...KEY, 'list'], queryFn: () => request(''), enabled, staleTime: 30_000 });
}

export function useBrand(clientId) {
    return useQuery({ queryKey: [...KEY, 'detail', clientId], queryFn: () => request(`/${encodeURIComponent(clientId)}`), enabled: Boolean(clientId), staleTime: 15_000 });
}

function useBrandMutation(mutationFn) {
    const queryClient = useQueryClient();
    return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }) });
}

export const useSaveBrand = () => useBrandMutation(({ clientId, input }) =>
    request(`/${encodeURIComponent(clientId)}`, { method: 'PUT', body: JSON.stringify(input) }));

export const useUploadBrandFile = () => useBrandMutation(({ clientId, kind, label, file }) => {
    const form = new FormData();
    form.append('kind', kind);
    if (label) form.append('label', label);
    form.append('file', file);
    return request(`/${encodeURIComponent(clientId)}/files`, { method: 'POST', body: form });
});

export const useRemoveBrandFile = () => useBrandMutation(({ clientId, fileId }) =>
    request(`/${encodeURIComponent(clientId)}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }));

/** Una tipografía de Google de la ficha, en .zip con sus archivos .ttf. */
export function brandFontUrl(clientId, family) {
    return `${getApiBaseUrl()}/api/brands/${encodeURIComponent(clientId)}/fonts/download?family=${encodeURIComponent(family)}`;
}
