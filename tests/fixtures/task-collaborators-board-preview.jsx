import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import NativeTasks from '@/components/modules/NativeTasks';
import BrainToaster from '@/components/ui/BrainToaster';
import { AuthProvider } from '@/context/AuthContext';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import '@/index.css';
import 'react-datepicker/dist/react-datepicker.css';

// Colaboradores en el tablero real (Rodny, 5 de octubre de 2026): el Kanban y el panel de la tarea de
// verdad contra una API en memoria. Los relojes corren mientras la página está abierta y se pierden
// al recargar. `?viewer=melissa` (colaboradora), `?viewer=rodny` (responsable), `&dark`.

const people = {
  rodny: { id: 'u-rodny', name: 'Rodny Chirinos', role: 'ADMIN' },
  melissa: { id: 'u-melissa', name: 'Melissa Ortega', role: 'EDITOR' },
  bruno: { id: 'u-bruno', name: 'Bruno Salas', role: 'EDITOR' }
};
const params = new URLSearchParams(location.search);
const viewer = people[params.get('viewer')] || people.melissa;
const user = { ...viewer, userId: viewer.id, modulePermissions: { gestion: true } };
localStorage.setItem('authToken', `demo.${btoa(JSON.stringify({ exp: 4102444800 }))}.demo`);
localStorage.setItem('currentUser', JSON.stringify(user));
if (params.has('dark')) document.documentElement.classList.add('dark');

const MIN = 60_000;
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const venceHoy = `${hoy}T12:00:00.000Z`;
const client = { id: 'c1', name: 'Corporación Villa Montaña', slug: 'villa', logoUrl: null };
const members = {
  rodny: { id: 'm-rodny', userId: 'u-rodny', name: 'Rodny Chirinos', avatarUrl: null, role: 'Director' },
  melissa: { id: 'm-melissa', userId: 'u-melissa', name: 'Melissa Ortega', avatarUrl: null, role: 'Community Manager' },
  bruno: { id: 'm-bruno', userId: 'u-bruno', name: 'Bruno Salas', avatarUrl: null, role: 'Diseñador' }
};

const start = Date.now();
const sessions = [
  { taskId: 't1', workerId: 'm-melissa', isCollaborator: true, startedAt: new Date(start - 200 * MIN), endedAt: new Date(start - 170 * MIN), durationMs: 30 * MIN },
  { taskId: 't1', workerId: 'm-bruno', isCollaborator: true, startedAt: new Date(start - 25 * MIN), endedAt: null, durationMs: null }
];
const collaborators = { t1: ['melissa', 'bruno'], t3: ['melissa'] };

const baseTasks = [
  {
    id: 't1', title: 'Parrilla de octubre · doce piezas', status: 'EN_CURSO', creatorId: 'u-rodny', clientId: client.id, client,
    assigneeId: members.rodny.id, assignee: members.rodny, startedAt: new Date(start - 40 * MIN).toISOString(), accumulatedWorkMs: 20 * MIN,
    comments: 'Rodny graba y edita los reels; Melissa arma el resto y escribe los textos; Bruno hace las plantillas.',
    priority: 'ALTA', aiCategory: 'MARKETING & SOCIAL', aiComplexity: 'ALTA', dueDate: venceHoy, createdAt: '2026-10-01T12:00:00.000Z',
    taskAttachments: [], taskComments: [], viewers: [], sortOrder: 0
  },
  {
    id: 't2', title: 'Carrusel de lanzamiento', status: 'PENDIENTE', creatorId: 'u-rodny', clientId: client.id, client,
    assigneeId: members.bruno.id, assignee: members.bruno, comments: 'Cinco láminas con los testimonios.', priority: 'NORMAL',
    aiCategory: 'CREATIVO & DISEÑO', aiComplexity: 'MEDIA', dueDate: venceHoy, createdAt: '2026-10-02T12:00:00.000Z',
    taskAttachments: [], taskComments: [], viewers: [], sortOrder: 1
  },
  {
    id: 't3', title: 'Reel de aniversario', status: 'PENDIENTE', creatorId: 'u-rodny', clientId: client.id, client,
    assigneeId: members.rodny.id, assignee: members.rodny, startedAt: null, accumulatedWorkMs: 0,
    comments: 'Rodny graba; Melissa escribe el texto de la publicación.', priority: 'URGENTE',
    aiCategory: 'PRODUCCIÓN AUDIOVISUAL', aiComplexity: 'MEDIA', dueDate: venceHoy, createdAt: '2026-10-03T12:00:00.000Z',
    taskAttachments: [], taskComments: [], viewers: [], sortOrder: 2
  }
];

const withCollaborators = (task) => ({
  ...task,
  collaborators: (collaborators[task.id] || []).map((key) => ({ memberId: members[key].id, member: members[key] })),
  workSessions: [
    ...sessions.filter((s) => s.taskId === task.id && !s.endedAt).map(({ workerId, isCollaborator, startedAt }) => ({ workerId, isCollaborator, startedAt })),
    ...(task.status === 'EN_CURSO' && task.startedAt ? [{ workerId: task.assigneeId, isCollaborator: false, startedAt: task.startedAt }] : [])
  ]
});

