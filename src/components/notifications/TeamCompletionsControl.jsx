import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Users } from '@/components/ui/icons';
import NotificationToggleRow from '@/components/notifications/NotificationToggleRow';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// «Avísame cuando el equipo termine un pendiente» (la project manager, por Rodny, 26 de
// octubre de 2026: «algo que me notifique que la persona terminó la tarea, pero no tenga
// que ponerle seguimiento a todas las tareas»).
//
// Vive en el panel de notificaciones, junto a los avisos del dispositivo, porque es ahí
// donde alguien va cuando piensa en sus avisos. Es un aviso por pendiente terminado, no
// el ciclo de vida entero: eso sería justo el seguimiento que ella no quiere.

const TeamCompletionsControl = ({ preferences, onSaved, variant = 'row', onDismiss = null }) => {
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
        // Encenderlo lo retira del panel, así que la marca de descartado deja de hacer
        // falta: si después lo apaga desde Perfil, vuelve a ofrecerse una vez.
        body: JSON.stringify({ ...preferences, teamCompletions: next, teamCompletionsDismissed: false })
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
    <NotificationToggleRow
      testId="team-completions"
      icon={enabled ? CheckCircle2 : Users}
      label="Pendientes de todo el equipo"
      checked={enabled}
      busy={isBusy}
      note={variant === 'settings' ? 'Un aviso cada vez que alguien termina un pendiente.' : null}
      onToggle={toggle}
      onDismiss={onDismiss}
    />
  );
};

export default TeamCompletionsControl;
