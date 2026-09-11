export const recognitionDemoUser = { id: 'recognition-demo-user', name: 'Rodny Chirinos', role: 'EDITOR', modulePermissions: { dashboard: true, gestion: true }, email: 'demo@example.invalid' };
export const recognitionDemoMember = { id: 'recognition-demo-member', userId: recognitionDemoUser.id, name: recognitionDemoUser.name, role: 'Dirección · Muestra local' };

// Preview scenarios only: these entries never decide whether a real user earned an award.
export const recognitionScenarios = [
  { kind: 'FIRST_TASK', button: 'Probar buen comienzo', description: 'Completó la primera tarea del equipo hoy.' },
  { kind: 'EARLY_DELIVERY', button: 'Probar entrega anticipada', description: 'Terminó un pendiente antes de lo previsto.' },
  { kind: 'DAILY_EIGHT', button: 'Probar on fire', description: 'Completó ocho tareas distintas hoy.' },
  { kind: 'CAUGHT_UP', button: 'Probar ponerse al día', description: 'Completó sus tareas vencidas y se puso al día.' },
  { kind: 'PLAN_APPROVED', button: 'Probar parrilla aprobada', description: 'Todas las piezas de su parrilla quedaron aprobadas.' },
  { kind: 'WEEKLY_FIFTY', button: 'Probar 50 tareas semanales', description: 'Completó 50 tareas distintas esta semana.' },
];

export function recognitionSamples(now = new Date()) {
  return [
    { id: 'demo-first', taskId: 'recognition-completed-helen', kind: 'FIRST_TASK', recipient: { id: 'demo-helen', name: 'Helen Hernández' }, description: 'Completó la primera tarea del equipo hoy.', occurredAt: now.toISOString(), demo: true },
    { id: 'demo-early', taskId: 'recognition-completed-melissa', kind: 'EARLY_DELIVERY', recipient: { id: 'demo-melissa', name: 'Melissa Castaño' }, description: 'Terminó una entrega un día antes de la fecha comprometida.', occurredAt: now.toISOString(), demo: true },
    { id: 'demo-on-fire', taskId: 'recognition-completed-sara', kind: 'DAILY_EIGHT', recipient: { id: 'demo-sara', name: 'Sara Herrera' }, description: 'Completó ocho tareas distintas hoy.', occurredAt: now.toISOString(), demo: true },
    { id: 'demo-yesterday', taskId: 'recognition-completed-yesterday', kind: 'FIRST_TASK', recipient: recognitionDemoUser, description: 'Completó la primera tarea del equipo ese día.', occurredAt: new Date(now.getTime() - 86400000).toISOString(), demo: true },
  ];
}

export function recognitionDemoCompletedTasks(now = new Date()) {
  const member = (key, name) => ({ id: `recognition-member-${key}`, userId: `demo-${key}`, name });
  const entries = [
    ['rodny', 'Definir concepto de campaña', recognitionDemoMember, 'Brainstudio · Ejemplo'],
    ['helen', 'Diseñar parrilla', member('helen', 'Helen Hernández'), 'Casa Bella · Ejemplo'],
    ['melissa', 'Revisar copy de campaña', member('melissa', 'Melissa Castaño'), 'Cliente de ejemplo'],
    ['sara', 'Ajustar piezas de campaña', member('sara', 'Sara Herrera'), 'Cliente de ejemplo'],
    ['plain', 'Organizar materiales de entrega', recognitionDemoMember, 'Brainstudio · Ejemplo'],
    ['yesterday', 'Revisar calendario editorial', recognitionDemoMember, 'Brainstudio · Ejemplo'],
  ];
  return entries.map(([key, title, assignee, clientName]) => ({
    id: `recognition-completed-${key}`, title, status: 'Realizado', assignee, assigneeId: assignee.id,
    client: { id: `recognition-client-${key}`, name: clientName },
    completedAt: new Date(now.getTime() - (key === 'yesterday' ? 86400000 : 0)).toISOString(),
  }));
}

export function recognitionDemoTasks() {
  const now = new Date();
  const client = { id: 'recognition-demo-client', name: 'Cliente de ejemplo' };
  return ['Preparar propuesta creativa', 'Revisar piezas de campaña', 'Organizar referencias'].map((title, index) => ({
    id: `recognition-demo-task-${index}`, title, clientId: client.id, client,
    assignee: recognitionDemoMember, assigneeId: recognitionDemoMember.id,
    creator: recognitionDemoUser, creatorId: recognitionDemoUser.id,
    status: index === 1 ? 'En proceso' : 'Pendiente', dueDate: now.toISOString(),
    createdAt: now.toISOString(), completedAt: null, taskComments: [], taskAttachments: [], comments: '', sortOrder: index,
  }));
}

export function recognitionDemoDashboard() {
  return {
    member: recognitionDemoMember,
    stats: { active: 3, dueToday: 3, overdue: 0, returned: 0, completedToday: 0 },
    weeklyHabit: { isEmpty: true },
    announcements: [{ id: 'recognition-demo-announcement', scope: 'GLOBAL', createdAt: new Date().toISOString(), author: recognitionDemoUser, content: '<p>Este es el dashboard real de Brain, con datos de ejemplo. Explora los reconocimientos desde los controles del laboratorio.</p>' }],
    achievements: recognitionDemoCompletedTasks(), focusCards: [], upcomingTasks: recognitionDemoTasks(), clients: [],
  };
}
