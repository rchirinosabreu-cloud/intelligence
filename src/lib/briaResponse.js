import { actionStage, LEGACY_ACTIONS } from './briaActions.js';
import { taskDraftItems } from './briaTaskDraft.js';
import { taskFileLabel } from './briaTaskMaterials.js';
import { humanDate } from './briaDate.js';
import { deleteScope } from './briaDeleteDraft.js';

// Documento de aprobación, separado de la voz del modelo. No interpreta mensajes.
// Se obtiene del estado efectivo; la prosa nunca elige qué campos se ejecutarán.
export const actionReviewText = action => {
  if (actionStage(action) !== 'READY') return '';
  let lines;
  if (action.type === 'TASK_CREATE') {
    lines = taskDraftItems(action.draft).map(item => [
      `**${item.title}**`,
      `Cliente: ${item.client.name}${action.draft.clientInferred ? ' (heredado del pendiente anterior)' : ''}`,
      `Responsable: ${item.assignee.name}`, `Fecha: ${humanDate(item.dueDate)}`,
      `Prioridad: ${item.priority}`, `Proyecto especial: ${item.isSpecial ? 'Sí' : 'No'}`,
      `Colaboradores: ${item.collaborators.map(member => member.name).join(', ') || 'Ninguno'}`,
      `Hora límite: ${item.focusTime ? `${item.focusTime} (Bogotá)` : 'Sin hora'}`,
      ...(item.context ? [`Comentario:\n${item.context}`] : []),
      ...item.references.map(row => `Referencia: ${row.url}`), ...item.inputs.map(row => `Insumo: ${row.url}`),
      ...item.files.map(taskFileLabel)
    ].join('\n'));
  } else if (action.type === 'DISPATCH' || action.type === 'TASK_DELETE') {
    const draft = action.draft;
    const scope = action.type === 'TASK_DELETE' ? deleteScope(draft) : null;
    lines = [action.title, ...(scope ? [`Para eliminar: ${scope.selected} · Excluidas: ${scope.excluded}`, scope.description] : []), draft.client?.name ? `Cliente: ${draft.client.name}` : null, ...draft.items.map(item => item.skip ? `${item.title}: excluido (${item.skip})` :
      action.type === 'DISPATCH' ? `${item.title}${item.format ? ` · ${item.format}` : ''}${item.publishDay ? ` · Publicación: ${humanDate(item.publishDay)}` : ''} → ${item.assignee?.name} · Entrega: ${humanDate(item.dueDate)} · ${item.priority}` :
        `${item.title}${item.client ? ` · ${item.client}` : ''}${item.assignee ? ` · ${item.assignee}` : ''}${item.status ? ` · ${item.status}` : ''}`),
    ...(action.type === 'TASK_DELETE' ? [`Motivo: ${draft.reason}`, 'Eliminación definitiva de la tarea, conversación y adjuntos; conserva el registro de eliminación.'] : [])];
  } else lines = [action.title, ...(action.summary || []), ...(action.warnings || [])];
  return `**Datos para aprobar**\n\n${lines.filter(Boolean).join('\n\n')}`;
};

export const approvalOptions = action => actionStage(action) === 'READY'
  ? [LEGACY_ACTIONS[action.type]?.confirmPhrase || 'Confirmar', 'Cancelar'] : [];

// JSONB puede reordenar claves. La revisión compara contenido, conservando el orden de listas.
const reviewState = action => JSON.stringify(action, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);

export const reviewedResponse = (prose, action) => {
  const review = actionReviewText(action);
  if (!review) return { answer: prose };
  return { answer: [prose, review].filter(Boolean).join('\n\n'),
    approvalReview: { actionId: action.id, state: reviewState(action) } };
};

// El recibo lo genera el servidor y se guarda con el turno que mostró los datos.
// No se hereda al conversar de otra cosa ni lo puede proporcionar el modelo.
export const hasCurrentApprovalReview = (turn, action) => Boolean(turn?.approvalReview
  && turn.approvalReview.actionId === action?.id && turn.approvalReview.state === reviewState(action)
  && actionReviewText(action) && String(turn.text || '').endsWith(actionReviewText(action)));

export const conversationalInvestigation = record => record?.relato?.length ? record.relato.map(row => row.texto).join('\n\n') : '';
