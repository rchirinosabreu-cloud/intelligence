export const getDayEventDisplay = (events = [], expanded = false, limit = 4) => ({
  visible: expanded ? events : events.slice(0, limit),
  overflow: expanded ? 0 : Math.max(0, events.length - limit)
});

export const summarizeGoogleSyncResults = (results = []) => results.reduce((summary, result) => ({
  imported: summary.imported + (result.imported || 0),
  updated: summary.updated + (result.updated || 0),
  skipped: summary.skipped + (result.skipped || 0),
  failed: summary.failed + (result.connected === false ? 1 : 0)
}), { imported: 0, updated: 0, skipped: 0, failed: 0 });

export const getGoogleConnectionHealth = (connection, now = new Date()) => {
  if ((connection.errorCount || 0) > 0) return { status: 'error', label: 'Con errores' };
  const syncedAt = connection.lastSyncedAt ? new Date(connection.lastSyncedAt).getTime() : 0;
  const channelExpiresAt = connection.channelExpiresAt ? new Date(connection.channelExpiresAt).getTime() : 0;
  if (!syncedAt || now.getTime() - syncedAt > 5 * 60 * 1000 || channelExpiresAt <= now.getTime()) {
    return { status: 'delayed', label: 'Actualizacion retrasada' };
  }
  return { status: 'healthy', label: 'Actualizado' };
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const addExternalEmailTags = (currentEmails = [], rawValue = '') => {
  const candidates = rawValue
    .split(/[;,\n]/)
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
  const valid = candidates.filter(email => EMAIL_PATTERN.test(email));

  return {
    emails: [...new Set([...currentEmails.map(email => email.toLowerCase()), ...valid])],
    invalid: candidates.filter(email => !EMAIL_PATTERN.test(email))
  };
};

export const normalizeCalendarDescription = (description = '') => description
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\n{3,}/g, '\n\n')
  .trim();
