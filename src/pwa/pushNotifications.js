import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const parseApiError = async (response, fallback) => {
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  const error = new Error(data?.error || fallback);
  error.responseData = data;
  return error;
};

export const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
};

export const isPushSupported = () => (
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window
);

export const isIosDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');

export const isInstalledApp = () => (
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true
);

const getRegistration = async () => {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.ready;
};

export const getPushClientState = async () => {
  if (!isPushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false, subscription: null };
  }
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
    subscription
  };
};

const getDeviceLabel = () => {
  if (/iphone|ipad|ipod/i.test(navigator.userAgent || '')) return 'iPhone o iPad';
  if (/android/i.test(navigator.userAgent || '')) return 'Android';
  return 'Navegador web';
};

export const enablePushNotifications = async (publicKey) => {
  if (!isPushSupported()) throw new Error('Este dispositivo no admite notificaciones web.');
  if (isIosDevice() && !isInstalledApp()) {
    throw new Error('Instala Brainstudio en la pantalla de inicio para activar los avisos.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Permiso bloqueado. Habilitalo desde los ajustes del dispositivo.'
      : 'No se concedio el permiso de notificaciones.');
  }

  const registration = await getRegistration();
  let subscription = await registration.pushManager.getSubscription();
  let createdNow = false;
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    createdNow = true;
  }

  const response = await fetch(`${getApiBaseUrl()}/api/push/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      deviceLabel: getDeviceLabel(),
      preferences: { tasks: true, mentions: true, announcements: true }
    })
  });
  if (!response.ok) {
    if (createdNow) await subscription.unsubscribe().catch(() => false);
    throw await parseApiError(response, 'No fue posible guardar este dispositivo.');
  }
  return subscription;
};

export const disablePushNotifications = async () => {
  if (!isPushSupported()) return false;
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;

  const response = await fetch(`${getApiBaseUrl()}/api/push/subscriptions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });
  if (!response.ok) {
    throw await parseApiError(response, 'No fue posible desactivar este dispositivo.');
  }
  return subscription.unsubscribe();
};
