const normalizeBaseUrl = (url) => String(url || '').replace(/\/$/, '');

export function getApiBaseUrl() {
  // Use the environment variable provided during build time (Vite)
  const configured = normalizeBaseUrl(import.meta.env.VITE_API_URL);

  // If configured via VITE_API_URL, use it.
  if (configured && !configured.includes('${')) {
    return configured;
  }

  // Fallback for local development or SSR-like environments
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
