// Datos de ejemplo para la muestra local del dashboard. Nunca deciden nada en producción.
const hoursFromNow = (hours, now = new Date()) => new Date(now.getTime() + hours * 60 * 60 * 1000);
const daysFromNow = (days, hour = 15, now = new Date()) => {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};
const bogotaDayKey = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

// A friendly SVG portrait so the sidebar shows a real photo, not the initials fallback.
const portrait = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#009BBF"/><stop offset="1" stop-color="#31AA8A"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><circle cx="48" cy="38" r="17" fill="#FFE8D6"/><path d="M18 96c3-20 15-30 30-30s27 10 30 30z" fill="#FCD200"/><path d="M31 36c0-14 34-14 34 0v-6c0-8-34-8-34 0z" fill="#3B2A20"/></svg>`);
export const dashboardDemoAvatar = `data:image/svg+xml;charset=utf-8,${portrait}`;

export const dashboardDemoUser = {
  id: 'dashboard-demo-user',
  name: 'Rodny Chirinos',
  email: 'rodny@brainstudio.test',
  role: 'ADMIN',
  teamRole: 'Director',
  avatarUrl: dashboardDemoAvatar,
  modulePermissions: { dashboard: true, gestion: true, actividad: true, crm: true, clientes: true, equipo: true }
};

export const dashboardDemoMember = { id: 'dashboard-demo-member', userId: dashboardDemoUser.id, name: dashboardDemoUser.name, role: 'Director · Muestra local', avatarUrl: dashboardDemoAvatar, isActive: true };

const people = {
  helen: { id: 'member-helen', userId: 'user-helen', name: 'Helen Hernández', role: 'Community Manager' },
  melissa: { id: 'member-melissa', userId: 'user-melissa', name: 'Melissa Castaño', role: 'Diseñadora' },
  franci: { id: 'member-franci', userId: 'user-franci', name: 'Franci Villa', role: 'SDR' }
};

export const dashboardDemoTeam = [dashboardDemoMember, ...Object.values(people).map((person) => ({ ...person, isActive: true, avatarUrl: null }))];

const client = (key, name) => ({ id: `client-${key}`, name, slug: key, logoUrl: null, healthScore: 82 });

