const getResourceUrl = (resource) => {
  if (typeof resource === 'string' || resource instanceof URL) return String(resource);
  return resource?.url || '';
};

export const isTrustedApiRequest = (resource, apiBaseUrl, pageOrigin) => {
  try {
    const origin = String(pageOrigin || '');
    const apiUrl = new URL(String(apiBaseUrl || ''), origin);
    const requestUrl = new URL(getResourceUrl(resource), origin);
    return requestUrl.origin === apiUrl.origin
      && (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/'));
  } catch {
    return false;
  }
};
