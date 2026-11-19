import React from 'react';
import { acquirePrivateMedia } from '@/lib/privateMediaCache';
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

// Los archivos de marca piden sesión, y una etiqueta <img> o un enlace <a> no la llevan (en producción cada
// logo respondía «No token provided»). Se piden con el `fetch` de la plataforma, que sí la lleva, y se guardan
// como URL local mientras la pestaña esté abierta: volver a abrir una ficha no vuelve a bajar nada.
// Comparte la caché de archivos privados de la plataforma (`privateMediaCache`): mientras la pestaña esté
// abierta un logo o un manual no se vuelve a bajar, y cerrar sesión lo suelta.
export function loadBrandObjectUrl(url) {
    return acquirePrivateMedia(url).then(({ url: objectUrl, release }) => { release(); return objectUrl; });
}

/** Una imagen privada de la marca, lista para un <img>. `null` mientras carga o si falla. */
export function useBrandImage(url) {
    const [src, setSrc] = React.useState(null);
    React.useEffect(() => {
        let active = true;
        if (!url) return undefined;
        loadBrandObjectUrl(url).then((value) => active && setSrc(value)).catch(() => active && setSrc(null));
        return () => { active = false; };
    }, [url]);
    return src;
}

/** Descarga con sesión y con el nombre que manda el servidor (o el que se pase). */
export async function downloadBrandFile(url, fallbackName = 'archivo') {
    const response = await fetch(url);
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo descargar el archivo.');
    }
    const disposition = response.headers.get('Content-Disposition') || '';
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const name = encoded ? decodeURIComponent(encoded) : fallbackName;
    const href = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = href;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
