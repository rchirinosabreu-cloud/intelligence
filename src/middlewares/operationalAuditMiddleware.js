import { recordOperationalTrace } from '../services/operationalTraceService.js';
import { describePlatformMutation } from '../lib/operationalMutationLabels.js';
export { describePlatformMutation } from '../lib/operationalMutationLabels.js';

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const alreadyCoveredByTaskTrace = (method, pathname) => (
  (method === 'POST' && pathname === '/api/tasks')
  || (method === 'PATCH' && /^\/api\/tasks\/[^/]+$/.test(pathname))
);

export const operationalAuditMiddleware = (req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  if (!mutationMethods.has(method)) return next();

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return;
    const pathname = String(req.originalUrl || req.url || '').split('?')[0];
    if (pathname === '/api/login') return;
    if (alreadyCoveredByTaskTrace(method, pathname)) return;
    const details = describePlatformMutation({ method, pathname });
    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)/);
    recordOperationalTrace({
      eventType: 'PLATFORM_MUTATION',
      actorId: req.user?.userId || req.user?.id || null,
      subjectUserId: req.user?.userId || req.user?.id || null,
      taskId: taskMatch?.[1] || null,
      metadata: {
        ...details,
        method,
        statusCode: res.statusCode,
        authenticated: Boolean(req.user)
      }
    }).catch((error) => console.error('[OperationalAudit] Trace failed:', error?.message || error));
  });

  next();
};
