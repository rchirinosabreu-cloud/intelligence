// Public vocabulary for audit records. API route names are not product modules.
const moduleLabels = {
  activity: 'Actividad', boards: 'Inspiración', clients: 'Clientes', content: 'Parrillas',
  dashboard: 'Dashboard', feedback: 'Feedback', financials: 'Financiero', integrations: 'Integraciones',
  notifications: 'Notificaciones', quotations: 'Cotizaciones', reports: 'Reportes', tasks: 'Gestión de tareas',
  team: 'Equipo', user: 'Perfil', users: 'Usuarios', fireflies: 'Minutas', minutes: 'Minutas',
  'report-pdf': 'Minutas', drive: 'Minutas', recognitions: 'Logros recientes',
};
const publicNames = new Map(Object.values(moduleLabels).map(name => [name.toLowerCase(), name]));
const moduleName = value => moduleLabels[value] || publicNames.get(String(value || '').toLowerCase()) || 'la plataforma';
const routePath = value => String(value || '').split('?')[0].replace(/\/+$/, '');
const moduleFromPath = pathname => moduleName(pathname.replace(/^\/api\/?/, '').split('/')[0]);
const actionByMethod = { POST: 'creó o ejecutó', PUT: 'reemplazó', PATCH: 'actualizó', DELETE: 'eliminó' };

const operationKind = (method, path) => {
  if (method !== 'POST') return null;
  if (path === '/api/recognitions/claim') return 'recognition-check';
  if (/^\/api\/recognitions\/[^/]+\/acknowledge$/.test(path)) return 'recognition-notice';
  if (path === '/api/fireflies/graphql') return 'minutes-request';
  return null;
};

const resourceFromPath = pathname => {
  if (pathname.includes('/comments')) return 'un comentario';
  if (pathname.includes('/attachments') || pathname.includes('/files')) return 'un archivo';
  if (pathname.includes('/tasks')) return 'una tarea';
  if (pathname.includes('/activity')) return 'un evento';
  if (pathname.includes('/financials')) return 'un registro financiero';
  if (pathname.includes('/reports')) return 'un informe';
  if (pathname.includes('/content')) return 'una parrilla o pieza';
  if (pathname.includes('/clients')) return 'un registro de cliente';
  if (pathname.includes('/team') || pathname.includes('/users')) return 'un usuario o miembro del equipo';
  if (pathname.includes('/minutes')) return 'una minuta';
  return 'un registro';
};

export const describePlatformMutation = ({ method, pathname }) => {
  const path = routePath(pathname);
  const kind = operationKind(method, path);
  const details = kind === 'recognition-check' ? { action: 'comprobó', resource: 'avisos de reconocimiento pendientes' }
    : kind === 'recognition-notice' ? { action: 'preparó', resource: 'un aviso de reconocimiento' }
      : kind === 'minutes-request' ? { action: 'realizó', resource: 'una solicitud' }
        : { action: actionByMethod[method] || 'modificó', resource: resourceFromPath(path) };
  return {
    ...details,
    module: moduleFromPath(path),
    path: path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\/\d+(?=\/|$)/g, '/:id').slice(0, 240),
  };
};

export const presentPlatformMutation = (metadata = {}, actor = 'Sistema') => {
  const path = routePath(metadata?.path);
  const kind = operationKind(metadata?.method, path);
  if (kind === 'recognition-check') return {
    label: 'Comprobación de reconocimientos', isChange: false,
    description: `El sistema comprobó si había avisos de reconocimiento pendientes para ${actor}.`,
  };
  if (kind === 'recognition-notice') return {
    label: 'Aviso de reconocimiento', isChange: false,
    // Acknowledgement precedes rendering; it does not prove the person saw the popup.
    description: `El sistema confirmó la preparación de un aviso de reconocimiento para ${actor}.`,
  };
  if (kind === 'minutes-request') return {
    label: 'Solicitud de Minutas', isChange: false,
    // Historical records have no GraphQL operation/result. Do not invent creation or reading.
    description: `${actor} realizó una solicitud en Minutas.`,
  };
  const module = path ? moduleFromPath(path) : moduleName(metadata?.module);
  if (!path && ['fireflies', 'recognitions'].includes(metadata?.module)) return {
    label: `Actividad de ${module}`, isChange: false,
    description: `Se registró actividad en ${module} asociada a ${actor}.`,
  };
  return {
    label: 'Acción registrada', isChange: true,
    description: `${actor} ${metadata?.action || 'modificó'} ${metadata?.resource || 'un registro'} en ${module}.`,
  };
};
