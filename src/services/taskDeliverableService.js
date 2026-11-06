import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { getPlatformStorage, assertPlatformStorageConfigured } from './platformStorageService.js';
import { recognitionTransaction } from './recognitionService.js';
import { getJwtSecret } from '../config/security.js';
import { TASK_PRIVACY_SELECT } from '../lib/taskPrivacy.js';
import { TASK_DELIVERABLE_LIMITS, deliverableActorId, deliverableError, deliverableMutationInput, taskDeliverableAccess, validateDeliverableFiles, validateDeliverablePrefix } from '../lib/taskDeliverables.js';

const pendingLifetime = 24 * 60 * 60 * 1000;
const ticketAudience = 'task-deliverable-upload-v1';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const metadata = file => ({ id: file.id, name: file.name, mimeType: file.mimeType, size: Number(file.size), position: file.position,
  createdAt: file.createdAt, authorName: file.authorName });
const manifest = files => files.map(file => ({ ...metadata(file), createdAt: new Date(file.createdAt).toISOString() }));
const receipt = (event, duplicate = false) => ({ requestId: event.requestId, revision: event.revision, action: event.action, duplicate });
const selectTask = { id: true, contentItemId: true, deliverableRevision: true, ...TASK_PRIVACY_SELECT };

export function createTaskDeliverableService({ db = prisma, storage, storageForArea = getPlatformStorage, assertStorageConfigured = assertPlatformStorageConfigured, secret, transaction, now = () => new Date() } = {}) {
  const execute = transaction || (work => recognitionTransaction(db, work));
  const areaOf = value => {
    const area = value ?? 'LEGACY';
    if (!['LEGACY', 'PLATFORM'].includes(area)) throw deliverableError('El almacenamiento de esta entrega no está disponible.', 503);
    return area;
  };
  const storageAt = area => storage || storageForArea(areaOf(area));
  const newStorage = () => { if (!storage) assertStorageConfigured(); return storageAt('PLATFORM'); };
  const signingSecret = () => secret || getJwtSecret();
  const listFiles = (client, taskId) => client.taskDeliverable.findMany({ where: { taskId }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });

  async function target(client, taskId, actor, write = false) {
    const task = await client.task.findUnique({ where: { id: taskId }, select: selectTask });
    if (!task) throw deliverableError('Tarea no encontrada.', 404);
    const access = taskDeliverableAccess(task, actor);
    if (!access.canRead) throw deliverableError('No tienes acceso a esta tarea.', 403);
    if (task.contentItemId) throw Object.assign(deliverableError('La entrega de esta tarea se guarda en su pieza de parrilla.', 409, 'TASK_DELIVERABLE_LINKED_PIECE'), { contentItemId: task.contentItemId });
    if (write && !access.canUpload) throw deliverableError(access.writeBlockedReason, 403);
    return { task, access };
  }

  async function get(taskId, actor, confirmedReceipt) {
    return execute(async tx => {
    const { task, access } = await target(tx, taskId, actor);
    const [files, events] = await Promise.all([listFiles(tx, taskId), tx.taskDeliverableEvent.findMany({ where: { taskId }, orderBy: { revision: 'desc' } })]);
    const base = `/api/tasks/${encodeURIComponent(taskId)}/deliverables`;
    return { taskId, revision: task.deliverableRevision, ...access, limits: TASK_DELIVERABLE_LIMITS,
      files: files.map(file => ({ ...metadata(file), fileUrl: `${base}/${encodeURIComponent(file.id)}/file`, downloadUrl: `${base}/${encodeURIComponent(file.id)}/download` })),
      history: events.map(event => ({ id: event.id, revision: event.revision, action: event.action, at: event.createdAt, actorName: event.actorName,
        cycleId: event.cycleId, files: event.files, previousFiles: event.previousFiles })),
      ...(confirmedReceipt ? { receipt: confirmedReceipt } : {}) };
    });
  }

  async function prior(client, taskId, actor, change, requestHash) {
    const event = await client.taskDeliverableEvent.findUnique({ where: { taskId_requestId: { taskId, requestId: change.requestId } } });
    if (!event) return null;
    if (event.actorId !== deliverableActorId(actor) || event.requestHash !== requestHash) throw deliverableError('Ese identificador ya se utilizó para otra entrega. Actualiza la tarea.', 409, 'TASK_DELIVERABLE_REQUEST_CONFLICT');
    return event;
  }

  function checkRevision(task, change) {
    if (task.deliverableRevision !== change.expectedRevision) throw deliverableError('La entrega cambió en otra sesión. Revisa la versión actual antes de reemplazarla.', 409, 'TASK_DELIVERABLE_STALE');
  }

  async function enqueue(client, taskId, keys, at = now(), area = 'PLATFORM') {
    const storageArea = areaOf(area);
    for (const storageKey of keys) await client.taskDeliverableCleanup.upsert({ where: { storageArea_storageKey: { storageArea, storageKey } },
      create: { id: randomUUID(), taskId, storageArea, storageKey, nextAttemptAt: at }, update: { nextAttemptAt: at } });
  }

  async function release(taskId, keys, area = 'PLATFORM') {
    // A signed staging PUT remains usable until it expires. Its queue deadline stays beyond that expiry.
    const finalKeys = keys.filter(key => key.startsWith(`task-deliverables/${taskId}/files/`));
    if (!finalKeys.length) return;
    // Every key was queued BEFORE its upload/copy. If the database is unavailable, that earlier row still retries.
    try { await db.taskDeliverableCleanup.updateMany({ where: { taskId, storageArea: areaOf(area), storageKey: { in: finalKeys } }, data: { nextAttemptAt: now() } }); }
    catch { /* Durable pending rows remain eligible after their original deadline. */ }
  }

  async function preflight(taskId, actor, change, requestHash) {
    const { task } = await target(db, taskId, actor, true);
    const event = await prior(db, taskId, actor, change, requestHash);
    if (event) return event;
    checkRevision(task, change);
    return null;
  }

  async function commit(taskId, actor, change, requestHash, incoming, order) {
    return execute(async tx => {
      const { task } = await target(tx, taskId, actor, true);
      const existing = await prior(tx, taskId, actor, change, requestHash);
      if (existing) return receipt(existing, true);
      checkRevision(task, change);
      const previous = await listFiles(tx, taskId);
      const revision = task.deliverableRevision + 1;
      const actorId = deliverableActorId(actor);
      const actorName = (await tx.user?.findUnique?.({ where: { id: actorId }, select: { name: true } }))?.name || actor.name || 'Persona';
      const cycle = await tx.taskWorkCycle.findFirst({ where: { taskId }, orderBy: { sequence: 'desc' }, select: { id: true } });
      let action, files;
      if (order) {
        if (!Array.isArray(order) || !previous.length || order.length !== previous.length || new Set(order).size !== order.length || order.some(id => !previous.some(file => file.id === id))) throw deliverableError('El orden debe incluir todos los archivos vigentes, sin repetirlos.');
        files = order.map((id, position) => ({ ...previous.find(file => file.id === id), position }));
        action = 'REORDERED';
      } else {
        files = incoming.map((file, position) => ({ ...file, taskId, position, authorId: actorId, authorName: actorName, createdAt: now() }));
        action = previous.length ? 'REPLACED' : 'DELIVERED';
      }
      const changed = await tx.task.updateMany({ where: { id: taskId, deliverableRevision: change.expectedRevision }, data: { deliverableRevision: revision } });
      if (changed.count !== 1) throw deliverableError('La entrega cambió en otra sesión.', 409, 'TASK_DELIVERABLE_STALE');
      if (order) {
        for (const file of files) await tx.taskDeliverable.update({ where: { id: file.id }, data: { position: file.position } });
      } else {
        for (const file of previous) await enqueue(tx, taskId, [file.storageKey], now(), file.storageArea ?? 'LEGACY');
        await tx.taskDeliverable.deleteMany({ where: { taskId } });
        await tx.taskDeliverable.createMany({ data: files.map(file => ({ ...file, size: BigInt(file.size) })) });
        for (const file of files) await tx.taskDeliverableCleanup.deleteMany({ where: { taskId, storageArea: areaOf(file.storageArea), storageKey: file.storageKey } });
      }
      const event = await tx.taskDeliverableEvent.create({ data: { id: randomUUID(), taskId, requestId: change.requestId, requestHash,
        revision, action, actorId, actorName, cycleId: cycle?.id || null, files: manifest(files), previousFiles: manifest(previous) } });
      return receipt(event);
    });
  }

  async function replace(taskId, actor, files, input) {
    const change = deliverableMutationInput(input), descriptors = validateDeliverableFiles(files);
    files.forEach((file, index) => validateDeliverablePrefix(file.buffer?.subarray(0, 512), descriptors[index]));
    const requestHash = hash({ operation: 'multipart', files: descriptors.map((file, index) => ({ ...file, digest: createHash('sha256').update(files[index].buffer).digest('hex') })) });
    const duplicate = await preflight(taskId, actor, change, requestHash);
    if (duplicate) return get(taskId, actor, receipt(duplicate, true));
    const selectedStorage = newStorage();
    const incoming = descriptors.map(file => ({ ...file, id: randomUUID(), storageArea: 'PLATFORM', storageKey: `task-deliverables/${taskId}/files/${randomUUID()}` }));
    const keys = incoming.map(file => file.storageKey);
    await enqueue(db, taskId, keys, new Date(now().getTime() + pendingLifetime));
    try {
      for (let index = 0; index < files.length; index++) await selectedStorage.putS3Object({ key: incoming[index].storageKey, body: files[index].buffer, contentType: descriptors[index].mimeType });
      const result = await commit(taskId, actor, change, requestHash, incoming);
      if (result.duplicate) await release(taskId, keys);
      return get(taskId, actor, result);
    } catch (error) { await release(taskId, keys); throw error; }
  }

  async function prepare(taskId, actor, files, input) {
    const change = deliverableMutationInput(input), descriptors = validateDeliverableFiles(files, 'direct');
    const requestHash = hash({ operation: 'direct', files: descriptors });
    const duplicate = await preflight(taskId, actor, change, requestHash);
    if (duplicate) return { ...await get(taskId, actor, receipt(duplicate, true)), uploads: [], alreadyCommitted: true };
    const selectedStorage = newStorage();
    const pending = descriptors.map(file => ({ ...file, key: `task-deliverables/${taskId}/staging/${randomUUID()}` }));
    await enqueue(db, taskId, pending.map(file => file.key), new Date(now().getTime() + 20 * 60_000));
    try {
      const uploads = [];
      for (const file of pending) {
        const token = jwt.sign({ taskId, actorId: deliverableActorId(actor), requestId: change.requestId, revision: change.expectedRevision, requestHash, storageArea: 'PLATFORM', file }, signingSecret(), { algorithm: 'HS256', expiresIn: 15 * 60, audience: ticketAudience });
        const signed = await selectedStorage.createSignedUpload({ key: file.key, contentType: file.mimeType, expiresIn: 15 * 60 });
        uploads.push({ ...file, token, url: signed.url });
      }
      return { uploads, expectedRevision: change.expectedRevision, requestId: change.requestId };
    } catch (error) { await release(taskId, pending.map(file => file.key)); throw error; }
  }

  async function confirm(taskId, actor, uploads, input) {
    const change = deliverableMutationInput(input);
    if (!Array.isArray(uploads) || !uploads.length || uploads.length > TASK_DELIVERABLE_LIMITS.maxFiles) throw deliverableError('Selecciona entre 1 y 20 archivos.');
    const tickets = uploads.map(upload => {
      let ticket;
      try { ticket = jwt.verify(upload?.token, signingSecret(), { algorithms: ['HS256'], audience: ticketAudience }); }
      catch { throw deliverableError('El permiso de subida no es válido o venció. Vuelve a seleccionar los archivos.', 400, 'TASK_DELIVERABLE_TICKET_INVALID'); }
      if (ticket.taskId !== taskId || ticket.actorId !== deliverableActorId(actor)) throw deliverableError('Ese permiso de subida pertenece a otra tarea o persona.', 403);
      if (ticket.requestId !== change.requestId || ticket.revision !== change.expectedRevision || !ticket.file?.key?.startsWith(`task-deliverables/${taskId}/staging/`)) throw deliverableError('La subida no coincide con la entrega solicitada.');
      return ticket;
    });
    const descriptors = validateDeliverableFiles(tickets.map(ticket => ticket.file), 'direct');
    const storageArea = areaOf(tickets[0].storageArea);
    if (tickets.some(ticket => areaOf(ticket.storageArea) !== storageArea)) throw deliverableError('La selección mezcla destinos de almacenamiento.');
    const requestHash = hash({ operation: 'direct', files: descriptors });
    if (new Set(tickets.map(ticket => ticket.file.key)).size !== tickets.length || tickets.some(ticket => ticket.requestHash !== requestHash)) throw deliverableError('Confirma el conjunto completo, sin repetir ni mezclar subidas.');
    const stagingKeys = tickets.map(ticket => ticket.file.key), copiedKeys = [];
    try {
      const duplicate = await preflight(taskId, actor, change, requestHash);
      if (duplicate) return get(taskId, actor, receipt(duplicate, true));
      if (storageArea !== 'PLATFORM') throw deliverableError('Este permiso de subida es anterior al cambio de almacenamiento. Prepara la entrega de nuevo; la anterior se conserva.', 409);
      const selectedStorage = newStorage();
      const incoming = [];
      for (const ticket of tickets) {
        const object = await selectedStorage.headS3Object(ticket.file.key);
        if (!object || object.size !== ticket.file.size || object.mimeType !== ticket.file.mimeType || !object.etag) throw deliverableError('Uno de los archivos no terminó de subir o cambió. El conjunto anterior sigue vigente.');
        validateDeliverableFiles([{ ...ticket.file, size: object.size, mimeType: object.mimeType }], 'direct');
        validateDeliverablePrefix(await selectedStorage.readS3ObjectPrefix(ticket.file.key, 512, { etag: object.etag }), ticket.file);
        const storageKey = `task-deliverables/${taskId}/files/${randomUUID()}`;
        await enqueue(db, taskId, [storageKey], new Date(now().getTime() + pendingLifetime), storageArea); copiedKeys.push(storageKey);
        await selectedStorage.copyS3Object(ticket.file.key, storageKey, { etag: object.etag });
        incoming.push({ ...ticket.file, key: undefined, id: randomUUID(), storageKey, storageArea });
      }
      const result = await commit(taskId, actor, change, requestHash, incoming.map(({ key: _key, ...file }) => file));
      if (result.duplicate) await release(taskId, copiedKeys, storageArea);
      await release(taskId, stagingKeys, storageArea);
      return get(taskId, actor, result);
    } catch (error) {
      await release(taskId, [...stagingKeys, ...copiedKeys], storageArea);
      // Another identical confirmation may have committed while this copy was in flight.
      const duplicate = await preflight(taskId, actor, change, requestHash).catch(() => null);
      if (duplicate) return get(taskId, actor, receipt(duplicate, true));
      throw error;
    }
  }

  async function reorder(taskId, actor, order, input) {
    if (!Array.isArray(order)) throw deliverableError('El orden debe incluir todos los archivos vigentes.');
    const change = deliverableMutationInput(input), requestHash = hash({ operation: 'order', order });
    const duplicate = await preflight(taskId, actor, change, requestHash);
    if (duplicate) return get(taskId, actor, receipt(duplicate, true));
    const result = await commit(taskId, actor, change, requestHash, null, order);
    return get(taskId, actor, result);
  }

  async function file(taskId, fileId, actor) {
    await target(db, taskId, actor);
    const found = await db.taskDeliverable.findFirst({ where: { id: fileId, taskId } });
    if (!found) throw deliverableError('Este archivo ya no pertenece a la entrega vigente.', 404);
    return found;
  }

  async function cleanup({ now: at = now(), limit = 50 } = {}) {
    const pending = await db.taskDeliverableCleanup.findMany({ where: { nextAttemptAt: { lte: at } }, orderBy: { nextAttemptAt: 'asc' }, take: limit });
    let removed = 0, failed = 0;
    for (const row of pending) {
      try {
        const storageArea = areaOf(row.storageArea);
        if (await db.taskDeliverable.findFirst({ where: { storageKey: row.storageKey, storageArea }, select: { id: true } })) {
          await db.taskDeliverableCleanup.deleteMany({ where: { id: row.id } }); continue;
        }
        if (!row.storageKey.startsWith(`task-deliverables/${row.taskId}/`)) throw Object.assign(new Error('Invalid managed key'), { code: 'INVALID_MANAGED_KEY' });
        await storageAt(storageArea).deleteFromS3(row.storageKey);
        await db.taskDeliverableCleanup.deleteMany({ where: { id: row.id } }); removed++;
      } catch (error) {
        failed++;
        const attempts = row.attempts + 1;
        const lastErrorCode = /^[A-Za-z0-9_]{1,64}$/.test(error.code || '') ? error.code : 'STORAGE_DELETE_FAILED';
        await db.taskDeliverableCleanup.updateMany({ where: { id: row.id }, data: { attempts, lastErrorCode, nextAttemptAt: new Date(at.getTime() + Math.min(24 * 60, 2 ** Math.min(attempts, 10)) * 60_000) } });
      }
    }
    return { checked: pending.length, removed, failed };
  }
  return { get, replace, prepare, confirm, reorder, file, cleanup, authorize: (taskId, actor) => target(db, taskId, actor, true) };
}

export const cleanupTaskDeliverables = ({ db = prisma, storage, ...options } = {}) => createTaskDeliverableService({ db, storage }).cleanup(options);
