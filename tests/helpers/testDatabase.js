export const getSafeTestDatabaseUrl = (env = process.env) => {
  const candidate = String(env.TEST_DATABASE_URL || '').trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) return null;
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    const databaseName = url.pathname.replace(/^\//, '').toLowerCase();
    if (!isLocal && !/(^|[_-])test($|[_-])/.test(databaseName)) return null;
    return candidate;
  } catch {
    return null;
  }
};
