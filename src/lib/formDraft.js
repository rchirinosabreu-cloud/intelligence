// Recuperación local, por persona y formulario. Nunca ejecuta una operación del servidor.
const VERSION = 1;
const MAX_BYTES = 500_000;
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
export const formDraftKey = (userId, scope) => userId && scope ? `brain.formDraft.v${VERSION}.${encodeURIComponent(userId)}.${encodeURIComponent(scope)}` : null;
export const clearFormDraft = (storage, userId, scope) => {
  const key = formDraftKey(userId, scope);
  if (!key) return false;
  try { storage.removeItem(key); return true; } catch { return false; }
};
// La inspección permite al hook ofrecer una elección, sin aplicar ni borrar una copia anterior.
export const inspectFormDraft = (storage, userId, scope, { fingerprint = null, now = Date.now() } = {}) => {
  const key = formDraftKey(userId, scope);
  if (!key) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const entry = raw.length <= MAX_BYTES ? JSON.parse(raw) : null;
    if (entry?.version !== VERSION || !entry.form || Array.isArray(entry.form) || typeof entry.form !== 'object'
      || !Number.isFinite(entry.savedAt) || now - entry.savedAt > MAX_AGE || entry.savedAt > now + 60_000) {
      clearFormDraft(storage, userId, scope); return null;
    }
    return { form: entry.form, conflict: entry.fingerprint !== fingerprint };
  } catch { return null; }
};
export const readFormDraft = (storage, userId, scope, options) => {
  const entry = inspectFormDraft(storage, userId, scope, options);
  return entry && !entry.conflict ? entry.form : null;
};
export const saveFormDraft = (storage, userId, scope, form, { fingerprint = null, now = Date.now() } = {}) => {
  const key = formDraftKey(userId, scope);
  if (!key) return false;
  try {
    const raw = JSON.stringify({ version: VERSION, fingerprint, savedAt: now, form });
    if (raw.length > MAX_BYTES) return false;
    storage.setItem(key, raw); return true;
  } catch { return false; }
};
// Solo campos del formulario; nunca claves adicionales de una entrada manipulada.
export const restoreFormFields = (initial, saved) => Object.fromEntries(Object.entries(initial).map(([key, value]) => {
  const candidate = saved?.[key];
  const numericText = (typeof value === 'string' && typeof candidate === 'number' && Number.isFinite(candidate))
    || (typeof value === 'number' && typeof candidate === 'string' && (candidate === '' || Number.isFinite(Number(candidate))));
  const compatible = candidate !== undefined && (numericText || value === null || (Array.isArray(value) ? Array.isArray(candidate)
    : typeof candidate === typeof value && !Array.isArray(candidate)));
  return [key, compatible ? candidate : value];
}));
// Un valor que calculó la pantalla sobre un formulario que nadie ha tocado ni recuperado es parte del punto
// de partida, no un cambio de la persona: no crea borrador.
export const isAutomaticBaseline = ({ form, baseline, saved = false, restored = false, conflict = false } = {}) =>
  !saved && !restored && !conflict && JSON.stringify(form) === JSON.stringify(baseline);
