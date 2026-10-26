import { canDeleteWithBria } from './briaDeleteService.js';
import { deleteStage, deleteScope, DELETE_MAX_ITEMS } from '../lib/briaDeleteDraft.js';
import { wrapLegacyAction, actionReply } from '../lib/briaActions.js';
import { PREPARATION_REQUEST_SCHEMA } from '../lib/briaPreparation.js';

// La herramienta solo prepara: el modelo no tiene forma de eliminar. El servidor elimina cuando la persona
// escribe «Eliminar pendiente» sobre el resumen guardado (ver briaConversationService).
export const createBriaDeleteTools = (service) => service ? [{
  name: 'preparar_eliminacion',
  description: 'Prepara o ajusta una eliminación de tareas de Gestión interpretando el pedido y sus continuaciones en la conversación. No ejecuta: siempre requiere aprobación posterior del conjunto mostrado. Para todo un conjunto usa filtro: el servidor resuelve la selección completa, incluidos responsables inactivos, sin depender de la página parcial de una búsqueda. Para tareas individuales usa ids conocidos. Conserva el alcance y motivo acordados; la falta de un verbo en la respuesta no invalida el pedido. Si falta motivo, pasa null. Describe solo scope.selected como preparado y declara las exclusiones: un total encontrado no es el total preparado. Un límite técnico nunca se resuelve pidiendo una frase distinta.',
  allowed: canDeleteWithBria,
  parameters: { type: 'object', properties: {
    request: PREPARATION_REQUEST_SCHEMA,
    tareas: { type: 'array', maxItems: DELETE_MAX_ITEMS, items: { type: 'string' }, description: 'Selección completa por ids conocidos, en lugar de filtro. Omite para conservar la selección al cambiar el motivo; [] la retira.' },
    filtro: { type: 'object', description: 'Selecciona todas las coincidencias del alcance acordado. No añadas vencidas si el pedido incluye también futuras o sin fecha. Reemplaza el conjunto anterior. No combinar con tareas.', properties: {
      responsable: { type: 'string' }, cliente: { type: 'string' }, sinResponsable: { type: 'boolean' },
      estado: { type: 'string', enum: ['pendientes', 'en_proceso', 'devueltas', 'realizadas', 'todas'] }, vencidas: { type: 'boolean' }
    }, additionalProperties: false },
    motivo: { type: ['string', 'null'], description: 'Por qué se elimina, con las palabras de la persona. null si no lo dijo.' },
    nuevo: { type: 'boolean', description: 'Solo si la persona pide otra eliminación distinta.' }
  }, required: ['request', 'motivo'], additionalProperties: false },
  async run(args, ctx) {
    const previous = ctx.pendingAction?.type === 'TASK_DELETE' ? ctx.pendingAction.draft : ctx.deleteDraft;
    const draft = await service.prepare({ user: ctx.user, args, request: args.request ? { intent: args.request.intent, evidence: ctx.question } : undefined, question: ctx.question, previous });
    const action = wrapLegacyAction('TASK_DELETE', draft, { title: 'Eliminar pendientes' });
    const reply = actionReply(action);
    return { data: { stage: deleteStage(draft), draft, scope: deleteScope(draft), message: reply.answer, deleted: false }, pendingAction: action, actionReply: reply, quickReplies: reply.quickReplies };
  }
}] : [];
