// Pedirle algo a Bria desde otra pantalla (10 de octubre de 2026). La pantalla deja el mensaje listo en el
// chat y abre el panel; la persona lo lee y lo envía. Nunca se envía solo: lo que Bria haga con ese mensaje
// (crear un pendiente, escribirle a alguien) lo decide quien lo manda.

export const BRIA_ASK_EVENT = 'bria:ask';
// Abrir una conversación concreta (el foco de la semana, 10 de octubre de 2026): el panel se abre en ese chat.
export const BRIA_OPEN_EVENT = 'bria:open';
// La consulta rápida (Rodny, 10 de octubre de 2026: «hacerle una pregunta rápida a Bria, no necesariamente abriendo un
// chat nuevo»): lo que la persona escribió con sus propias manos en la caja «Haz tu consulta» sí se envía, al chat
// que tenga abierto. Es la única vía que envía: la escribió ella.
export const BRIA_QUICK_ASK_EVENT = 'bria:quick-ask';

const dispatch = (type, detail) => { if (typeof window === 'undefined') return false; window.dispatchEvent(new CustomEvent(type, { detail })); return true; };
const listen = (type, pick, handler) => {
  if (typeof window === 'undefined') return () => {};
  const listener = (event) => { const value = pick(event?.detail || {}); if (value) handler(value); };
  window.addEventListener(type, listener);
  return () => window.removeEventListener(type, listener);
};

export const askBria = (message) => { const text = String(message || '').trim(); return text ? dispatch(BRIA_ASK_EVENT, { message: text }) : false; };
export const onBriaAsk = (handler) => listen(BRIA_ASK_EVENT, (d) => String(d.message || '').trim(), handler);

export const openBriaConversation = (conversationId) => { const id = String(conversationId || '').trim(); return id ? dispatch(BRIA_OPEN_EVENT, { conversationId: id }) : false; };
export const onBriaOpen = (handler) => listen(BRIA_OPEN_EVENT, (d) => String(d.conversationId || '').trim(), handler);

export const quickAskBria = (question) => { const text = String(question || '').trim(); return text ? dispatch(BRIA_QUICK_ASK_EVENT, { question: text }) : false; };
export const onBriaQuickAsk = (handler) => listen(BRIA_QUICK_ASK_EVENT, (d) => String(d.question || '').trim(), handler);
