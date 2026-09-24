import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import NativeTasks from '../../src/components/modules/NativeTasks';
import { AuthProvider } from '../../src/context/AuthContext';
import { ConfirmDialogProvider } from '../../src/components/ui/ConfirmDialog';
import { taskPrivacyFilter } from '../../src/lib/taskPrivacy';
import '../../src/index.css';
import 'react-datepicker/dist/react-datepicker.css';

// Muestra local de los pendientes privados. Nada se guarda: la API vive en memoria y
// la **reserva la aplica la misma función que usa el servidor**, para que lo que se ve
// aquí sea lo que pasaría de verdad y no una imitación.
//
// `?viewer=maria` mira el tablero con los ojos de la responsable del pendiente privado;
// sin parámetro se mira con los ojos de alguien que no está en la lista.

const viewerParam = new URLSearchParams(location.search).get('viewer') || 'otro';
const viewers = {
  otro: { id: 'u-otro', name: 'Daniel (no está en la lista)', role: 'ADMIN' },
  maria: { id: 'u-maria', name: 'María (responsable)', role: 'EDITOR' },
  jefe: { id: 'u-jefe', name: 'Rodny (la creó)', role: 'ADMIN' }
};
const viewer = viewers[viewerParam] || viewers.otro;
const user = { ...viewer, userId: viewer.id, modulePermissions: {}, teamMemberId: 'm-viewer' };
localStorage.setItem('authToken', `demo.${btoa(JSON.stringify({ exp: 4102444800 }))}.demo`);
localStorage.setItem('currentUser', JSON.stringify(user));

// El tablero abre con el periodo «Hoy + Vencidas», así que las muestras vencen hoy.
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const venceHoy = `${hoy}T12:00:00.000Z`;

const client = { id: 'c1', name: 'Corporación Titanes', slug: 'titanes', logoUrl: null };
const maria = { id: 'm-maria', userId: 'u-maria', name: 'María Fernanda', avatarUrl: null, role: 'Community Manager' };
const bruno = { id: 'm-bruno', userId: 'u-bruno', name: 'Bruno', avatarUrl: null, role: 'Diseñador' };

const tasks = [
  {
    id: 't1', title: 'Parrilla de octubre para Titanes', status: 'PENDIENTE', isPrivate: false,
    creatorId: 'u-jefe', clientId: client.id, client, assigneeId: maria.id, assignee: maria,
    comments: 'Cerrar la parrilla antes del viernes.', priority: 'NORMAL', taskAttachments: [], taskComments: [],
    dueDate: venceHoy, createdAt: '2026-09-20T12:00:00.000Z', sortOrder: 0, viewers: []
  },
  {
    id: 't2', title: 'Revisión de salario de Marcela', status: 'EN_CURSO', isPrivate: true,
    creatorId: 'u-jefe', clientId: client.id, client, assigneeId: maria.id, assignee: maria,
    comments: 'Confidencial: propuesta de ajuste.', priority: 'ALTA', taskAttachments: [{ id: 'a1' }], taskComments: [],
    dueDate: venceHoy, createdAt: '2026-09-22T12:00:00.000Z', sortOrder: 1,
    // Solo Elisa fue añadida a la lista.
    viewers: [{ userId: 'u-elisa' }]
  },
  {
    id: 't3', title: 'Reel de aniversario', status: 'EN_CURSO', isPrivate: false,
    creatorId: 'u-jefe', clientId: client.id, client, assigneeId: bruno.id, assignee: bruno,
    comments: 'Montaje con el material del sábado.', priority: 'NORMAL', taskAttachments: [], taskComments: [],
    dueDate: venceHoy, createdAt: '2026-09-21T12:00:00.000Z', sortOrder: 2, viewers: []
  }
];

// El mismo recorte que aplicaría el servidor antes de responder.
const visibleTasks = tasks.map(taskPrivacyFilter(viewer.id));

window.fetch = async (input) => {
  const url = String(input?.url || input);
  const body = url.includes('/api/tasks') ? visibleTasks
    : url.includes('/api/team') ? [maria, bruno]
      : url.includes('/api/clients') ? [client]
        : url.includes('/api/user') ? user
          : [];
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ConfirmDialogProvider>
      <MemoryRouter>
        <div className="min-h-screen bg-zinc-50 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4 text-sm dark:border-zinc-700">
            <p>Muestra local · datos ficticios en memoria · nada se guarda</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">Viendo el tablero como:</span>
              {Object.entries(viewers).map(([key, person]) => (
                <a key={key} href={`?viewer=${key}`}
                  className={`min-h-11 rounded-lg border px-3 py-2 text-xs ${key === viewerParam ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-zinc-300 dark:border-zinc-700'}`}>
                  {person.name}
                </a>
              ))}
              <button className="min-h-11 rounded-lg border border-zinc-300 px-4 text-xs dark:border-zinc-700"
                onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button>
            </div>
          </div>
          <NativeTasks />
          <Toaster position="top-right" />
        </div>
      </MemoryRouter>
      </ConfirmDialogProvider>
    </AuthProvider>
  </QueryClientProvider>
);
