// Draft of the movement form (Financiero → Registrar/Editar movimiento).
//
// Why: the session token lasts 12 h and a 401 sends the browser to /login with a full navigation;
// a deploy can also reload the page. Someone filling a long movement lost everything. The form
// is saved as they type, per person, and restored the next time they open it (Rodny, 2026-09-28).
//
// What is stored: the eleven form fields, the breakdown lines and, for an edit, which movement and
// which version of it. Pending files cannot be serialized: only their names are kept, so the person
// can be told what to attach again. Nothing here talks to the server.

export const MOVEMENT_DRAFT_VERSION = 1;

export const movementDraftKey = (userId) => `brain.financial.movementDraft.v${MOVEMENT_DRAFT_VERSION}.${userId || 'anon'}`;

const text = (value) => String(value ?? '').trim();

// Type, date, category and scenario have defaults; changing only those is not something worth recovering.
const MEANINGFUL_FIELDS = ['amount', 'description', 'counterparty', 'reference', 'notes', 'clientId', 'accountId'];

export const buildMovementDraft = ({ form = {}, allocations = [], pendingFiles = [], record = null, now = new Date() }) => ({
    version: MOVEMENT_DRAFT_VERSION,
    savedAt: now.toISOString(),
    mode: record?.id ? 'edit' : 'create',
    recordId: record?.id || null,
    recordUpdatedAt: record?.updatedAt || null,
    recordLabel: record ? (record.description || record.sourceLabel || null) : null,
    form: { ...form },
    allocations: allocations.map((line) => ({ amount: line.amount, category: line.category, description: line.description })),
    pendingFileNames: pendingFiles.map((file) => ({ name: file.name, size: Number(file.size) || 0 }))
});

export const hasMeaningfulMovementDraft = (draft) => {
    if (!draft || draft.version !== MOVEMENT_DRAFT_VERSION || !draft.form) return false;
    if (MEANINGFUL_FIELDS.some((field) => text(draft.form[field]))) return true;
    if (Array.isArray(draft.allocations) && draft.allocations.length > 0) return true;
    return Array.isArray(draft.pendingFileNames) && draft.pendingFileNames.length > 0;
};

// Storage access never throws at the form: private windows and full quotas just mean "no draft".
export const readMovementDraft = (storage, userId) => {
    if (!storage) return null;
    const key = movementDraftKey(userId);
    let raw;
    try { raw = storage.getItem(key); } catch { return null; }
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (hasMeaningfulMovementDraft(parsed)) return parsed;
    } catch { /* corrupt entry: drop it below */ }
    try { storage.removeItem(key); } catch { /* nothing else to do */ }
    return null;
};

export const writeMovementDraft = (storage, userId, draft) => {
    if (!storage) return;
    const key = movementDraftKey(userId);
    try {
        if (hasMeaningfulMovementDraft(draft)) storage.setItem(key, JSON.stringify(draft));
        else storage.removeItem(key);
    } catch { /* quota or blocked storage: the form keeps working without a draft */ }
};

export const clearMovementDraft = (storage, userId) => {
    if (!storage) return;
    try { storage.removeItem(movementDraftKey(userId)); } catch { /* blocked storage */ }
};

// An edit draft belongs to one movement in one version: if someone else saved it meanwhile, the draft is stale.
export const draftMatchesRecord = (draft, record) => Boolean(
    draft && record && draft.mode === 'edit' && draft.recordId === record.id && (draft.recordUpdatedAt || null) === (record.updatedAt || null)
);
