import prisma from '../lib/prisma.js';
import { hasModulePermission } from '../config/security.js';
import { canOpenTask, TASK_PRIVACY_SELECT } from '../lib/taskPrivacy.js';

const rootId = 'deliverables';
const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fail = (message, status = 404) => Object.assign(new Error(message), { status, code: 'DRIVE_DELIVERABLE_UNAVAILABLE' });
const actorId = actor => actor?.userId || actor?.id;
export const isDeliveryFolder = id => id === rootId || String(id || '').startsWith(`${rootId}:`);
export const isDeliveryVirtualId = id => isDeliveryFolder(id) || String(id || '').startsWith('deliverable:');
export const deliveryFolderId = (parts = []) => parts.length ? `${rootId}:${Buffer.from(JSON.stringify(parts)).toString('base64url')}` : rootId;

const parseFolder = id => {
  if (!id || id === rootId) return [];
  try {
    if (!isDeliveryFolder(id) || id.length > 1500) throw new Error();
    const parts = JSON.parse(Buffer.from(id.slice(rootId.length + 1), 'base64url').toString('utf8'));
    if (!Array.isArray(parts) || parts.length > 5 || parts.some(part => !['string', 'number'].includes(typeof part)) || deliveryFolderId(parts) !== id) throw new Error();
    return parts;
  } catch { throw fail('La carpeta de entregables no está disponible.', 400); }
};
const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
const searchable = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const periodOf = date => {
  if (!date || !Number.isFinite(new Date(date).getTime())) return { year: 'unknown', month: 'unknown' };
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' }).formatToParts(new Date(date));
  return { year: Number(parts.find(part => part.type === 'year').value), month: Number(parts.find(part => part.type === 'month').value) };
};
const datePart = resource => resource.year === 'unknown' ? 'sin-fecha' : `${resource.year}-${String(resource.month).padStart(2, '0')}`;
const displayName = (resource, file, position) => {
  const extension = String(file.name || '').match(/\.([a-zA-Z0-9]{1,12})$/)?.[1];
  return `${(clean(resource.clientName) || 'Sin_cliente').slice(0, 40)}_${datePart(resource)}_${(clean(resource.title) || 'Entrega').slice(0, 80)}_${String(position + 1).padStart(2, '0')}${extension ? `.${extension.toLowerCase()}` : ''}`;
};
const resourcePath = resource => [resource.clientId || 'none', resource.year, resource.month, resource.kind, resource.id];
const within = (resource, parts) => parts.every((part, index) => resourcePath(resource)[index] === part);
const label = (resource, level) => [resource.clientName, resource.year === 'unknown' ? 'Sin fecha' : String(resource.year), months[resource.month - 1] || 'Sin fecha', resource.kind === 'TASK' ? 'Tareas' : 'Parrillas', resource.title][level];
const folder = (id, name, count = 0) => ({ id, name, subtitle: 'Entregables vigentes · organiza y reemplaza desde su origen', system: true, readOnly: true, virtual: true, itemCount: count });
const root = count => folder(rootId, 'Entregables', count);
const safeFile = (resource, file, index) => {
  const task = resource.kind === 'TASK', name = displayName(resource, file, index);
  const path = task ? `/api/tasks/${encodeURIComponent(resource.id)}/deliverables/${encodeURIComponent(file.id)}` : `/api/content/items/${encodeURIComponent(resource.id)}/final-assets/${encodeURIComponent(file.id)}`;
  return { id: `deliverable:${resource.kind}:${resource.id}:${file.id}`, fileId: file.id,
    kind: task ? 'TASK_DELIVERABLE' : 'CONTENT_DELIVERABLE', name, downloadName: name, originalName: file.name,
    mimeType: file.mimeType || 'application/octet-stream', sizeBytes: file.size == null ? null : Number(file.size),
    position: index, createdAt: file.createdAt, readOnly: true, virtual: true, canOpenSource: true,
    periodSource: resource.periodSource, fileUrl: file.externalProvider ? null : task ? `${path}/file` : path, downloadUrl: file.externalProvider ? null : task ? `${path}/download` : `${path}?download=true`,
    ...(file.externalProvider ? { externalProvider: file.externalProvider, externalFileId: file.externalFileId } : {}),
    source: { clientId: resource.clientId, clientName: resource.clientName, title: resource.title,
      ...(task ? { taskId: resource.id, href: `/gestion?taskId=${encodeURIComponent(resource.id)}` } : { itemId: resource.id, planId: resource.planId, ...(resource.format ? { format: resource.format } : {}), href: `/parrillas/${encodeURIComponent(resource.planId)}?item=${encodeURIComponent(resource.id)}` }) }
  };
};
const fileSelect = { id: true, name: true, mimeType: true, size: true, position: true, createdAt: true };

