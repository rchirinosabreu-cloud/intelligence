import { canDispatch } from './briaDispatchService.js';
import { dispatchStage } from '../lib/briaDispatchDraft.js';
import { wrapLegacyAction, actionReply } from '../lib/briaActions.js';

// La herramienta solo prepara: el modelo no tiene forma de despachar. El servidor despacha cuando la persona
// escribe «Despachar a producción» sobre el resumen guardado (ver briaConversationService).
export const createBriaDispatchTools = (service) => service ? [{
  name: 'preparar_despacho',
  description: 'Prepara o ajusta un despacho a producción: varias piezas de una misma parrilla, cada una con responsable, fecha de entrega y prioridad. NO crea tareas: muestra el resumen y la persona confirma. Úsala cuando la persona pida despachar, mandar a producción o preparar los pendientes de producción de una parrilla. Antes localiza la parrilla con parrilla_de_cliente y usa los ids de sus piezas; no incluyas las que ya están en producción ni las publicadas. Una corrección en el chat ajusta el mismo despacho.',
  allowed: canDispatch,
  parameters: { type: 'object', properties: {
    planId: { type: 'string', description: 'Id de la parrilla, de parrilla_de_cliente.' },
    piezas: { type: 'array', maxItems: 20, items: { type: 'object', properties: {
      pieza: { type: 'string', description: 'Id de la pieza.' },
      responsable: { type: ['string', 'null'], description: 'Nombre que dio la persona; no lo inventes.' },
      fecha: { type: ['string', 'null'], description: 'Entrega: mañana, viernes, 12 de octubre o YYYY-MM-DD. Sin fecha, la de publicación.' },
      prioridad: { type: ['string', 'null'], enum: ['normal', 'alta', null] }
    }, required: ['pieza', 'responsable', 'fecha', 'prioridad'], additionalProperties: false } },
    nuevo: { type: 'boolean', description: 'Solo si la persona pide otro despacho distinto.' }
  }, required: ['planId', 'piezas'], additionalProperties: false },
  async run(args, ctx) {
    const previous = ctx.pendingAction?.type === 'DISPATCH' ? ctx.pendingAction.draft : ctx.dispatchDraft;
    const draft = await service.prepare({ user: ctx.user, args, question: ctx.question, previous });
    const action = wrapLegacyAction('DISPATCH', draft, { title: `Despacho a producción de ${draft.client?.name || 'la cuenta'}` });
    const reply = actionReply(action);
    return { data: { stage: dispatchStage(draft), draft, message: reply.answer, created: false }, pendingAction: action, actionReply: reply, quickReplies: reply.quickReplies };
  }
}] : [];
