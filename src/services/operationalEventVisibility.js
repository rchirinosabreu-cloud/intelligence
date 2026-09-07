const HIDDEN_EVENT_STATUSES = ['DELETED', 'MERGED', 'PENDING_DELETE'];

export const isVisibleOperationalEvent = event => !event.googleCancelled && !HIDDEN_EVENT_STATUSES.includes(event.googleSyncStatus);

// SQL NOT IN excludes NULL; legacy events with no sync status remain visible.
export const getVisibleOperationalEventWhere = () => ({
  googleCancelled: false,
  OR: [{ googleSyncStatus: null }, { googleSyncStatus: { notIn: HIDDEN_EVENT_STATUSES } }]
});
