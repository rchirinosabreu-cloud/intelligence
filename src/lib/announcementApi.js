import { getApiBaseUrl } from './apiBaseUrl';

export const openAnnouncementPreview = id => window.dispatchEvent(new CustomEvent('brain:announcement-preview', { detail: { id } }));
export async function announcementRequest(id, suffix, body) {
  const response = await fetch(`${getApiBaseUrl()}/api/dashboard/announcements/${encodeURIComponent(id)}/${suffix}`, {
    cache: 'no-store', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[Anuncios]', data);
    throw Object.assign(new Error(data.error || 'No pudimos consultar el anuncio.'), { status: response.status });
  }
  return data;
}
