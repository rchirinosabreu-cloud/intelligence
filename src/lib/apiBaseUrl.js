const normalizeBaseUrl = (url) => String(url || '').replace(/\/$/, '');

export function getApiBaseUrl() {
  // FINAL CLEANUP: Ensure strict plain text URL for production to avoid build-time hydration issues.
  const FINAL_PROD_URL = 'https://api.brainstudioagencia.com';

  const configured = normalizeBaseUrl(import.meta.env.VITE_API_URL);
  if (configured && !configured.includes('${')) return configured;

  // If we are in a production-like hostname, force the clean domain.
  if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
      return FINAL_PROD_URL;
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;

    // Dev frontend ports -> local backend default
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      if (port === '3000' || port === '3001' || port === '5173' || port === '4173') {
        return `${protocol}//${hostname}:8080`;
      }
    }

    // Same-origin fallback (useful when frontend and API share host)
    return `${protocol}//${window.location.host}`;
  }

  return 'http://localhost:8080';
}
