import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Loader2, Users } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// «Avísame cuando el equipo termine un pendiente» (la project manager, por Rodny, 26 de
// octubre de 2026: «algo que me notifique que la persona terminó la tarea, pero no tenga
// que ponerle seguimiento a todas las tareas»).
//
// Vive en el panel de notificaciones, junto a los avisos del dispositivo, porque es ahí
// donde alguien va cuando piensa en sus avisos. Es un aviso por pendiente terminado, no
// el ciclo de vida entero: eso sería justo el seguimiento que ella no quiere.

const TeamCompletionsControl = ({ preferences, onSaved }) => {
  const [enabled, setEnabled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  // Lo último que el servidor confirmó al guardar. Sin esto, un refetch que todavía trae
  // el valor anterior devuelve el interruptor a su sitio delante de la persona.
  const savedRef = React.useRef(null);

  useEffect(() => {
    if (!preferences) return;
    const incoming = preferences.teamCompletions === true;
    if (savedRef.current !== null && savedRef.current !== incoming) return;
    savedRef.current = null;
    setEnabled(incoming);
  }, [preferences]);

  const toggle = async () => {
    if (isBusy) return;
    const next = !enabled;
    setIsBusy(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/notifications/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamCompletions: next })
      });
      if (!response.ok) throw new Error(`Preferences failed with ${response.status}`);
      const saved = await response.json();
      // Nunca se da por bueno el clic: se pinta lo que confirmó el servidor.
      const confirmed = saved?.preferences?.teamCompletions === true;
      savedRef.current = confirmed;
      setEnabled(confirmed);
      toast.success(confirmed ? 'Te avisaremos de cada pendiente terminado' : 'Ya no te avisaremos de los del equipo');
      onSaved?.(saved?.preferences ?? null);
    } catch (error) {
      console.error('[TeamCompletionsControl] Could not save preference:', error);
      toast.error('No se pudo guardar tu preferencia de avisos');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="border-b border-zinc-100 bg-cyan-50/60 p-3 dark:border-zinc-800 dark:bg-cyan-950/20">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm dark:bg-zinc-900">
          {enabled ? <CheckCircle2 className="h-4 w-4" /> : <Users className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-50">Pendientes de todo el equipo</p>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            {enabled
              ? 'Recibes un aviso aquí cada vez que alguien termina uno.'
              : 'Avísame cuando alguien termine un pendiente.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          data-team-completions-switch
          aria-checked={enabled}
          aria-label="Avisarme cuando el equipo termine un pendiente"
          disabled={isBusy}
          onClick={(event) => { event.preventDefault(); toggle(); }}
          className="flex min-h-11 min-w-11 items-center justify-center disabled:opacity-60"
        >
          {isBusy ? (
            <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
          ) : (
            <span className={cn(
              'relative h-4 w-7 shrink-0 rounded-full transition-colors',
              enabled ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-600'
            )}>
              <span className={cn(
                'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all',
                enabled ? 'left-3.5' : 'left-0.5'
              )} />
            </span>
          )}
        </button>
      </div>
    </div>
  );
};

export default TeamCompletionsControl;
