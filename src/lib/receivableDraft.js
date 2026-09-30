// Borrador de los formularios de cartera: emitir, corregir y «Nueva cuenta por cobrar».
//
// Por qué (Rodny, 30 de septiembre de 2026): «estaba emitiendo una cuenta de cobro e hice
// click afuera, y se me borró todo». Lo escrito se guarda mientras se escribe, por persona y
// por cuenta, y vuelve al reabrir. Solo se limpia cuando el servidor confirma el guardado.
// Nada aquí habla con el servidor.

export const RECEIVABLE_DRAFT_VERSION = 1;
export const MAX_RECEIVABLE_DRAFTS = 20;
export const RECEIVABLE_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const receivableDraftKey = (userId) => `brain.financial.receivableDrafts.v${RECEIVABLE_DRAFT_VERSION}.${userId || 'anon'}`;

// Un hueco por formulario: la cuenta nueva tiene uno; emitir y corregir, uno por obligación.
export const receivableDraftSlot = (mode, receivableId) => (mode === 'new' ? 'new' : `${mode}:${receivableId}`);

// Lo que identifica la versión de una obligación que se estaba editando. Si alguien la emite
// o la corrige mientras tanto, el borrador escrito sobre la versión anterior ya no sirve.
export const receivableDraftFingerprint = (debt) => (debt ? JSON.stringify([
    debt.number ?? null,
    debt.issuedAt ?? null,
    debt.amount ?? null,
    debt.currency || 'COP',
    debt.concept ?? null,
    (debt.items || []).map((item) => [item.description ?? '', item.amount ?? null])
]) : null);

const readAll = (storage, userId) => {
    if (!storage) return null;
    let raw;
    try { raw = storage.getItem(receivableDraftKey(userId)); } catch { return null; }
    if (!raw) return { drafts: {} };
    try {
        const parsed = JSON.parse(raw);
        if (parsed?.version === RECEIVABLE_DRAFT_VERSION && parsed.drafts && typeof parsed.drafts === 'object') return parsed;
    } catch { /* entrada corrupta: se reemplaza */ }
    return { drafts: {} };
};

const writeAll = (storage, userId, drafts) => {
    const key = receivableDraftKey(userId);
    try {
        if (Object.keys(drafts).length === 0) storage.removeItem(key);
        else storage.setItem(key, JSON.stringify({ version: RECEIVABLE_DRAFT_VERSION, drafts }));
    } catch { /* cuota llena o almacenamiento bloqueado: el formulario sigue sin borrador */ }
};

const isFresh = (entry, now) => {
    const savedAt = Date.parse(entry?.savedAt);
    return Number.isFinite(savedAt) && now.getTime() - savedAt <= RECEIVABLE_DRAFT_MAX_AGE_MS;
};

// Devuelve { form, savedAt } o null. Un borrador caducado o de otra versión de la cuenta se borra.
export const readReceivableDraft = (storage, userId, slot, { fingerprint = null, now = new Date() } = {}) => {
    const all = readAll(storage, userId);
    const entry = all?.drafts?.[slot];
    if (!entry) return null;
    if (!entry.form || !isFresh(entry, now) || (entry.fingerprint ?? null) !== (fingerprint ?? null)) {
        const { [slot]: _dropped, ...rest } = all.drafts;
        writeAll(storage, userId, rest);
        return null;
    }
    return { form: entry.form, savedAt: entry.savedAt };
};

// Guarda lo escrito. Si el formulario está igual que al abrirlo, no hay nada que recuperar.
export const saveReceivableDraft = (storage, userId, slot, { form, baseline, fingerprint = null, now = new Date() }) => {
    const all = readAll(storage, userId);
    if (!all) return;
    const drafts = Object.fromEntries(Object.entries(all.drafts).filter(([, entry]) => isFresh(entry, now)));
    if (!form || JSON.stringify(form) === JSON.stringify(baseline)) {
        delete drafts[slot];
    } else {
        drafts[slot] = { savedAt: now.toISOString(), fingerprint: fingerprint ?? null, form };
    }
    const kept = Object.entries(drafts)
        .sort(([, a], [, b]) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
        .slice(0, MAX_RECEIVABLE_DRAFTS);
    writeAll(storage, userId, Object.fromEntries(kept));
};

export const clearReceivableDraft = (storage, userId, slot) => {
    const all = readAll(storage, userId);
    if (!all || !all.drafts[slot]) return;
    const { [slot]: _dropped, ...rest } = all.drafts;
    writeAll(storage, userId, rest);
};
