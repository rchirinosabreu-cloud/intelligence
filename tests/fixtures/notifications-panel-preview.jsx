import React from 'react';
import { createRoot } from 'react-dom/client';
import PushNotificationControl from '../../src/components/notifications/PushNotificationControl';
import TeamCompletionsControl from '../../src/components/notifications/TeamCompletionsControl';
import NotificationSettings from '../../src/components/notifications/NotificationSettings';
import BrainToaster from '../../src/components/ui/BrainToaster';
import { notificationPanelControls } from '../../src/lib/teamNotifications';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '../../src/components/ui/dropdown-menu';
import '../../src/index.css';

// Muestra local del panel de notificaciones: la cabecera, los dos controles, la lista con
// su alto real y «Ver más». Datos ficticios, sin backend más allá de lo que intercepta el
// recorrido de navegador.

const AVISOS = Array.from({ length: 24 }, (_, index) => ({
  id: `n${index}`,
  isRead: index > 6,
  type: index % 3 === 0 ? 'TEAM_TASK_COMPLETED' : 'TASK_COMMENT_REPLY',
  title: index % 3 === 0 ? 'Melissa terminó «Reel de agosto»' : 'Nuevo mensaje en el hilo de la tarea',
  body: index % 3 === 0 ? 'Pablo Hoff' : '[Producción] Reel: POSICIONAMIENTO — FRAME 2: Pero esto es lo que lo hace posible.',
  when: '23 oct, 09:12'
}));

const Panel = () => {
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [preferences, setPreferences] = React.useState({ teamCompletions: false });

  const visibles = AVISOS.filter((aviso) => (unreadOnly ? !aviso.isRead : true));
  const mostrados = visibles.slice(0, page * 20);
  const hayMas = mostrados.length < visibles.length;
  const sinLeer = AVISOS.filter((aviso) => !aviso.isRead).length;
  const controles = notificationPanelControls({ preferences });

  // Va dentro del `DropdownMenu` de verdad: es donde vive en la plataforma y donde un
  // botón que no es un ítem del menú podría cerrarlo al pulsarlo.
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Abrir notificaciones" className="h-11 w-11 rounded-full bg-white shadow-sm dark:bg-zinc-800" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="flex w-80 flex-col overflow-y-hidden p-0 max-h-[min(78vh,40rem)]">
      <div className="shrink-0 border-b border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white">Notificaciones</h4>
          {sinLeer > 0 && (
            <button type="button" className="rounded-lg px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10">
              Marcar todas como leídas
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-1">
          {[['all', 'Todas', !unreadOnly], ['unread', `Sin leer (${sinLeer})`, unreadOnly]].map(([id, label, active]) => (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => { setUnreadOnly(id === 'unread'); setPage(1); }}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${active ? 'bg-primary/10 text-primary' : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {controles.push && (
        <PushNotificationControl onDismiss={() => setPreferences((p) => ({ ...p, pushDismissed: true }))} />
      )}
      {controles.teamCompletions && (
        <TeamCompletionsControl
          preferences={preferences}
          onSaved={(saved) => setPreferences(saved || preferences)}
          onDismiss={() => setPreferences((p) => ({ ...p, teamCompletionsDismissed: true }))}
        />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mostrados.map((aviso) => (
          <DropdownMenuItem key={aviso.id} className={`flex gap-3 border-b border-zinc-50 p-4 dark:border-zinc-900 ${aviso.isRead ? '' : 'bg-primary/5'}`}>
            <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-zinc-900 dark:text-white">{aviso.title}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500 dark:text-zinc-400">{aviso.body}</p>
              <p className="mt-1 text-[10px] text-zinc-400">{aviso.when}</p>
            </div>
          </DropdownMenuItem>
        ))}
        {hayMas && (
          <button
            type="button"
            data-notifications-load-more
            onClick={() => setPage((value) => value + 1)}
            className="min-h-11 w-full border-t border-zinc-100 px-4 py-3 text-xs font-semibold text-primary hover:bg-primary/5 dark:border-zinc-800"
          >
            Ver más
          </button>
        )}
      </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// `?perfil` muestra la sección de Perfil, donde los dos interruptores están siempre.
const vistaDePerfil = new URLSearchParams(window.location.search).has('perfil');

createRoot(document.getElementById('root')).render(
  // El visor de avisos vive arriba al centro, así que el contenido baja para no quedar debajo.
  <main className="flex min-h-screen items-start justify-center bg-zinc-100 px-8 pb-8 pt-24 dark:bg-zinc-900">
    <BrainToaster />
    {vistaDePerfil ? <div className="w-full max-w-md"><NotificationSettings /></div> : <Panel />}
  </main>
);
