import crypto from 'node:crypto';
import { withCalendarSyncLock, assertCalendarSyncLock } from './calendarSyncLock.js';

const VERSION = 1;
const stale = () => Object.assign(new Error('El inventario cambió; genera y revisa un nuevo plan antes de reparar.'), { code: 'CALENDAR_REPAIR_STALE' });
const invalid = message => Object.assign(new Error(message), { code: 'CALENDAR_REPAIR_INVALID' });
const normalize = value => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, normalize(value[key])]));
  return value;
};
const serialize = value => JSON.stringify(normalize(value));
const copyMetadata = new Set(['id', 'googleConnectionId', 'googleCalendarId', 'googleEtag', 'googleHtmlLink', 'googleLastSyncedAt', 'googleUpdatedAt', 'createdAt', 'updatedAt', 'googleLinks']);
const content = event => Object.fromEntries(Object.entries(event).filter(([key]) => !copyMetadata.has(key)));
const fingerprint = events => crypto.createHash('sha256').update(serialize([...events].sort((a, b) => a.id.localeCompare(b.id)).map(event => ({ ...event, googleLinks: [...(event.googleLinks || [])].sort((a, b) => a.id.localeCompare(b.id)) })))).digest('hex');
const idsFor = group => [group.canonicalId, ...group.duplicateIds].sort();
const readEvents = (db, ids) => db.operationalEvent.findMany({ where: { id: { in: ids } }, include: { googleLinks: true }, orderBy: { id: 'asc' } });

function rejectReason(events) {
  if (events.some(event => event.source !== 'GOOGLE' || event.googleSyncStatus !== 'SYNCED' || event.googleCancelled || event.googleSyncError || event.requestId || event.requestHash || event.googleNextRetryAt || event.googleSyncAttempts > 0)) return 'UNSAFE_STATE';
  if (events.some(event => !event.googleEventId || !event.googleICalUID || !Number.isFinite(new Date(event.startAt).getTime()) || new Date(event.endAt) <= new Date(event.startAt))) return 'INVALID_IDENTITY_OR_RANGE';
  if (new Set(events.map(event => event.googleEventId)).size !== 1) return 'DIFFERENT_GOOGLE_IDS';
  if (new Set(events.map(event => serialize([event.recurrence, event.recurrenceEnd, event.googleRecurrence, event.googleRecurringEventId, event.googleOriginalStartAt]))).size !== 1) return 'DIFFERENT_RECURRENCE';
  if (new Set(events.map(event => serialize(content(event)))).size !== 1) return 'DIFFERENT_CONTENT';
  const links = events.flatMap(event => event.googleLinks || []);
  if (events.some(event => !event.googleLinks?.length || event.googleLinks.some(link => link.operationalEventId !== event.id || link.googleEventId !== event.googleEventId || link.googleICalUID !== event.googleICalUID))) return 'UNVERIFIED_LINKS';
  if (new Set(links.map(link => link.id)).size !== links.length) return 'DUPLICATE_LINK_ID';
  return null;
}

// This is deliberately stricter than visual deduplication: uncertain rows are
// reported for manual review and never merged by title or iCalUID alone.
export function planCalendarDuplicateRepair(events = []) {
  if (!Array.isArray(events) || new Set(events.map(event => event.id)).size !== events.length) throw invalid('El inventario debe contener IDs únicos.');
  const candidates = new Map();
  for (const event of events) {
    if (!event.googleICalUID) continue;
    const key = serialize([event.googleICalUID, event.startAt, event.endAt]);
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key).push(event);
  }
  const groups = [];
  const rejected = [];
  for (const candidate of candidates.values()) {
    if (candidate.length < 2) continue;
    const eventIds = candidate.map(event => event.id).sort();
    const reason = rejectReason(candidate);
    if (reason) { rejected.push({ eventIds, reason }); continue; }
    const ordered = [...candidate].sort((left, right) => Number(right.googleLinks.some(link => link.isOrganizer)) - Number(left.googleLinks.some(link => link.isOrganizer)) || new Date(left.createdAt) - new Date(right.createdAt) || left.id.localeCompare(right.id));
    const canonicalId = ordered[0].id;
    const duplicates = ordered.slice(1).sort((left, right) => left.id.localeCompare(right.id));
    groups.push({ canonicalId, duplicateIds: duplicates.map(event => event.id), fingerprint: fingerprint(candidate),
      linkMoves: duplicates.flatMap(event => event.googleLinks.map(link => ({ linkId: link.id, fromEventId: event.id, toEventId: canonicalId }))).sort((a, b) => a.linkId.localeCompare(b.linkId)) });
  }
  groups.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
  rejected.sort((a, b) => a.eventIds[0].localeCompare(b.eventIds[0]));
  return { kind: 'calendar-duplicate-repair-plan', version: VERSION, eventCount: events.length, eligibleGroupCount: groups.length,
    mergeCount: groups.reduce((sum, group) => sum + group.duplicateIds.length, 0), rejectedGroupCount: rejected.length, groups, rejected };
}

