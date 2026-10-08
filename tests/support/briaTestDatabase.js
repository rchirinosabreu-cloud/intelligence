// Same dedicated local test cluster used by the team's PostgreSQL integration suites.
// No .env loading or fallback to DATABASE_URL is permitted.
export const briaTestDatabaseUrl = (environment = process.env) => {
  if (!environment.TEST_DATABASE_URL) return null;
  const target = new URL(environment.TEST_DATABASE_URL);
  if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '55448' || target.pathname !== '/recognition_test' || target.username !== 'recognition_test') throw new Error('Use only the isolated local test database for Bria tests.');
  return environment.TEST_DATABASE_URL;
};
