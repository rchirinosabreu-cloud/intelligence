// Source text is evidence, never instructions or an implicit permission grant.
export const canUseBria = (user) => user?.isActive !== false
  && ['ADMIN', 'PROJECT_MANAGER'].includes(user?.role)
  && user?.modulePermissions?.bria === true;

export const sourceVisible = (source, user) => canUseBria(user) && source?.status === 'indexed'
  && (user.role === 'ADMIN' || (source.allowedUserIds || []).includes(user.userId || user.id));

const safeLocator = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['drive.google.com', 'docs.google.com', 'mail.google.com'].includes(url.hostname) ? url.href : null;
  } catch { return null; }
};
export const publicEvidence = (source, today = new Date().toISOString().slice(0, 10)) => ({
  id: source.id, kind: source.kind, title: source.title,
  date: source.date || null, url: safeLocator(source.locator),
  excerpt: String(source.excerpt || source.body || '').slice(0, 1800),
  authority: source.confirmed === true && source.validFrom && source.validTo
    && source.validFrom <= today && source.validTo >= today
    ? 'Confirmada para este periodo' : 'Referencia documental; vigencia por confirmar'
});

export const SIGNAL_STATES = ['OPEN', 'REVIEWED', 'RESOLVED', 'DISMISSED', 'ARCHIVED'];
export const reconcileSignals = (previous, observations) => {
  const rows = new Map(previous.map((row) => [row.id, row]));
  for (const observation of observations) {
    const old = rows.get(observation.id);
    rows.set(observation.id, {
      ...observation,
      status: old?.status === 'ARCHIVED' ? 'ARCHIVED'
        : old?.evidenceVersion === observation.evidenceVersion ? old.status : 'OPEN',
      updatedAt: old?.evidenceVersion === observation.evidenceVersion ? old.updatedAt : new Date().toISOString()
    });
  }
  // Missing in a partial scan does not mean resolved.
  return [...rows.values()];
};
export const changeSignalState = (rows, id, status) => {
  if (!SIGNAL_STATES.includes(status)) throw new Error('Estado de seguimiento inválido.');
  if (!rows.some((row) => row.id === id)) throw new Error('No encontramos ese hallazgo.');
  return rows.map((row) => row.id === id ? { ...row, status, updatedAt: new Date().toISOString() } : row);
};
