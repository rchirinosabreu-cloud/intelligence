// Pedirle algo a Bria desde otra pantalla (10 de octubre de 2026). La pantalla deja el mensaje listo en el
// chat y abre el panel; la persona lo lee y lo envía. Nunca se envía solo: lo que Bria haga con ese mensaje
// (crear un pendiente, escribirle a alguien) lo decide quien lo manda.

export const BRIA_ASK_EVENT = 'bria:ask';

export const askBria = (message) => {
  const text = String(message || '').trim();
  if (!text || typeof window === 'undefined') return false;
  window.dispatchEvent(new CustomEvent(BRIA_ASK_EVENT, { detail: { message: text } }));
  return true;
};

export const onBriaAsk = (handler) => {
  if (typeof window === 'undefined') return () => {};
  const listener = (event) => { const message = String(event?.detail?.message || '').trim(); if (message) handler(message); };
  window.addEventListener(BRIA_ASK_EVENT, listener);
  return () => window.removeEventListener(BRIA_ASK_EVENT, listener);
};
