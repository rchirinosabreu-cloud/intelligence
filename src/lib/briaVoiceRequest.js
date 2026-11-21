import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// La voz de Bria desde el navegador: si hay voz para esta persona y el audio de un texto que Bria ya respondió.
const headers = (extra = {}) => { const token = globalThis.localStorage?.getItem('authToken'); return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }; };
const base = () => (import.meta.env ? getApiBaseUrl() : '');

export const requestVoiceStatus = async () => {
  const response = await fetch(`${base()}/api/bria/voice`, { credentials: 'same-origin', headers: headers() });
  return response.ok ? response.json() : { enabled: false };
};

export const requestVoiceAudio = async (text, { signal } = {}) => {
  const response = await fetch(`${base()}/api/bria/voice/speak`, { method: 'POST', credentials: 'same-origin', signal, headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ text }) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw Object.assign(new Error(data.message || 'No se pudo generar la voz.'), { code: data.code, status: response.status }); }
  return response.blob();
};
