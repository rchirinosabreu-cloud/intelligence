import { randomUUID, createHash } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { shouldRequestRevisionOnNewAsset } from '../lib/contentApproval.js';
import { fileContentProblem } from '../lib/fileSignature.js';
import { FINAL_ASSET_MAX_BYTES, FINAL_ASSET_MAX_TOTAL_BYTES, FINAL_ASSET_DIRECT_MAX_BYTES, FINAL_ASSETS_PER_ITEM } from '../lib/uploadLimits.js';
import { getPlatformStorage } from './platformStorageService.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const stale = () => httpError(409, 'La entrega cambió. Actualiza la pieza y revisa los archivos antes de volver a entregar.');
const actorIdOf = actor => actor?.userId || actor?.id || null;
const order = [{ position: 'asc' }, { createdAt: 'asc' }];
const metadata = files => files.map(({ id, name, mimeType, size, position }) => ({ id, name, mimeType: mimeType ?? null, size: size ?? null, position }));
const validRevision = value => (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
// ContentItemFinalAsset.size remains PostgreSQL Int; independent task deliveries use their own type.
export const CONTENT_FINAL_ASSET_DIRECT_MAX_BYTES = Math.min(FINAL_ASSET_DIRECT_MAX_BYTES, 2_147_483_647);

export function createContentDeliveryService({ db = prisma, storage, storageFor = getPlatformStorage, clock = () => new Date() } = {}) {
  const storageAt = area => {
    if (storage) return storage;
    const profile = storageFor(area || 'LEGACY');
    return { put: profile.putS3Object, sign: profile.createSignedUpload, head: profile.headS3Object, copy: profile.copyS3Object, prefix: profile.readS3ObjectPrefix, delete: profile.deleteFromS3 };
  };
  const assertNewStorage = () => { if (!storage) storageFor('PLATFORM').assertConfigured?.(); };
  const rows = (tx, itemId) => tx.contentItemFinalAsset.findMany({ where: { contentItemId: itemId }, orderBy: order });
  const itemFor = async (tx, itemId, lock = false) => {
    if (lock) await tx.$queryRaw`SELECT "id" FROM "ContentItem" WHERE "id" = ${itemId} FOR UPDATE`;
    const item = await tx.contentItem.findUnique({ where: { id: itemId }, select: {
      id: true, status: true, finalAssetsRevision: true, revisionRequestedAt: true, deletedAt: true,
      plan: { select: { deletedAt: true } }
    } });
    if (!item || item.deletedAt || item.plan?.deletedAt) throw httpError(404, 'Pieza no encontrada.');
    return item;
  };
  const snapshot = async (tx, itemId, item) => ({
    revision: (item || await itemFor(tx, itemId)).finalAssetsRevision,
    files: await rows(tx, itemId),
    history: await tx.contentItemDeliveryChange.findMany({ where: { contentItemId: itemId }, orderBy: { revision: 'desc' } })
  });
  const get = itemId => db.$transaction(async tx => snapshot(tx, itemId, await itemFor(tx, itemId)), { isolationLevel: 'RepeatableRead' });
  const enqueue = async (tx, keys, availableAt = clock(), storageArea = 'LEGACY') => {
    for (const storageKey of new Set(keys.filter(Boolean))) {
      await tx.contentAssetDeletion.upsert({ where: { storageArea_storageKey: { storageArea, storageKey } }, create: { storageArea, storageKey, availableAt }, update: {} });
    }
  };
  const retiredKeys = files => files.flatMap(asset => {
    if (!asset.storageKey) return [];
    const folder = asset.storageKey.slice(0, asset.storageKey.lastIndexOf('/') + 1);
    return [asset.storageKey, `${folder}derived/${asset.id}-instagram.jpg`, `${folder}derived/${asset.id}-facebook.jpg`];
  });
  const cleanup = async ({ limit = 100 } = {}) => {
    const now = clock();
    const expired = await db.contentItemDeliveryUpload.findMany({ where: { state: { in: ['PENDING', 'VERIFYING'] }, expiresAt: { lte: now } }, take: limit });
    for (const upload of expired) {
      await db.$transaction(async tx => {
        const claimed = await tx.contentItemDeliveryUpload.updateMany({ where: { id: upload.id, state: upload.state, expiresAt: { lte: now } }, data: { state: 'EXPIRED' } });
        if (claimed.count) await enqueue(tx, upload.manifest.flatMap(file => [file.key, file.finalKey]), now, upload.storageArea || 'LEGACY');
      });
    }
    const pending = await db.contentAssetDeletion.findMany({ where: { availableAt: { lte: now } }, orderBy: { availableAt: 'asc' }, take: limit });
    let deleted = 0;
    for (const entry of pending) {
      try {
        // A defensive check also protects legacy uploads whose client retried a confirmation.
        if (await db.contentItemFinalAsset.findFirst({ where: { storageKey: entry.storageKey, storageArea: entry.storageArea || 'LEGACY' } })) continue;
        await storageAt(entry.storageArea).delete(entry.storageKey);
        await db.contentAssetDeletion.deleteMany({ where: { id: entry.id } });
        deleted++;
      } catch {
        await db.contentAssetDeletion.updateMany({ where: { id: entry.id }, data: { attempts: { increment: 1 }, lastError: 'STORAGE_DELETE_FAILED', availableAt: new Date(now.getTime() + 300_000) } });
      }
    }
    return { deleted, pending: pending.length - deleted };
  };
  const cleanupQuietly = async () => { try { await cleanup(); } catch { console.warn('[Content delivery] Cleanup remains pending.'); } };

  // Every existing writer shares this row lock, revision and immutable metadata receipt.
  const mutate = async (itemId, { actor, expectedRevision, action, material = true, uploadId } = {}, operation) => {
    const result = await db.$transaction(async tx => {
      const item = await itemFor(tx, itemId, true);
      if (expectedRevision != null && (!validRevision(expectedRevision) || Number(expectedRevision) !== item.finalAssetsRevision)) throw stale();
      const revision = item.finalAssetsRevision + 1;
      if (uploadId) {
        // Claim the session before replacing rows. The UPDATE holds its lock until
        // this whole transaction commits, so expiry cannot sweep uncommitted finals.
        const claimed = await tx.contentItemDeliveryUpload.updateMany({
          where: { id: uploadId, contentItemId: itemId, state: 'VERIFYING', expiresAt: { gt: clock() } },
          data: { state: 'COMMITTED', committedRevision: revision }
        });
        if (claimed.count !== 1) throw httpError(409, 'Esta carga venció. Vuelve a abrir la entrega.');
      }
      const before = await rows(tx, itemId);
      await operation(tx, item, before);
      const after = await rows(tx, itemId);
      if (after.length > FINAL_ASSETS_PER_ITEM) throw httpError(400, `Una pieza puede contener máximo ${FINAL_ASSETS_PER_ITEM} archivos finales.`);
      const next = await tx.contentItem.update({ where: { id: itemId }, data: {
        finalAssetsRevision: revision,
        ...(material && shouldRequestRevisionOnNewAsset(item) && !item.revisionRequestedAt ? { revisionRequestedAt: clock() } : {})
      } });
      const actorId = actorIdOf(actor);
      const author = actorId ? await tx.user.findUnique({ where: { id: actorId }, select: { name: true } }) : null;
      await tx.contentItemDeliveryChange.create({ data: { contentItemId: itemId, revision,
        action: ['REPLACED', 'ADDED'].includes(action) && before.length === 0 ? 'DELIVERED' : action,
        actorId, actorName: author?.name || null, at: clock(), files: metadata(after), previousFiles: metadata(before)
      } });
      for (const retired of before.filter(file => !after.some(current => current.storageKey && current.storageKey === file.storageKey && (current.storageArea || 'LEGACY') === (file.storageArea || 'LEGACY')))) {
        await enqueue(tx, retiredKeys([retired]), clock(), retired.storageArea || 'LEGACY');
      }
      return snapshot(tx, itemId, next);
    });
    await cleanupQuietly();
    return result;
  };
  const validate = (files, { actor, expectedRevision, requestId }, server = false) => {
    if (!actorIdOf(actor)) throw httpError(401, 'Necesitas iniciar sesión.');
    if (!validRevision(expectedRevision)) throw httpError(400, 'Se necesita la revisión vigente de la entrega.');
    if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 100) throw httpError(400, 'Falta identificar esta entrega.');
    if (!Array.isArray(files) || !files.length || files.length > FINAL_ASSETS_PER_ITEM) throw httpError(400, `Selecciona entre 1 y ${FINAL_ASSETS_PER_ITEM} archivos.`);
    for (const file of files) {
      if (!file || typeof file !== 'object') throw httpError(400, 'La selección contiene un archivo no válido.');
      if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > (server ? FINAL_ASSET_MAX_BYTES : CONTENT_FINAL_ASSET_DIRECT_MAX_BYTES)) throw httpError(400, 'Uno de los archivos está vacío o supera el tamaño permitido.');
      if (!/^(image|video)\//.test(file.mimeType || '')) throw httpError(400, 'Solo se permiten imágenes o videos para la pieza final.');
      if (typeof file.name !== 'string' || !file.name.trim() || file.name.length > 512) throw httpError(400, 'Uno de los archivos no tiene un nombre válido.');
    }
    if (server && files.reduce((total, file) => total + file.size, 0) > FINAL_ASSET_MAX_TOTAL_BYTES) throw httpError(413, 'El conjunto supera el límite de carga del servidor. Usa la carga directa.');
  };
  const prepareSession = async (itemId, files, options) => {
    validate(files, options);
    return db.$transaction(async tx => {
      const item = await itemFor(tx, itemId, true);
      const existing = await tx.contentItemDeliveryUpload.findFirst({ where: { contentItemId: itemId, requestId: options.requestId } });
      if (existing) {
        if (existing.actorId !== actorIdOf(options.actor)) throw httpError(403, 'Esta carga pertenece a otra persona.');
        const declarations = manifest => manifest.map(({ name, size, mimeType, hash }) => ({ name, size, mimeType, ...(hash ? { hash } : {}) }));
        if (existing.expectedRevision !== Number(options.expectedRevision) || JSON.stringify(declarations(existing.manifest)) !== JSON.stringify(declarations(files))) throw httpError(409, 'Esa solicitud ya identifica otra selección de archivos.');
        if (existing.state === 'COMMITTED') return existing;
        assertNewStorage();
        if (existing.storageArea !== 'PLATFORM') throw httpError(409, 'Esta carga usa el almacenamiento anterior. Solicita una carga nueva; la entrega vigente se conserva.');
        if (existing.state !== 'PENDING' || existing.expiresAt <= clock()) throw httpError(409, 'Esta carga ya está procesándose o venció. Vuelve a abrir la entrega.');
        if (item.finalAssetsRevision !== Number(options.expectedRevision)) throw stale();
        return tx.contentItemDeliveryUpload.update({ where: { id: existing.id }, data: { expiresAt: new Date(clock().getTime() + 3600_000) } });
      }
      if (item.finalAssetsRevision !== Number(options.expectedRevision)) throw stale();
      assertNewStorage();
      const id = randomUUID();
      const manifest = files.map((file, index) => ({ ...file, key: `content-delivery-staging/${itemId}/${id}/${index}`, finalKey: `content-deliveries/${itemId}/${randomUUID()}/${index}` }));
      return tx.contentItemDeliveryUpload.create({ data: { id, contentItemId: itemId, requestId: options.requestId, actorId: actorIdOf(options.actor), expectedRevision: Number(options.expectedRevision), storageArea: 'PLATFORM', manifest, state: 'PENDING', expiresAt: new Date(clock().getTime() + 3600_000) } });
    });
  };
  const prepare = async (itemId, files, options) => {
    validate(files, options);
    const upload = await prepareSession(itemId, files.map(({ name, mimeType, size }) => ({ name, mimeType, size })), options);
    if (upload.state === 'COMMITTED') return { uploadId: upload.id, committed: true, delivery: await get(itemId), tickets: [] };
    const tickets = await Promise.all(upload.manifest.map(async file => ({ key: file.key, name: file.name, mimeType: file.mimeType, ...(await storageAt(upload.storageArea).sign({ key: file.key, contentType: file.mimeType, expiresIn: 900 })) })));
    return { uploadId: upload.id, revision: upload.expectedRevision, tickets };
  };
  const confirm = async (itemId, { actor, uploadId, expectedRevision }) => {
    if (typeof uploadId !== 'string' || !uploadId.trim() || uploadId.length > 100) throw httpError(400, 'Falta identificar la carga que quieres confirmar.');
    if (!validRevision(expectedRevision)) throw httpError(400, 'Se necesita la revisión vigente de la entrega.');
    const upload = await db.contentItemDeliveryUpload.findFirst({ where: { id: uploadId, contentItemId: itemId } });
    if (!upload) throw httpError(404, 'Carga no encontrada.');
    if (upload.actorId !== actorIdOf(actor)) throw httpError(403, 'Esta carga pertenece a otra persona.');
    if (Number(expectedRevision) !== upload.expectedRevision) throw stale();
    if (upload.state === 'COMMITTED') return get(itemId);
    if (upload.storageArea !== 'PLATFORM') throw httpError(409, 'Esta carga usa el almacenamiento anterior. Solicita una carga nueva; la entrega vigente se conserva.');
    assertNewStorage();
    const targetStorage = storageAt(upload.storageArea);
    const claimed = await db.contentItemDeliveryUpload.updateMany({ where: { id: upload.id, state: 'PENDING' }, data: { state: 'VERIFYING' } });
    if (!claimed.count || upload.expiresAt <= clock()) throw httpError(409, 'Esta carga ya está procesándose o venció. Vuelve a abrir la entrega.');
    try {
      const current = await itemFor(db, itemId);
      if (current.finalAssetsRevision !== upload.expectedRevision) throw stale();
      const verified = [];
      // All objects must exist and match the declared set before any current row can be changed.
      for (const file of upload.manifest) {
        const object = await targetStorage.head(file.key);
        if (!object || object.size !== file.size || object.mimeType !== file.mimeType || !object.etag) throw httpError(409, 'La carga todavía no está completa o un archivo cambió. Vuelve a intentarlo.');
        const prefix = await targetStorage.prefix(file.key, 512, { etag: object.etag });
        const problem = fileContentProblem({ name: file.name, mimeType: file.mimeType, bytes: prefix });
        if (problem) throw httpError(400, problem);
        verified.push({ file, object });
      }
      for (const { file, object } of verified) await targetStorage.copy(file.key, file.finalKey, { etag: object.etag });
      return await mutate(itemId, { actor, expectedRevision, action: 'REPLACED', uploadId }, async tx => {
        await tx.contentItemFinalAsset.deleteMany({ where: { contentItemId: itemId } });
        for (const [position, file] of upload.manifest.entries()) await tx.contentItemFinalAsset.create({ data: {
          contentItemId: itemId, storageKey: file.finalKey, storageArea: upload.storageArea, name: file.name, mimeType: file.mimeType, size: file.size, position
        } });
        // Wait until every issued PUT ticket has expired before sweeping staging.
        await enqueue(tx, upload.manifest.map(file => file.key), upload.expiresAt, upload.storageArea);
      });
    } catch (error) {
      await db.contentItemDeliveryUpload.updateMany({ where: { id: upload.id, state: 'VERIFYING' }, data: { state: 'PENDING' } });
      const remaining = await db.contentItemDeliveryUpload.findUnique({ where: { id: upload.id } });
      if (remaining?.state !== 'COMMITTED' && (!remaining || remaining.state === 'EXPIRED' || remaining.expiresAt <= clock())) {
        // A sweep may have run while CopyObject was in flight. Its late result needs a fresh tombstone.
        await db.$transaction(async tx => {
          await enqueue(tx, upload.manifest.map(file => file.finalKey), clock(), upload.storageArea);
          await enqueue(tx, upload.manifest.map(file => file.key), upload.expiresAt, upload.storageArea);
        });
      }
      throw error;
    }
  };
  const replace = async (itemId, files, options) => {
    const manifest = Array.isArray(files) ? files.map(file => ({ name: file.originalname, mimeType: file.mimetype, size: file.buffer?.length || file.size, hash: createHash('sha256').update(file.buffer || Buffer.alloc(0)).digest('hex') })) : files;
    validate(manifest, options, true);
    for (const [index, file] of files.entries()) {
      const problem = fileContentProblem({ name: manifest[index].name, mimeType: manifest[index].mimeType, bytes: file.buffer });
      if (problem) throw httpError(400, problem);
    }
    const upload = await prepareSession(itemId, manifest, options);
    if (upload.state === 'COMMITTED') return get(itemId);
    for (const [index, file] of files.entries()) await storageAt(upload.storageArea).put({ key: upload.manifest[index].key, body: file.buffer, contentType: file.mimetype });
    return confirm(itemId, { actor: options.actor, uploadId: upload.id, expectedRevision: options.expectedRevision });
  };
  const discard = async (keys, storageArea = 'LEGACY') => {
    await db.$transaction(async tx => {
      for (const key of keys.filter(Boolean)) if (!(await tx.contentItemFinalAsset.findFirst({ where: { storageKey: key, storageArea } }))) await enqueue(tx, [key], clock(), storageArea);
    });
    await cleanupQuietly();
  };
  return { get, replace, prepare, confirm, mutate, cleanup, enqueue, discard };
}

const native = createContentDeliveryService();
export const getContentDelivery = native.get;
export const replaceContentDelivery = native.replace;
export const prepareContentDelivery = native.prepare;
export const confirmContentDelivery = native.confirm;
export const mutateContentDelivery = native.mutate;
export const discardContentDeliveryObjects = native.discard;
export const cleanupContentDeliveryUploads = ({ db = prisma, storage, storageFor, now, limit } = {}) =>
  createContentDeliveryService({ db, storage, storageFor, ...(now ? { clock: () => now } : {}) }).cleanup({ limit });
