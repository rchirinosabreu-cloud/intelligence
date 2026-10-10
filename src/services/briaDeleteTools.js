import { canDeleteWithBria } from './briaDeleteService.js';
import { deleteStage } from '../lib/briaDeleteDraft.js';
import { wrapLegacyAction, actionReply } from '../lib/briaActions.js';

// La herramienta solo prepara: el modelo no tiene forma de eliminar. El servidor elimina cuando la persona
// escribe «Eliminar pendiente» sobre el resumen guardado (ver briaConversationService).
export const createBriaDeleteTools = (service) => service ? [{
  name: 'preparar_eliminacion',
  description: 'Prepara o ajusta la eliminación de uno o varios pendientes de Gestión. NO elimina: muestra qué se va a eliminar y por qué, y la persona confirma. Úsala cuando la persona pida eliminar, borrar o quitar un pendiente o una tarea. Antes localiza la tarea con mis_tareas o tareas_de_cliente y usa su id; si hay varias parecidas, pregunta cuál. Pasa el motivo que dio la persona; si no lo dio, la herramienta lo pide. Una corrección en el chat ajusta la misma eliminación.',
  allowed: canDeleteWithBria,
  parameters: { type: 'object', properties: {
    tareas: { type: 'array', maxItems: 10, items: { type: 'string' }, description: 'Ids de las tareas, de mis_tareas o tareas_de_cliente.' },
    motivo: { type: ['string', 'null'], description: 'Por qué se elimina, con las palabras de la persona. null si no lo dijo.' },
    nuevo: { type: 'boolean', description: 'Solo si la persona pide otra eliminación distinta.' }
  }, required: ['tareas', 'motivo'], additionalProperties: false },
  async run(args, ctx) {
    const previous = ctx.pendingAction?.type === 'TASK_DELETE' ? ctx.pendingAction.draft : ctx.deleteDraft;
    const draft = await service.prepare({ user: ctx.user, args, question: ctx.question, previous });
    const action = wrapLegacyAction('TASK_DELETE', draft, { title: 'Eliminar pendientes' });
    const reply = actionReply(action);
    return { data: { stage: deleteStage(draft), draft, message: reply.answer, deleted: false }, pendingAction: action, actionReply: reply, quickReplies: reply.quickReplies };
  }
}] : [];