const teamTime = (taskId) => {
  const task = baseTasks.find((t) => t.id === taskId);
  const now = Date.now();
  const rows = [{
    memberId: task.assignee.id, userId: task.assignee.userId, name: task.assignee.name, avatarUrl: null, role: 'ASSIGNEE',
    elapsedMs: task.accumulatedWorkMs + (task.status === 'EN_CURSO' && task.startedAt ? now - new Date(task.startedAt).getTime() : 0),
    working: task.status === 'EN_CURSO' && Boolean(task.startedAt)
  }];
  for (const key of collaborators[taskId] || []) {
    const member = members[key];
    const own = sessions.filter((s) => s.taskId === taskId && s.workerId === member.id);
    rows.push({
      memberId: member.id, userId: member.userId, name: member.name, avatarUrl: null, role: 'COLLABORATOR',
      elapsedMs: own.reduce((total, s) => total + (s.endedAt ? s.durationMs : now - s.startedAt.getTime()), 0),
      working: own.some((s) => !s.endedAt)
    });
  }
  return rows;
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
window.fetch = async (input, init = {}) => {
  const url = String(input?.url || input);
  const method = (init.method || 'GET').toUpperCase();
  const work = url.match(/\/api\/tasks\/([^/]+)\/work\/(team|start|pause)/);
  if (work) {
    const [, taskId, action] = work;
    const me = Object.values(members).find((m) => m.userId === viewer.id);
    const task = baseTasks.find((t) => t.id === taskId);
    if (action !== 'team') {
      const isAssignee = task.assigneeId === me?.id;
      if (!isAssignee && !(collaborators[taskId] || []).some((key) => members[key].id === me?.id)) return json({ error: 'Solo el equipo de la tarea registra tiempo aquí.' }, 403);
      if (action === 'start' && task.status !== 'EN_CURSO') return json({ error: 'Pasa la tarea a «En proceso» para registrar tu tiempo.' }, 409);
      if (isAssignee) {
        // El reloj del responsable es el de la tarea, como en el servidor.
        if (action === 'start' && !task.startedAt) task.startedAt = new Date().toISOString();
        if (action === 'pause' && task.startedAt) { task.accumulatedWorkMs += Date.now() - new Date(task.startedAt).getTime(); task.startedAt = null; }
      } else {
        const open = sessions.find((s) => s.taskId === taskId && s.workerId === me.id && !s.endedAt);
        if (action === 'start' && !open) sessions.push({ taskId, workerId: me.id, isCollaborator: true, startedAt: new Date(), endedAt: null, durationMs: null });
        if (action === 'pause' && open) { open.endedAt = new Date(); open.durationMs = open.endedAt - open.startedAt; }
      }
    }
    return json(teamTime(taskId));
  }
  const patch = method === 'PATCH' && url.match(/\/api\/tasks\/([^/?]+)$/);
  if (patch) {
    // Mover la tarjeta: en las tareas con equipo no arranca ningún reloj; sacarla de «En proceso» los para.
    const task = baseTasks.find((t) => t.id === patch[1]);
    const next = JSON.parse(init.body || '{}').status;
    if (task.status === 'EN_CURSO' && next !== 'EN_CURSO') {
      if (task.startedAt) task.accumulatedWorkMs += Date.now() - new Date(task.startedAt).getTime();
      task.startedAt = null;
      sessions.filter((s) => s.taskId === task.id && !s.endedAt).forEach((s) => { s.endedAt = new Date(); s.durationMs = s.endedAt - s.startedAt; });
    }
    task.status = next;
    return json(withCollaborators(task));
  }
  if (url.includes('/api/tasks') && method === 'GET' && !/\/api\/tasks\/[^/?]+\//.test(url)) return json(baseTasks.map(withCollaborators));
  if (url.includes('/api/team')) return json(Object.values(members));
  if (url.includes('/api/clients')) return json([client]);
  if (url.includes('/api/user') || url.includes('/api/auth/me')) return json(user);
  return json([]);
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ConfirmDialogProvider>
        <MemoryRouter>
          <div className="min-h-screen bg-zinc-50 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4 text-sm dark:border-zinc-700">
              <p>Muestra local · datos de ejemplo en memoria · nada se guarda</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500">Viendo como:</span>
                {Object.entries(people).map(([key, person]) => (
                  <a key={key} href={`?viewer=${key}${params.has('dark') ? '&dark' : ''}`}
                    className={`min-h-11 rounded-lg border px-3 py-2 text-xs ${person.id === viewer.id ? 'border-brand-cyan bg-brand-cyan/10 font-semibold' : 'border-zinc-300 dark:border-zinc-700'}`}>
                    {person.name.split(' ')[0]}
                  </a>
                ))}
              </div>
            </div>
            <NativeTasks />
            <BrainToaster />
          </div>
        </MemoryRouter>
      </ConfirmDialogProvider>
    </AuthProvider>
  </QueryClientProvider>
);
