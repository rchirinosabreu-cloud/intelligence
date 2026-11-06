import { APPROVAL_STATES, approvalState } from '../../../lib/contentApproval.js';
import { PIECE_STATUS } from '../Clients/operations/operationTones.js';

const ICONS = { BORRADOR: 'FileText', EN_REVISION: 'Clock', APROBADO: 'CheckCircle2', EN_PRODUCCION: 'Circle',
  REALIZADO: 'Image', PROGRAMADO: 'Calendar', PUBLICADO: 'Send', DEVUELTO: 'AlertCircle' };
const DOTS = { BORRADOR: 'bg-zinc-300 dark:bg-zinc-600', EN_REVISION: 'bg-brand-yellow', APROBADO: 'bg-brand-cyan',
  EN_PRODUCCION: 'bg-brand-coral', REALIZADO: 'bg-brand-coral', PROGRAMADO: 'bg-brand-magenta', PUBLICADO: 'bg-brand-green', DEVUELTO: 'bg-destructive' };

export const pieceStatusPresentation = (item, { publicView = false } = {}) => {
  const state = approvalState(item);
  if (state === APPROVAL_STATES.MATERIAL_NUEVO) return {
    label: 'Material nuevo', icon: 'Sparkles', dot: 'bg-brand-magenta',
    chip: 'bg-brand-magenta-soft text-brand-magenta-deep dark:bg-brand-magenta/25 dark:text-zinc-100',
  };
  if (publicView && state === APPROVAL_STATES.POR_REVISAR) return {
    ...PIECE_STATUS.EN_REVISION, label: 'Por revisar', icon: 'Clock', dot: DOTS.EN_REVISION,
  };
  const status = Object.hasOwn(PIECE_STATUS, item?.status) ? item.status : 'BORRADOR';
  return { ...PIECE_STATUS[status], icon: ICONS[status], dot: DOTS[status] };
};
