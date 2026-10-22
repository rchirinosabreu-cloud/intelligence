import { canCreateBriaTask } from './briaTaskDraftService.js';
import { taskDraftStage } from '../lib/briaTaskDraft.js';
import { wrapLegacyAction, actionReply } from '../lib/briaActions.js';
const taskFields = {
  titulo: { type: 'string', description: 'Título breve sintetizado del trabajo pedido.' },
  contexto: { type: 'string', description: 'Solo si la persona dio más detalle que el título: síntesis fiel de ese contexto, que irá como comentario inicial. Conserva instrucciones y entregables, sin inventar; si solo dijo el título, no lo pases.' },
  cliente: { type: 'string', description: 'Nombre o slug que indicó la persona. Si no nombra ninguno y en esta conversación ya se creó un pendiente, la plataforma asume ese cliente: no lo inventes.' },
  responsable: { type: 'string', description: 'Nombre o email que indicó la persona.' },
  fecha: { type: 'string', description: 'Expresión de fecha de la persona: mañana, viernes, 9 de octubre o YYYY-MM-DD. No inventes una fecha.' },
  prioridad: { type: 'string', enum: ['normal','alta','urgente'], description: 'Solo si la persona la dijo. Si no, no la pases: queda Normal.' }
};
export const createBriaTaskTools = service => service ? [{
  name: 'preparar_pendiente',
  description: 'Prepara o ajusta el borrador de uno o varios pendientes con nombres vigentes de cliente y responsable, y lo deja listo para confirmar en una sola vuelta: no pregunta prioridad (Normal salvo que la persona diga otra) ni insumos (se añaden si los da, y se pueden adjuntar después en la tarea). NO crea la tarea: el servidor la crea solo cuando la persona confirma el resumen. Si la persona pide varios pendientes en un mensaje, pásalos todos en `pendientes` en una sola llamada, con lo común (cliente, responsable, fecha) arriba. Solo ante una solicitud explícita de crear pendientes o una continuación de su borrador.',
  allowed: canCreateBriaTask,
  parameters: { type: 'object', properties: {
    ...taskFields,
    referencias: { type: 'array', items: { type: 'string' } }, insumos: { type: 'array', items: { type: 'string' } },
    pendientes: { type: 'array', description: 'Varios pendientes de una vez, en el orden en que la persona los dijo. Cada uno con su título y contexto; cliente, responsable, fecha y prioridad solo si difieren de lo común. Para corregir uno, vuelve a pasar la lista completa en el mismo orden.', items: { type: 'object', properties: taskFields, additionalProperties: false } },
    nuevo: { type: 'boolean', description: 'Solo si la persona pide otro pendiente distinto.' }
  }, additionalProperties: false },
  async run(args, ctx) {
    const previous = ctx.pendingAction?.type === 'TASK_CREATE' ? ctx.pendingAction.draft : ctx.taskDraft;
    const draft = await service.prepare({ user: ctx.user, args, question: ctx.question, previous, attachments: ctx.taskAttachments, evidence: ctx.taskEvidence, defaults: ctx.taskDefaults || {} });
    const action = wrapLegacyAction('TASK_CREATE', draft);
    const reply = actionReply(action);
    return { data: { stage: taskDraftStage(draft), draft, message: reply.answer, created: false }, pendingAction: action, actionReply: reply, quickReplies: reply.quickReplies };
  }
}] : [];
