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

export const buildContentItemUpdateFromTask = ({ task, taskUpdate }) => {
  if (!task?.contentItemId || !isPublicationTask(task.title) || !('dueDate' in (taskUpdate || {}))) {
    return null;
  }

  const publishDate = asValidDate(taskUpdate.dueDate);
  return publishDate ? { publishDate } : null;
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
  excludedTaskIds = []
}) => {
  const excludedIds = new Set(excludedTaskIds);
  const publishDateChanged = !sameDate(previousItem.publishDate, nextItem.publishDate);
  const generatedTitles = {
    production: buildContentTaskTitle('production', previousItem),
    publication: buildContentTaskTitle('publication', previousItem)
  };

  return tasks.flatMap((task) => {
    if (task.status === 'REALIZADA' || excludedIds.has(task.id)) return [];

    const data = {};
    const kind = getContentTaskKind(task.title);

    if (publishDateChanged) {
      const dueDate = shiftDueDate({
        dueDate: task.dueDate,
        previousPublishDate: previousItem.publishDate,
        nextPublishDate: nextItem.publishDate
      });
      if (dueDate) data.dueDate = dueDate;
    }

    if (kind && task.title === generatedTitles[kind]) {
      const nextTitle = buildContentTaskTitle(kind, nextItem);
      if (nextTitle !== task.title) data.title = nextTitle;
    }

    return Object.keys(data).length ? [{ id: task.id, data }] : [];
  });
};
