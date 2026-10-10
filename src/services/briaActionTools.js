import { ACTION_PERMISSION, ITEM_FORMATS } from './briaActionService.js';
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
}, {
  name: 'cambiar_pendientes',
  description: 'Prepara el mismo cambio de estado para varias tareas de Gestión a la vez (hasta 10): pasarlas a en proceso, realizada o pendiente. NO cambia nada: muestra cuáles sí y cuáles no, y la persona confirma. Úsala cuando pidan cerrar, arrancar o devolver a pendiente varias tareas juntas («cierra las tres de Aristea»). Antes localízalas con mis_tareas o tareas_de_cliente y usa sus ids. Devolver o reabrir piden motivo por tarea: para eso usa cambiar_pendiente de a una.',
  allowed: allowedFor('TASKS_STATUS'),
  parameters: { type: 'object', properties: {
    tareas: { type: 'array', maxItems: 10, items: { type: 'string' }, description: 'Ids de las tareas.' },
    estado: { type: ['string', 'null'], enum: ['pendiente', 'en proceso', 'realizada', null] },
    nuevo: { type: 'boolean' }
  }, required: ['tareas', 'estado'], additionalProperties: false },
  run: run(service, 'TASKS_STATUS')
}, {
  name: 'crear_pieza',
  description: 'Prepara una pieza nueva en la parrilla de un cliente: objetivo (el título que verá el equipo y el cliente), formato y día de publicación, con hora opcional. NO crea nada: muestra el resumen y la persona confirma. Pasa el id de la parrilla (de parrilla_de_cliente) o el id del cliente con el mes. Pasa lo que la persona dijo; lo que falte lo pregunta la herramienta. Avisa si ese día ya hay otra pieza o si la fecha cae fuera del mes.',
  allowed: allowedFor('CREATE_ITEM'),
  parameters: { type: 'object', properties: {
    planId: { type: ['string', 'null'], description: 'Id de la parrilla, de parrilla_de_cliente.' },
    clientId: { type: ['string', 'null'], description: 'Si no hay planId: el id del cliente.' },
    mes: { type: ['string', 'null'], description: 'Si no hay planId: el mes de la parrilla; sin mes, el actual.' },
    anio: { type: ['integer', 'null'] },
    objetivo: { type: ['string', 'null'], description: 'Qué quiere lograr la pieza, con las palabras de la persona.' },
    formato: { type: ['string', 'null'], enum: [...ITEM_FORMATS, null] },
    fecha: { type: ['string', 'null'], description: 'Día de publicación: martes, 21 de octubre o YYYY-MM-DD.' },
    hora: { type: ['string', 'null'], description: 'Hora de publicación HH:mm en reloj de Bogotá, solo si la persona la dijo.' },
    nuevo: { type: 'boolean' }
  }, required: ['planId', 'clientId', 'mes', 'anio', 'objetivo', 'formato', 'fecha', 'hora'], additionalProperties: false },
  run: run(service, 'CREATE_ITEM')
}, {
  name: 'mover_pieza',
  description: 'Prepara el cambio de fecha (y hora, si la dicen) de publicación de una pieza de la parrilla. NO cambia nada: muestra el resumen y la persona confirma. Antes localiza la pieza con parrilla_de_cliente y usa su id. Una pieza ya publicada no se mueve; si tiene una publicación programada en redes, se mueve con ella y la herramienta lo avisa.',
  allowed: allowedFor('MOVE_ITEM'),
  parameters: { type: 'object', properties: {
    pieza: { type: 'string', description: 'Id de la pieza.' },
    fecha: { type: ['string', 'null'], description: 'Nuevo día: jueves, 23 de octubre o YYYY-MM-DD.' },
    hora: { type: ['string', 'null'], description: 'Nueva hora HH:mm (Bogotá), solo si la persona la dijo.' },
    nuevo: { type: 'boolean' }
  }, required: ['pieza', 'fecha', 'hora'], additionalProperties: false },
  run: run(service, 'MOVE_ITEM')
}, {
  name: 'registrar_observacion',
  description: 'Prepara una observación en la ficha de un cliente (Operación de clientes): contexto que el equipo tiene que leer, como un acuerdo, una sensibilidad del cliente o un cambio de interlocutor. NO es un pendiente ni una tarea. NO escribe nada: muestra el resumen y la persona confirma. Antes localiza el cliente con buscar_cliente y usa su id. Pasa el texto con las palabras de la persona.',
  allowed: allowedFor('CLIENT_NOTE'),
  parameters: { type: 'object', properties: {
    clientId: { type: 'string' },
    texto: { type: ['string', 'null'], description: 'La observación, con las palabras de la persona.' },
    nuevo: { type: 'boolean' }
  }, required: ['clientId', 'texto'], additionalProperties: false },
  run: run(service, 'CLIENT_NOTE')
}] : [];