async function visibleResources(db, actor) {
  const userId = actorId(actor);
  if (!userId || !hasModulePermission(actor, 'drive')) return [];
  const resources = [];
  if (hasModulePermission(actor, 'gestion')) {
    const candidates = await db.task.findMany({ where: { contentItemId: null, deliverables: { some: {} }, OR: [
      { isPrivate: false }, { creatorId: userId }, { assignee: { userId } }, { collaborators: { some: { member: { userId } } } }, { viewers: { some: { userId } } }
    ] }, select: { id: true, title: true, clientId: true, client: { select: { id: true, name: true } }, ...TASK_PRIVACY_SELECT,
      deliverables: { orderBy: [{ position: 'asc' }, { id: 'asc' }], select: fileSelect } } });
    const tasks = candidates.filter(task => canOpenTask(task, userId) && task.deliverables?.length);
    const events = tasks.length ? await db.taskDeliverableEvent.groupBy({ by: ['taskId'], where: { taskId: { in: tasks.map(task => task.id) } }, _min: { createdAt: true } }) : [];
    const first = new Map(events.map(event => [event.taskId, event._min.createdAt]));
    for (const task of tasks) {
      const firstAt = first.get(task.id), fallback = task.deliverables.map(file => file.createdAt).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0];
      resources.push({ id: task.id, kind: 'TASK', title: task.title, clientId: task.clientId || null, clientName: task.client?.name || 'Sin cliente',
        ...periodOf(firstAt || fallback), periodSource: firstAt ? 'FIRST_DELIVERY' : fallback ? 'CURRENT_LEGACY_FILE' : 'UNKNOWN', files: task.deliverables });
    }
  }
  if (hasModulePermission(actor, 'parrillas')) {
    const items = await db.contentItem.findMany({ where: { deletedAt: null, plan: { deletedAt: null }, finalAssets: { some: {} } }, select: {
      id: true, objective: true, format: true, deletedAt: true, planId: true, plan: { select: { id: true, deletedAt: true, year: true, month: true, clientId: true, client: { select: { id: true, name: true } } } },
      finalAssets: { orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { ...fileSelect, externalProvider: true, externalFileId: true } }
    } });
    for (const item of items.filter(row => !row.deletedAt && row.plan && !row.plan.deletedAt && row.finalAssets?.length)) {
      resources.push({ id: item.id, kind: 'CONTENT', title: item.objective || 'Pieza', format: item.format, planId: item.planId, clientId: item.plan.clientId || null,
        clientName: item.plan.client?.name || 'Sin cliente', year: item.plan.year, month: item.plan.month, periodSource: 'PLAN', files: item.finalAssets });
    }
  }
  return resources;
}

/** Projects native current files; never creates DriveFile rows or changes ownership of the bytes. */
export async function listDriveDeliverables({ db = prisma, actor, folderId = rootId, query = '' } = {}) {
  let parts = parseFolder(folderId);
  const resources = await visibleResources(db, actor);
  if (parts.length === 5) {
    const resource = resources.find(row => row.id === parts[4] && row.kind === parts[3] && (row.clientId || 'none') === parts[0]);
    if (resource) parts = resourcePath(resource);
  }
  const selected = resources.filter(resource => within(resource, parts));
  if (parts.length && !selected.length) throw fail('La carpeta de entregables no está disponible.');
  const count = list => list.reduce((sum, resource) => sum + resource.files.length, 0);
  const breadcrumbs = [root(count(resources))];
  for (let level = 0; level < parts.length; level++) breadcrumbs.push(folder(deliveryFolderId(parts.slice(0, level + 1)), label(selected[0], level), count(resources.filter(resource => within(resource, parts.slice(0, level + 1))))));
  const needle = searchable(String(query || '').trim().slice(0, 120));
  let files = [], folders = [];
  if (needle || parts.length === 5) {
    files = selected.flatMap(resource => resource.files.map((file, index) => safeFile(resource, file, index)))
      .filter(file => !needle || searchable([file.name, file.originalName, file.source.title, file.source.clientName].join(' ')).includes(needle));
  } else {
    const groups = new Map();
    for (const resource of selected) {
      const path = resourcePath(resource).slice(0, parts.length + 1), id = deliveryFolderId(path);
      if (!groups.has(id)) groups.set(id, folder(id, label(resource, parts.length)));
      groups.get(id).itemCount += resource.files.length;
    }
    folders = [...groups.values()].sort((a, b) => parts.length === 1 ? b.name.localeCompare(a.name, 'es', { numeric: true }) : a.name.localeCompare(b.name, 'es', { numeric: true }));
  }
  return { currentFolder: breadcrumbs.at(-1), breadcrumbs, folders, files,
    ...(folderId !== deliveryFolderId(parts) ? { redirectedFrom: folderId } : {}) };
}
