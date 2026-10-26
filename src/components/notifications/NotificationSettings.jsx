import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Loader2 } from '@/components/ui/icons';
import PushNotificationControl from '@/components/notifications/PushNotificationControl';
import TeamCompletionsControl from '@/components/notifications/TeamCompletionsControl';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// Los avisos se configuran en Perfil (Rodny, 26 de octubre de 2026: «no puede uno
// descartarlo y que aparezca ya en la configuración de uno como perfil?»). La campana solo
// los ofrece mientras la persona no ha decidido; aquí están siempre, encendidos o no.

const NotificationSettings = () => {
  const [preferences, setPreferences] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/notifications?limit=1`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Preferences failed with ${response.status}`);
      const data = await response.json();
      setPreferences(data?.preferences ?? {});
      setError('');
    } catch (failure) {
      console.error('[NotificationSettings] Could not load preferences:', failure);
      setError('No pudimos leer tus preferencias de avisos.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div data-notification-settings className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-3 border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
        <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Avisos</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Qué te avisamos y por dónde.</p>
        </div>
      </div>
      <div>
        {!preferences && !error && <div className="p-6"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>}
        {error && <p className="p-6 text-sm text-destructive">{error}</p>}
        {preferences && (
          <>
            <PushNotificationControl variant="settings" />
            <TeamCompletionsControl
              variant="settings"
              preferences={preferences}
              onSaved={(saved) => setPreferences(saved || preferences)}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default NotificationSettings;