export function dashboardDemoDashboard(now = new Date()) {
  const completed = (key, title, assignee, clientName, hoursAgo) => ({
    id: `done-${key}`, title, status: 'REALIZADA', assignee, assigneeId: assignee.id, client: client(key, clientName),
    completedAt: hoursFromNow(-hoursAgo, now).toISOString(), recognitions: key === 'reel' ? [{ kind: 'DAILY_EIGHT', title: 'On fire' }] : []
  });
  const upcoming = (key, title, clientName, days, isPriority = false) => ({
    id: `task-${key}`, title, status: 'PENDIENTE', dueDate: daysFromNow(days, 20, now).toISOString(), client: client(key, clientName), assignee: dashboardDemoMember, isPriority
  });
  const meeting = (key, title, hours, extra = {}) => {
    const startAt = hoursFromNow(hours, now);
    return { id: `meeting-${key}`, occurrenceKey: `meeting-${key}`, title, type: 'MEETING', startAt: startAt.toISOString(), endAt: hoursFromNow(hours + 1, now).toISOString(), isAllDay: false, meetingLink: extra.link ? 'https://meet.google.com/brain-demo' : null, htmlLink: null, organizerEmail: 'coordinador@brainstudio.test', responseStatus: extra.response || 'accepted', isRecurrenceOccurrence: false, dayKey: bogotaDayKey(startAt), isToday: bogotaDayKey(startAt) === bogotaDayKey(now) };
  };

  return {
    member: { ...dashboardDemoMember, isCommunityManager: false },
    stats: { active: 14, dueToday: 5, overdue: 2, returned: 1, completedToday: 3 },
    focusCards: [],
    todayTasks: [], overdueTasks: [], returnedTasks: [],
    upcomingTasks: [
      upcoming('alpina', 'PÁGINA WEB MUSEO DE MAMPUJÁN – AVANCES DE LA SEGUNDA ENTREGA CON EL CLIENTE', 'Alpina', 1, true),
      upcoming('colanta', 'Revisar propuesta comercial', 'Colanta', 1),
      upcoming('nutresa', 'Parrilla de octubre', 'Nutresa', 2),
      upcoming('postobon', 'Informe mensual de resultados', 'Postobón', 4),
      upcoming('bonsai', 'Onboarding del cliente', 'Bonsai Café', 6)
    ],
    achievements: [
      completed('parrilla', 'Parrilla de octubre aprobada', people.franci, 'Alpina', 1),
      completed('reel', 'Reel de lanzamiento', people.melissa, 'Nutresa', 2),
      completed('conciliacion', 'Conciliación de agosto', people.helen, 'Brainstudio', 3)
    ],
    clients: [],
    weeklyHabit: { isEmpty: true },
    announcements: [
      { id: 'global-1', scope: 'GLOBAL', createdAt: hoursFromNow(-3, now).toISOString(), author: dashboardDemoUser, content: '<p>Buenas tardes chicos. Cómo están.?</p><p>Les comunico por acá que a las 2:00 pm tenemos una reunión para que se vayan programando. Lleven sus pendientes al día y las novedades de cada cliente, porque vamos a repasar el cierre de la semana completo.</p>' },
      { id: 'personal-1', scope: 'MEMBER', createdAt: hoursFromNow(-6, now).toISOString(), author: people.helen, content: '<p>Rodny, revisa la cartera de Nutresa antes del comité de hoy.</p>' },
      { id: 'global-2', scope: 'GLOBAL', createdAt: hoursFromNow(-30, now).toISOString(), author: dashboardDemoUser, content: '<p>Bienvenida a <strong>Franci</strong> al equipo comercial.</p>' }
    ],
    meetings: [
      meeting('comite', 'Reunión tráfico Brain Studio – Equipo Base con todos los líderes de cuenta', 3, { link: true }),
      meeting('kickoff', 'Kickoff Alpina', 7, { response: 'tentative' }),
      meeting('sync', 'Sincronización semanal', 28, { link: true, response: 'needsAction' }),
      meeting('cliente', 'Presentación Colanta', 52, { link: true })
    ],
    crmAttention: {
      enabled: true,
      counts: { overdue: 1, today: 1, red: 1 },
      items: [
        { id: 'lead-centro', code: 'BRN-104', company: 'Centro Andino', contactName: 'Marta Mejía', stage: 'SIN_RESPUESTA', stageLabel: 'Sin respuesta', priority: 'MEDIA', trafficLight: 'ROJO', trafficLightReason: 'Sin gestión hace 23 días', followUpBucket: 'VENCIDO', nextFollowUpAt: bogotaDayKey(daysFromNow(-8, 12, now)), nextAction: 'Llamar a Marta para validar la propuesta' },
        { id: 'lead-hdi', code: 'BRN-118', company: 'HDI Seguros', contactName: 'Catalina Rojas', stage: 'ESPERANDO_CLIENTE', stageLabel: 'Esperando cliente', priority: 'ALTA', trafficLight: 'AMARILLO', trafficLightReason: 'Seguimiento programado', followUpBucket: 'HOY', nextFollowUpAt: bogotaDayKey(now), nextAction: 'Recibir y revisar el RFP' },
        { id: 'lead-jaraba', code: 'BRN-110', company: 'Jaraba Ingeniería', contactName: 'Víctor Jaraba', stage: 'PROPUESTA_ENVIADA', stageLabel: 'Propuesta enviada', priority: 'MEDIA', trafficLight: 'ROJO', trafficLightReason: 'Tres contactos sin respuesta', followUpBucket: 'SEMANA', nextFollowUpAt: bogotaDayKey(daysFromNow(3, 12, now)), nextAction: 'Pedir una definición sobre la propuesta' }
      ]
    }
  };
}

export const dashboardDemoClients = [
  { id: 'client-alpina', name: 'Alpina', slug: 'alpina', logoUrl: null },
  { id: 'client-nutresa', name: 'Nutresa', slug: 'nutresa', logoUrl: null },
  { id: 'client-haad', name: 'Haad Aesthetic Center', slug: 'haad', logoUrl: null },
  { id: 'client-brain', name: 'Brainstudio', slug: 'brainstudio', logoUrl: null }
];

