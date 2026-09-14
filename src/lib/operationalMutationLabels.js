// Only known human actions are presented. A successful POST may just be a background read.
const moduleLabels = {
  activity: 'Actividad', boards: 'Inspiración', clients: 'Clientes', content: 'Parrillas',
  dashboard: 'Dashboard', feedback: 'Feedback', financials: 'Financiero', integrations: 'Integraciones',
  notifications: 'Notificaciones', quotations: 'Cotizaciones', reports: 'Reportes', tasks: 'Gestión de tareas',
  team: 'Equipo', user: 'Perfil', users: 'Usuarios', fireflies: 'Minutas', minutes: 'Minutas',
  'report-pdf': 'Minutas', drive: 'Minutas', recognitions: 'Logros recientes',
};
const routePath = value => String(value || '').split('?')[0].replace(/\/+$/, '');
const entry = (method, path, label, phrase) => ({ method, path: path.replace(/:[a-zA-Z]+/g, ':id'), label, phrase,
  pattern: new RegExp('^' + path.replace(/:[a-zA-Z]+/g, '[^/]+') + '$') });
const crud = (path, label, noun, updateMethod = 'PATCH') => [
  entry('POST', path, label, 'creó ' + noun),
  entry(updateMethod, path + '/:id', label, 'actualizó ' + noun),
  entry('DELETE', path + '/:id', label, 'eliminó ' + noun),
];
export const humanMutationCatalog = [
  entry('DELETE', '/api/tasks/:id', 'Tarea eliminada', 'eliminó una tarea'),
  entry('POST', '/api/tasks/reorder', 'Tareas organizadas', 'cambió el orden de las tareas'),
  entry('POST', '/api/tasks/:id/toggle-follow', 'Seguimiento de tarea', 'cambió el seguimiento de una tarea'),
  entry('POST', '/api/tasks/:id/comments', 'Comentario enviado', 'envió un comentario'),
  entry('PATCH', '/api/tasks/:id/comments/:commentId', 'Comentario editado', 'editó un comentario'),
  entry('DELETE', '/api/tasks/:id/comments/:commentId', 'Comentario eliminado', 'eliminó un comentario'),
  entry('POST', '/api/tasks/:id/comments/:commentId/reactions', 'Reacción a comentario', 'cambió su reacción a un comentario'),
  entry('POST', '/api/clients', 'Cliente creado', 'creó un cliente'),
  entry('PATCH', '/api/clients/:id', 'Cliente actualizado', 'actualizó los datos de un cliente'),
  entry('PATCH', '/api/clients/:id/archive', 'Cliente actualizado', 'cambió el estado de archivo de un cliente'),
  entry('POST', '/api/clients/:id/health-comment', 'Comentario enviado', 'añadió un comentario sobre un cliente'),
  entry('POST', '/api/dashboard/announcements', 'Anuncio publicado', 'publicó un anuncio'),
  entry('PATCH', '/api/dashboard/announcements/:scope/:id', 'Anuncio editado', 'editó un anuncio'),
  entry('DELETE', '/api/dashboard/announcements/:scope/:id', 'Anuncio eliminado', 'eliminó un anuncio'),
  entry('POST', '/api/global-announcements', 'Anuncio publicado', 'publicó un anuncio'),
  entry('DELETE', '/api/global-announcements/:id', 'Anuncio eliminado', 'eliminó un anuncio'),
  entry('POST', '/api/clients/:id/announcements', 'Anuncio publicado', 'publicó un anuncio para un cliente'),
  ...crud('/api/content/plans', 'Parrilla', 'una parrilla'),
  ...crud('/api/content/items', 'Contenido', 'una pieza de contenido'),
  entry('POST', '/api/content/plans/:id/share-token', 'Enlace de parrilla', 'creó un enlace para revisar una parrilla'),
  entry('POST', '/api/content/items/:id/send-to-kanban', 'Contenido a producción', 'envió una pieza a producción'),
  entry('POST', '/api/content/items/:id/final-asset', 'Archivo añadido', 'adjuntó un archivo a una pieza'),
  entry('POST', '/api/content/items/:id/final-assets', 'Archivos añadidos', 'adjuntó archivos a una pieza'),
  ...crud('/api/activity/events', 'Calendario', 'un evento del calendario'),
  entry('POST', '/api/activity/events/generate-meet', 'Enlace de reunión', 'generó un enlace de reunión'),
  entry('POST', '/api/quotations', 'Cotización creada', 'creó una cotización'),
  entry('PUT', '/api/quotations/:id', 'Cotización actualizada', 'actualizó una cotización'),
  ...crud('/api/services', 'Catálogo de servicios', 'un servicio', 'PUT'),
  entry('POST', '/api/team', 'Equipo', 'añadió un miembro al equipo'),
  entry('PUT', '/api/team/:id', 'Equipo', 'actualizó los datos de un miembro del equipo'),
  entry('DELETE', '/api/team/:id', 'Equipo', 'eliminó un miembro del equipo'),
  entry('PUT', '/api/user/profile', 'Perfil actualizado', 'actualizó su perfil'),
  entry('PUT', '/api/user/profile/:id', 'Perfil actualizado', 'actualizó el perfil de un miembro del equipo'),
  entry('PUT', '/api/user/password', 'Contraseña actualizada', 'cambió su contraseña'),
  entry('POST', '/api/minutes/sync', 'Minutas actualizadas', 'actualizó la lista de minutas'),
  entry('PATCH', '/api/minutes/:id/restore', 'Minuta restaurada', 'restauró una minuta'),
  entry('DELETE', '/api/minutes/:id/permanent', 'Minuta eliminada', 'eliminó definitivamente una minuta'),
  entry('DELETE', '/api/minutes/:id', 'Minuta archivada', 'envió una minuta a la papelera'),
  entry('POST', '/api/report-pdf/render', 'Documento preparado', 'preparó un PDF de una minuta'),
  entry('POST', '/api/reports/generate', 'Informe generado', 'generó un informe'),
  entry('PATCH', '/api/reports/:id/metrics', 'Informe actualizado', 'actualizó las cifras de un informe'),
  entry('POST', '/api/reports/:id/generate-narrative', 'Informe actualizado', 'generó el análisis de un informe'),
  ...crud('/api/financials/records', 'Financiero', 'un movimiento financiero'),
  entry('POST', '/api/financials/records/:id/void', 'Movimiento anulado', 'anuló un movimiento financiero'),
  entry('POST', '/api/financials/receivables/:id/payments', 'Pago registrado', 'registró un pago de un cliente'),
  entry('POST', '/api/financials/payroll/periods', 'Nómina preparada', 'generó un borrador de nómina'),
  entry('POST', '/api/financials/payroll-transactions/:id/approve', 'Nómina aprobada', 'aprobó un pago de nómina'),
  entry('POST', '/api/financials/payroll-transactions/:id/pay', 'Pago de nómina', 'registró un pago de nómina'),
  entry('POST', '/api/financials/periods/close', 'Período cerrado', 'cerró un período financiero'),
  entry('POST', '/api/financials/periods/reopen', 'Período reabierto', 'reabrió un período financiero'),
];
const findAction = (method, path) => humanMutationCatalog.find(action => action.method === method && action.pattern.test(routePath(path)));

