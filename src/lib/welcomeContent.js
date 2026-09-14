// Shared explanatory catalog. Permissions come from the authenticated server profile.
export const welcomeCatalog = [
  { id: 'dashboard', title: 'Dashboard', description: 'Tu punto de partida: prioridades, anuncios y los últimos logros del equipo.', icon: 'LayoutDashboard' },
  { id: 'manager', title: 'Manager', description: 'Consulta el seguimiento del trabajo y las señales que necesitan atención.', icon: 'Brain' },
  { id: 'gestion', title: 'Gestión', description: 'Organiza tus tareas, revisa las fechas y comparte avances con el equipo.', icon: 'CheckSquare' },
  { id: 'actividad', title: 'Actividad', description: 'Consulta el calendario y la disponibilidad del equipo para coordinarte mejor.', icon: 'Map' },
  { id: 'reportes', title: 'Reportes', description: 'Revisa resultados y reúne información para entender cómo vamos.', icon: 'FileBarChart' },
  { id: 'inspiracion', title: 'Inspiración', description: 'Encuentra y organiza referencias para dar forma a nuevas ideas.', icon: 'Palette' },
  { id: 'parrillas', title: 'Parrillas', description: 'Planifica contenidos y sigue sus revisiones, aprobaciones y producción.', icon: 'LayoutGrid' },
  { id: 'minutas', title: 'Minutas', description: 'Retoma lo conversado en las reuniones y consulta sus acuerdos y pendientes.', icon: 'FileText' },
  { id: 'drive', permission: 'minutas', title: 'Drive', description: 'Encuentra los documentos y archivos compartidos del trabajo.', icon: 'FolderOpen' },
  { id: 'cotizaciones', title: 'Cotizaciones', description: 'Consulta propuestas, servicios y condiciones comerciales en un mismo lugar.', icon: 'DollarSign' },
  { id: 'financiero', title: 'Financiero', description: 'Consulta ingresos, gastos y compromisos de pago según tus permisos.', icon: 'DollarSign' },
  { id: 'radar', title: 'Radar de Mérito', description: 'Conoce las métricas y señales de reconocimiento del trabajo del equipo.', icon: 'Zap' },
  { id: 'clientes', title: 'Clientes', description: 'Encuentra la información, los responsables y los enlaces de cada cliente.', icon: 'Users' },
  { id: 'equipo', title: 'Equipo', description: 'Conoce a las personas con quienes trabajas y sus roles en Brainstudio.', icon: 'UserCheck' },
  { id: 'salud-operativa', adminOnly: true, title: 'Salud Operativa', description: 'Revisa la participación, el ritmo de trabajo y las oportunidades de mejora.', icon: 'Activity' },
];

// Mirrors the visible Sidebar rules. This is explanatory UI, never authorization.
export const getWelcomeModules = user => welcomeCatalog.filter(item =>
  user?.role === 'ADMIN' || (!item.adminOnly && user?.modulePermissions?.[item.permission || item.id] === true)
);
export const welcomeName = name => String(name || '').trim().split(/\s+/)[0] || 'equipo';