function validateGroups(value, kind) {
  if (value?.kind !== kind || value.version !== VERSION || !Array.isArray(value.groups)) throw invalid('Formato de plan o recibo no válido.');
  const allIds = [];
  for (const group of value.groups) {
    if (typeof group.canonicalId !== 'string' || !Array.isArray(group.duplicateIds) || !group.duplicateIds.length || !Array.isArray(group.linkMoves)) throw invalid('Grupo de reparación no válido.');
    allIds.push(...idsFor(group));
    if (!/^[a-f0-9]{64}$/.test(group.fingerprint || '')) throw invalid('Falta la huella del inventario.');
    if (new Set(group.linkMoves.map(move => move.linkId)).size !== group.linkMoves.length || group.linkMoves.some(move => typeof move.linkId !== 'string' || !group.duplicateIds.includes(move.fromEventId) || move.toEventId !== group.canonicalId)) throw invalid('Los vínculos del recibo deben pertenecer al grupo verificado.');
    if (group.duplicateIds.some(id => !group.linkMoves.some(move => move.fromEventId === id))) throw invalid('Faltan los vínculos originales de un duplicado.');
  }
  if (new Set(allIds).size !== allIds.length) throw invalid('Un evento pertenece a más de un grupo de reparación.');
}

async function moveLinks(tx, events, moves, reverse = false) {
  const links = new Map(events.flatMap(event => event.googleLinks || []).map(link => [link.id, link]));
  for (const move of moves) {
    assertCalendarSyncLock();
    const link = links.get(move.linkId);
    const fromId = reverse ? move.toEventId : move.fromEventId;
    const toId = reverse ? move.fromEventId : move.toEventId;
    if (!link || link.operationalEventId !== fromId) throw stale();
    const changed = await tx.googleCalendarEventLink.updateMany({ where: { id: link.id, operationalEventId: fromId, updatedAt: link.updatedAt },
      data: { operationalEventId: toId, updatedAt: link.updatedAt } });
    if (changed.count !== 1) throw stale();
  }
}

export async function applyCalendarDuplicateRepair(plan, { db, lock = withCalendarSyncLock, persistReceipt = async () => {} } = {}) {
  validateGroups(plan, 'calendar-duplicate-repair-plan');
  if (!db) throw invalid('La conexión de base de datos es obligatoria.');
  return lock(() => db.$transaction(async tx => {
    const checked = [];
    for (const group of plan.groups) {
      assertCalendarSyncLock();
      const events = await readEvents(tx, idsFor(group));
      const fresh = planCalendarDuplicateRepair(events).groups;
      if (events.length !== idsFor(group).length || fresh.length !== 1 || serialize(fresh[0]) !== serialize(group)) throw stale();
      checked.push({ group, events });
    }
    const receipt = { kind: 'calendar-duplicate-repair-receipt', version: VERSION, mergedCount: plan.groups.reduce((sum, group) => sum + group.duplicateIds.length, 0), movedLinkCount: 0, groups: [] };
    for (const { group, events } of checked) {
      await moveLinks(tx, events, group.linkMoves);
      for (const duplicateId of group.duplicateIds) {
        assertCalendarSyncLock();
        const event = events.find(row => row.id === duplicateId);
        const changed = await tx.operationalEvent.updateMany({ where: { id: duplicateId, updatedAt: event.updatedAt, source: 'GOOGLE', googleSyncStatus: 'SYNCED', googleCancelled: false },
          data: { googleSyncStatus: 'MERGED', googleCancelled: true } });
        if (changed.count !== 1) throw stale();
      }
      receipt.movedLinkCount += group.linkMoves.length;
      receipt.groups.push({ ...group, appliedFingerprint: fingerprint(await readEvents(tx, idsFor(group))) });
    }
    assertCalendarSyncLock();
    // Persist the recovery receipt before committing. Failure to write it must
    // roll the repair back. A receipt alone is not proof that commit succeeded.
    await persistReceipt(receipt);
    return receipt;
  }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 30000 }));
}

export async function revertCalendarDuplicateRepair(receipt, { db, lock = withCalendarSyncLock } = {}) {
  validateGroups(receipt, 'calendar-duplicate-repair-receipt');
  if (!db) throw invalid('La conexión de base de datos es obligatoria.');
  return lock(() => db.$transaction(async tx => {
    const checked = [];
    for (const group of receipt.groups) {
      assertCalendarSyncLock();
      const events = await readEvents(tx, idsFor(group));
      if (events.length !== idsFor(group).length || fingerprint(events) !== group.appliedFingerprint) throw stale();
      if (group.duplicateIds.some(id => { const event = events.find(row => row.id === id); return event.source !== 'GOOGLE' || event.googleSyncStatus !== 'MERGED' || !event.googleCancelled; })) throw stale();
      checked.push({ group, events });
    }
    for (const { group, events } of checked) {
      await moveLinks(tx, events, group.linkMoves, true);
      for (const id of group.duplicateIds) {
        assertCalendarSyncLock();
        const event = events.find(row => row.id === id);
        const changed = await tx.operationalEvent.updateMany({ where: { id, updatedAt: event.updatedAt, googleSyncStatus: 'MERGED', googleCancelled: true },
          data: { googleSyncStatus: 'SYNCED', googleCancelled: false } });
        if (changed.count !== 1) throw stale();
      }
    }
    assertCalendarSyncLock();
    return { kind: 'calendar-duplicate-repair-reversal', version: VERSION, restoredCount: receipt.groups.reduce((sum, group) => sum + group.duplicateIds.length, 0), groups: receipt.groups.map(({ canonicalId, duplicateIds }) => ({ canonicalId, duplicateIds })) };
  }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 30000 }));
}
