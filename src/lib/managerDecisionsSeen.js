// El punto de «hay algo nuevo» en el acceso a Manager (Rodny, 10 de noviembre de 2026: «algo muy sutil, pero que
// destaque que hay algo nuevo allí»). Una decisión es nueva si esta persona no la ha visto en la pantalla de
// Decisiones desde este dispositivo. Lo visto vive en localStorage: es una comodidad del aparato, no un registro.

export const MANAGER_SEEN_EVENT = 'brain:manager-decisions-seen';
const storageKey = (userId) => `brain:manager-seen:${userId || 'anon'}`;
const MAX_KEYS = 300;

/** La huella de una tarjeta: una agrupada cambia cuando cambian las decisiones que reúne. */
export const decisionFingerprint = (card) => (card?.refs?.length > 1 ? `${card.key}|${card.refs.join(',')}` : String(card?.key || ''));

export const readSeen = (userId, storage = globalThis.localStorage) => {
  try { return new Set(JSON.parse(storage?.getItem(storageKey(userId)) || '[]')); } catch { return new Set(); }
};

export const hasUnseen = (keys = [], seen = new Set()) => keys.some((key) => key && !seen.has(key));

export const markSeen = (userId, keys = [], { storage = globalThis.localStorage, target = globalThis.window } = {}) => {
  try {
    const merged = [...new Set([...keys, ...readSeen(userId, storage)])].slice(0, MAX_KEYS);
    storage?.setItem(storageKey(userId), JSON.stringify(merged));
  } catch { /* sin almacenamiento, el punto simplemente vuelve a aparecer */ }
  try { target?.dispatchEvent(new Event(MANAGER_SEEN_EVENT)); } catch { /* sin ventana (pruebas) */ }
};
