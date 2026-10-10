import { ACTION_PERMISSION } from './briaActionService.js';
import { actionReply, actionStage } from '../lib/briaActions.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { hasModulePermission } from '../config/security.js';

// Las herramientas solo preparan: el modelo no tiene forma de cambiar nada. El servidor ejecuta cuando la
// persona escribe «Confirmar» sobre el resumen de la respuesta inmediatamente anterior (briaConversationService).
const allowedFor = (type) => (user) => canUseBria(user) && hasModulePermission(user, ACTION_PERMISSION[type]);
const run = (service, type) => async (args, ctx) => {
  const action = await service.prepare({ user: ctx.user, type, args, previous: ctx.pendingAction });
  const reply = actionReply(action);
  return { data: { stage: actionStage(action), action, message: reply.answer, done: false }, pendingAction: action, actionReply: reply, quickReplies: reply.quickReplies };
};

export const createBriaActionTools = (service) => service ? [{
  name: 'cambiar_pendiente',
  description: 'Prepara un cambio en una tarea de Gestión: estado (pendiente, en proceso, realizada, devuelta), responsable, fecha de entrega o prioridad. NO cambia nada: muestra el resumen y la persona confirma. Úsala cuando pidan mover, cerrar, devolver, reabrir, reasignar o reprogramar un pendiente. Antes localiza la tarea con mis_tareas o tareas_de_cliente y usa su id; si hay varias parecidas, pregunta cuál. Devolver y reabrir piden motivo y nota: pásalos si la persona los dio. Una corrección en el chat ajusta el mismo cambio: vuelve a llamarla con lo nuevo.',
  allowed: allowedFor('TASK_UPDATE'),
  parameters: { type: 'object', properties: {
    tarea: { type: 'string', description: 'Id de la tarea.' },
    estado: { type: ['string', 'null'], enum: ['pendiente', 'en proceso', 'realizada', 'devuelta', null] },
    responsable: { type: ['string', 'null'], description: 'Nombre que dio la persona; no lo inventes.' },
    fecha: { type: ['string', 'null'], description: 'Entrega: mañana, viernes, 15 de octubre o YYYY-MM-DD.' },
    prioridad: { type: ['string', 'null'], enum: ['normal', 'alta', 'urgente', null] },
    motivo: { type: ['string', 'null'], description: 'Al devolver o reabrir: el motivo, con las palabras de la persona o uno de los del catálogo.' },
    nota: { type: ['string', 'null'], description: 'Al devolver o reabrir: la nota para la persona.' },
    nuevo: { type: 'boolean', description: 'Solo si la persona pide otro cambio distinto al que se estaba preparando.' }
  }, required: ['tarea', 'estado', 'responsable', 'fecha', 'prioridad', 'motivo', 'nota'], additionalProperties: false },
  run: run(service, 'TASK_UPDATE')
}, {
  name: 'crear_parrilla',
  description: 'Prepara la creación de la parrilla de contenido de un cliente para un mes, con buenas prácticas: pide quién será el responsable y cuál es el objetivo estratégico antes de crearla. NO crea nada: muestra el resumen y la persona confirma. Antes localiza el cliente con buscar_cliente y usa su id. Pasa el responsable y el objetivo si la persona ya los dijo; si no, la herramienta los pregunta.',
  allowed: allowedFor('CREATE_PLAN'),
  parameters: { type: 'object', properties: {
    clientId: { type: 'string' },
    mes: { type: ['string', 'null'], description: 'Mes: «noviembre», «11», «este mes» o «próximo mes».' },
    anio: { type: ['integer', 'null'] },
    responsable: { type: ['string', 'null'], description: 'Nombre que dio la persona; no lo inventes.' },
    objetivo: { type: ['string', 'null'], description: 'El objetivo estratégico del mes, con las palabras de la persona.' },
    nuevo: { type: 'boolean' }
  }, required: ['clientId', 'mes', 'anio', 'responsable', 'objetivo'], additionalProperties: false },
  run: run(service, 'CREATE_PLAN')
}] : [];