export const describePlatformMutation = ({ method, pathname }) => {
  const path = routePath(pathname);
  const action = findAction(method, path);
  return {
    module: moduleLabels[path.replace(/^\/api\/?/, '').split('/')[0]] || 'la plataforma',
    path: action?.path || path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\/\d+(?=\/|$)/g, '/:id').slice(0, 240),
  };
};

export const presentPlatformMutation = (metadata = {}, actor = 'Sistema') => {
  const action = findAction(metadata?.method, metadata?.path);
  if (!action) return { visible: false, isChange: false, label: null, description: null };
  return { visible: true, isChange: true, label: action.label, description: actor + ' ' + action.phrase + '.' };
};

// Filter in PostgreSQL before take/limit; technical traffic must not bury people's actions.
export const humanMutationWhere = () => ({ eventType: 'PLATFORM_MUTATION', actorId: { not: null }, OR:
  humanMutationCatalog.map(({ method, path }) => ({ AND: [
    { metadata: { path: ['path'], equals: path } }, { metadata: { path: ['method'], equals: method } },
  ] })),
});

export const isInternalTraceRequest = pathname => /^\/api\/(recognitions(?:\/|$)|fireflies\/graphql$|push\/subscriptions(?:\/|$))/.test(routePath(pathname))
  || /^\/api\/tasks\/[^/]+\/(trace-open|alert-interaction|work-confirmation|returned-reminder\/snooze)$/.test(routePath(pathname))
  || /^\/api\/notifications(?:\/|$)/.test(routePath(pathname));