/** Kanban de Gestión con datos de ejemplo: prioridades, vencidas, descripción, adjuntos y comentarios. */
export function dashboardDemoKanbanTasks(now = new Date()) {
  const client = (id) => dashboardDemoClients.find((entry) => entry.id === id);
  const task = (key, title, status, clientId, assignee, extra = {}) => ({
    id: `kanban-${key}`, title, status, clientId, client: client(clientId),
    assignee: { id: assignee.id, userId: assignee.userId, name: assignee.name, role: assignee.role, avatarUrl: assignee.avatarUrl || null },
    assigneeId: assignee.id,
    creator: { id: dashboardDemoUser.id, name: dashboardDemoUser.name }, creatorId: dashboardDemoUser.id,
    dueDate: daysFromNow(extra.dueInDays ?? 2, 12, now).toISOString(),
    comments: extra.comments || '',
    isPriority: Boolean(extra.priority), priority: extra.priority || null, isSpecial: Boolean(extra.isSpecial),
    aiCategory: extra.aiCategory || null, aiComplexity: extra.aiComplexity || null,
    taskAttachments: Array.from({ length: extra.files || 0 }, (_, index) => ({ id: `${key}-file-${index}`, fileName: `archivo-${index + 1}.pdf` })),
    taskComments: Array.from({ length: extra.commentCount || 0 }, (_, index) => ({ id: `${key}-comment-${index}`, content: 'Comentario de ejemplo' })),
    sortOrder: extra.sortOrder ?? 0, createdAt: hoursFromNow(-48, now).toISOString(), completedAt: extra.completedAt || null,
    startedAt: status === 'EN_CURSO' ? hoursFromNow(-1, now).toISOString() : null, accumulatedWorkMs: 0, returnCount: 0, isReturned: false
  });
  return [
    task('mampujan', 'PÁGINA WEB MUSEO DE MAMPUJÁN – AVANCES DE LA SEGUNDA ENTREGA', 'PENDIENTE', 'client-brain', dashboardDemoMember, { priority: 'ALTA', dueInDays: 1, comments: '<p>Revisar con el cliente los avances de la segunda entrega y ajustar la sección de colecciones.</p>', aiCategory: 'Creativo & Diseño', aiComplexity: 'ALTA', files: 12, commentCount: 3, sortOrder: 0 }),
    task('reel-post', '[Producción] Reel: PROCESO DE POST OPERATORIO', 'PENDIENTE', 'client-haad', people.melissa, { priority: 'NORMAL', dueInDays: 3, comments: '<p>Guion aprobado. Grabar tomas de apoyo en clínica el jueves.</p>', aiCategory: 'Producción Audiovisual', aiComplexity: 'MEDIA', files: 4, sortOrder: 1 }),
    task('caption', 'Caption Expo Mujer Bolívar 2026', 'PENDIENTE', 'client-alpina', people.helen, { dueInDays: -2, comments: '<p>Texto corto para el carrusel del evento.</p>', aiCategory: 'Creación de Contenido', aiComplexity: 'BAJA', sortOrder: 2 }),
    task('parrilla', 'Redactar parrilla septiembre – octubre', 'EN_CURSO', 'client-nutresa', people.helen, { priority: 'URGENTE', dueInDays: 0, comments: '<p>Incluir campaña de temporada y los tres lanzamientos.</p>', aiCategory: 'Marketing & Social Media', aiComplexity: 'ALTA', files: 2, commentCount: 5, sortOrder: 0 }),
    task('canva', 'Incluir en Canva editables de cliente', 'EN_CURSO', 'client-brain', people.franci, { dueInDays: 4, aiCategory: 'Operaciones & Reuniones', aiComplexity: 'BAJA', isSpecial: true, sortOrder: 1 }),
    task('conciliacion', 'Conciliación manual financiero ingresos y egresos', 'REALIZADA', 'client-brain', people.helen, { dueInDays: -1, completedAt: hoursFromNow(-3, now).toISOString(), aiCategory: 'Administrativo & Finanzas', aiComplexity: 'MEDIA', files: 1, sortOrder: 0 }),
    task('historias', 'Activar historias', 'REALIZADA', 'client-alpina', people.melissa, { priority: 'NORMAL', dueInDays: 0, completedAt: hoursFromNow(-5, now).toISOString(), aiCategory: 'Marketing & Social Media', aiComplexity: 'BAJA', sortOrder: 1 })
  ];
}

export function dashboardDemoCompletedTasks(now = new Date()) {
  return dashboardDemoDashboard(now).achievements.map((task) => ({ ...task, status: 'Realizado' }));
}
