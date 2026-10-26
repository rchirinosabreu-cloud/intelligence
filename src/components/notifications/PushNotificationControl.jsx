import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Smartphone } from '@/components/ui/icons';
import NotificationToggleRow from '@/components/notifications/NotificationToggleRow';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushClientState,
  isInstalledApp,
  isIosDevice,
  isPushSupported
} from '@/pwa/pushNotifications';

const PushNotificationControl = ({ variant = 'row', onDismiss = null }) => {
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

  const denied = clientState?.permission === 'denied';
  const needsIosInstall = isIosDevice() && !isInstalledApp();
  const supported = clientState?.supported !== false && isPushSupported();
  const subscribed = Boolean(clientState?.subscribed);
  const blocked = !supported || denied || needsIosInstall;

  // Solo el dispositivo sabe si hay algo que ofrecer: que la plataforma tenga push, que
  // este aparato pueda recibirlo y que todavía no esté encendido aquí. Por eso el control
  // se retira callado en la campana, en vez de que el panel lo adivine.
  if (!status?.enabled) return null;
  if (variant === 'row' && (blocked || subscribed)) return null;

  const note = variant === 'settings' && blocked
    ? (denied
        ? 'Permiso bloqueado en los ajustes del dispositivo.'
        : needsIosInstall
          ? 'Instala Brainstudio para activar los avisos en iPhone.'
          : 'Este navegador no admite notificaciones web.')
    : null;

  return (
    <NotificationToggleRow
      testId="push"
      icon={subscribed ? CheckCircle2 : Smartphone}
      label={subscribed ? 'Avisos en este dispositivo' : 'Avisos en este dispositivo'}
      checked={subscribed}
      busy={isBusy}
      disabled={blocked}
      note={note}
      onToggle={subscribed ? handleDisable : handleEnable}
      onDismiss={onDismiss}
    />
  );
};

export default PushNotificationControl;
