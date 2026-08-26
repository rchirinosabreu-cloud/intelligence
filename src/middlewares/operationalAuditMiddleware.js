import { recordOperationalTrace } from '../services/operationalTraceService.js';

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const actionByMethod = {
  POST: 'creó o ejecutó',
  PUT: 'reemplazó',
  PATCH: 'actualizó',
  DELETE: 'eliminó'
};

const moduleFromPath = (pathname) => {
  const segment = pathname.replace(/^\/api\/?/, '').split('/')[0] || 'plataforma';
  const labels = {
    activity: 'Actividad', boards: 'Inspiración', clients: 'Clientes', content: 'Parrillas',
    dashboard: 'Dashboard', feedback: 'Feedback', financials: 'Financiero', integrations: 'Integraciones',
    notifications: 'Notificaciones', quotations: 'Cotizaciones', reports: 'Reportes', tasks: 'Gestión de tareas',
    team: 'Equipo', user: 'Perfil', users: 'Usuarios'
  };
  return labels[segment] || segment.replace(/-/g, ' ');
};

const resourceFromPath = (pathname) => {
  if (pathname.includes('/comments')) return 'un comentario';
  if (pathname.includes('/attachments') || pathname.includes('/files')) return 'un archivo';
  if (pathname.includes('/tasks')) return 'una tarea';
  if (pathname.includes('/activity')) return 'un evento';
  if (pathname.includes('/financials')) return 'un registro financiero';
  if (pathname.includes('/reports')) return 'un informe';
  if (pathname.includes('/content')) return 'una parrilla o pieza';
  if (pathname.includes('/clients')) return 'un registro de cliente';
  if (pathname.includes('/team') || pathname.includes('/users')) return 'un usuario o miembro del equipo';
  return 'un registro';
};

const normalizedPath = (pathname) => pathname
  .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
  .replace(/\/\d+(?=\/|$)/g, '/:id')
  .slice(0, 240);

export const describePlatformMutation = ({ method, pathname }) => ({
  action: actionByMethod[method] || 'modificó',
  module: moduleFromPath(pathname),
  resource: resourceFromPath(pathname),
  path: normalizedPath(pathname)
});

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
