const PRODUCTION_PREFIX = '[Producción]';
const PUBLICATION_PREFIX = '[Publicar]';

const asValidDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date
    ? value
    : new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00.000Z`
      : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const isPublicationTask = (title = '') => title.startsWith(PUBLICATION_PREFIX);

export const getContentTaskKind = (title = '') => {
  if (title.startsWith(PUBLICATION_PREFIX)) return 'publication';
  if (title.startsWith(PRODUCTION_PREFIX)) return 'production';
  return null;
};

export const buildContentTaskTitle = (kind, item) => {
  const prefix = kind === 'publication' ? PUBLICATION_PREFIX : PRODUCTION_PREFIX;
  return `${prefix} ${item.format}: ${item.objective}`;
};

export const normalizeLinkedUrls = (values = []) => [...new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
)];

const extractContentObjective = (title, format) => {
  const withoutKind = String(title || '')
    .replace(/^\[(?:Producción|Publicar)\]\s*/u, '')
    .trim();
  const formatPrefix = `${String(format || '').trim()}:`;
  return formatPrefix !== ':' && withoutKind.startsWith(formatPrefix)
    ? withoutKind.slice(formatPrefix.length).trim()
    : withoutKind;
};

export const buildContentItemUpdateFromTask = ({ task, taskUpdate }) => {
  if (!task?.contentItemId) return null;

  const update = {};
  if (typeof taskUpdate?.contentObjective === 'string' && taskUpdate.contentObjective.trim()) {
    update.objective = taskUpdate.contentObjective.trim();
  } else if (typeof taskUpdate?.title === 'string' && taskUpdate.title.trim()) {
    const objective = extractContentObjective(taskUpdate.title, task.contentItem?.format);
    if (objective) update.objective = objective;
  }
  if (Object.prototype.hasOwnProperty.call(taskUpdate || {}, 'contentReferences')) {
    update.mediaUrl = normalizeLinkedUrls(taskUpdate.contentReferences);
  }
  if (Object.prototype.hasOwnProperty.call(taskUpdate || {}, 'contentInputs')) {
    update.assetsLinks = normalizeLinkedUrls(taskUpdate.contentInputs);
  }

  if (isPublicationTask(task.title) && Object.prototype.hasOwnProperty.call(taskUpdate || {}, 'dueDate')) {
    const publishDate = asValidDate(taskUpdate.dueDate);
    if (publishDate) update.publishDate = publishDate;
  }

  return Object.keys(update).length ? update : null;
};

const shiftDueDate = ({ dueDate, previousPublishDate, nextPublishDate }) => {
  const nextPublish = asValidDate(nextPublishDate);
  if (!nextPublish) return null;

  const currentDue = asValidDate(dueDate);
  const previousPublish = asValidDate(previousPublishDate);
  if (!currentDue || !previousPublish) return new Date(nextPublish);

  const publishDeltaMs = nextPublish.getTime() - previousPublish.getTime();
  return new Date(currentDue.getTime() + publishDeltaMs);
};

const sameDate = (left, right) => {
  const leftDate = asValidDate(left);
  const rightDate = asValidDate(right);
  return leftDate?.getTime() === rightDate?.getTime();
};

export const buildLinkedTaskUpdates = ({
  previousItem,
  nextItem,
  tasks = [],
  excludedTaskIds = [],
  forceTitles = false
}) => {
  const excludedIds = new Set(excludedTaskIds);
  const publishDateChanged = !sameDate(previousItem.publishDate, nextItem.publishDate);
  const generatedTitles = {
    production: buildContentTaskTitle('production', previousItem),
    publication: buildContentTaskTitle('publication', previousItem)
  };

  return tasks.flatMap((task) => {
    if (excludedIds.has(task.id)) return [];

    const data = {};
    const kind = getContentTaskKind(task.title);

    if (publishDateChanged && task.status !== 'REALIZADA') {
      const dueDate = shiftDueDate({
        dueDate: task.dueDate,
        previousPublishDate: previousItem.publishDate,
        nextPublishDate: nextItem.publishDate
      });
      if (dueDate) data.dueDate = dueDate;
    }

    if (kind && (forceTitles || (
      task.status !== 'REALIZADA' && task.title === generatedTitles[kind]
    ))) {
      const nextTitle = buildContentTaskTitle(kind, nextItem);
      if (nextTitle !== task.title) data.title = nextTitle;
    }

    return Object.keys(data).length ? [{ id: task.id, data }] : [];
  });
};
