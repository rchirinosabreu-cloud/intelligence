export const loggerMiddleware = (req, res, next) => {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const method = req.method;
  const url = req.originalUrl;

  console.log(`[${new Date().toISOString()}] ${method} ${url} (Proto: ${proto}, Secure: ${req.secure})`);

  // Log POST-to-GET transformations on Login route (Railway redirect issue)
  if (method === 'GET' && url.includes('/api/login')) {
    console.warn(`[CRITICAL AUDIT] Received GET on Login route! Possible POST-to-GET transformation due to HTTP->HTTPS redirect.`);
    console.warn(`[DEBUG HEADERS] ${JSON.stringify(req.headers)}`);
  }

  next();
};
