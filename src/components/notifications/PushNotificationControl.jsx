import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Loader2, Smartphone } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushClientState,
  isInstalledApp,
  isIosDevice,
  isPushSupported
} from '@/pwa/pushNotifications';

const PushNotificationControl = () => {
  const [status, setStatus] = useState(null);
  const [clientState, setClientState] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  const refreshState = useCallback(async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/push/status`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Push status failed with ${response.status}`);
      const nextStatus = await response.json();
      setStatus(nextStatus);
      if (nextStatus.enabled && isPushSupported()) {
        setClientState(await getPushClientState());
      }
    } catch (error) {
      console.error('[PushNotificationControl] Could not load push status:', error?.responseData || error);
    }
  }, []);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const handleEnable = async () => {
    setIsBusy(true);
    try {
      await enablePushNotifications(status.publicKey);
      await refreshState();
      toast.success('Notificaciones activadas en este dispositivo');
    } catch (error) {
      console.error('[PushNotificationControl] Enable failed:', error?.responseData || error);
      toast.error(error.message || 'No fue posible activar las notificaciones');
      await refreshState();
    } finally {
      setIsBusy(false);
    }
  };

  const handleDisable = async () => {
    setIsBusy(true);
    try {
      await disablePushNotifications();
      await refreshState();
      toast.success('Notificaciones desactivadas en este dispositivo');
    } catch (error) {
      console.error('[PushNotificationControl] Disable failed:', error?.responseData || error);
      toast.error(error.message || 'No fue posible desactivar las notificaciones');
    } finally {
      setIsBusy(false);
    }
  };

  if (!status?.enabled) return null;

  const denied = clientState?.permission === 'denied';
  const needsIosInstall = isIosDevice() && !isInstalledApp();
  const supported = clientState?.supported !== false && isPushSupported();
  const subscribed = Boolean(clientState?.subscribed);

  return (
    <div className="border-b border-zinc-100 bg-violet-50/60 p-3 dark:border-zinc-800 dark:bg-violet-950/20">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm dark:bg-zinc-900">
          {subscribed ? <CheckCircle2 className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-50">
            {subscribed ? 'Avisos del celular activos' : 'Avisos en este dispositivo'}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            {denied
              ? 'Permiso bloqueado en los ajustes del dispositivo.'
              : needsIosInstall
                ? 'Instala Brainstudio para activar los avisos en iPhone.'
                : supported
                  ? 'Tareas, menciones y anuncios importantes.'
                  : 'Este navegador no admite notificaciones web.'}
          </p>
        </div>
        {supported && !denied && !needsIosInstall && !subscribed && (
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-9 shrink-0 px-3 text-[11px]"
            disabled={isBusy}
            onClick={handleEnable}
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Activar'}
          </Button>
        )}
        {supported && !denied && !needsIosInstall && subscribed && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 shrink-0 px-3 text-[11px]"
            disabled={isBusy}
            onClick={handleDisable}
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Desactivar'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default PushNotificationControl;
