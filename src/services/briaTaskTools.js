import { canCreateBriaTask } from './briaTaskDraftService.js';
import { taskDraftReply, taskDraftStage } from '../lib/briaTaskDraft.js';
export const createBriaTaskTools = service => service ? [{
  name: 'preparar_pendiente',
  description: 'Prepara o ajusta un borrador de pendiente usando nombres vigentes de cliente y responsable. NO crea una tarea: pide materiales, prioridad y confirmación en el chat. Solo ante una solicitud explícita de crear pendiente o una continuación de su borrador.',
  allowed: canCreateBriaTask,
  parameters: { type: 'object', properties: {
    titulo: { type: 'string', description: 'Título breve sintetizado del trabajo pedido.' },
    contexto: { type: 'string', description: 'Síntesis fiel del contexto proporcionado por la persona; irá como comentario inicial. Conserva instrucciones y entregables, sin inventar.' },
    cliente: { type: 'string', description: 'Nombre o slug que indicó la persona.' },
    responsable: { type: 'string', description: 'Nombre o email que indicó la persona.' },
    fecha: { type: 'string', description: 'Expresión de fecha de la persona: mañana, viernes, 9 de octubre o YYYY-MM-DD. No inventes una fecha.' },
    prioridad: { type: 'string', enum: ['normal','alta','urgente'] },
    referencias: { type: 'array', items: { type: 'string' } }, insumos: { type: 'array', items: { type: 'string' } },
    nuevo: { type: 'boolean', description: 'Solo si la persona pide otro pendiente distinto.' }
  }, additionalProperties: false },
  async run(args, ctx) {
    const draft = await service.prepare({ user: ctx.user, args, question: ctx.question, previous: ctx.taskDraft, attachments: ctx.taskAttachments, evidence: ctx.taskEvidence });
    const reply = taskDraftReply(draft);
    return { data: { stage: taskDraftStage(draft), draft, message: reply.answer, created: false }, taskDraft: draft, taskReply: reply, quickReplies: reply.quickReplies };
  }
}] : [];
