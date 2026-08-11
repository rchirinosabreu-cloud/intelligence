export const registerBrainstudioServiceWorker = () => {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(`/sw.js?v=${__BUILD_SHA__}`, {
        scope: '/',
        updateViaCache: 'none'
      });

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('brainstudio-update-ready'));
          }
        });
      });
    } catch (error) {
      console.error('[PWA] Service worker registration failed:', error);
    }
  }, { once: true });
};
