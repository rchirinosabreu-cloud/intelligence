import { ACTION_PERMISSION, ITEM_FORMATS, actionModules } from './briaActionService.js';
import { actionReply, actionStage } from '../lib/briaActions.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { hasModulePermission } from '../config/security.js';
import { hasFinancialPermission } from '../utils/financialPermissions.js';

// Las herramientas solo preparan: el modelo no tiene forma de cambiar nada. El servidor ejecuta cuando la
// persona escribe «Confirmar» sobre el resumen de la respuesta inmediatamente anterior (briaConversationService).
const allowedFor = (type) => (user) => canUseBria(user) && hasModulePermission(user, ACTION_PERMISSION[type]);
const run = (service, type) => async (args, ctx) => {
  const action = await service.prepare({ user: ctx.user, type, args, previous: ctx.pendingAction, attachments: ctx.chatAttachments || [] });
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
  description: 'Prepara el mismo cambio para varias tareas de Gestión a la vez (hasta 50): estado (en proceso, realizada o pendiente), responsable y/o fecha de entrega. NO cambia nada: muestra cuáles sí y cuáles no, avisa de lo que conviene mirar (compromisos con hora, pendientes privados, tareas en proceso con otra persona) y la persona confirma. Las tareas se dan por sus ids (de mis_tareas, tareas_de_cliente o buscar_pendientes) o, mejor, con «filtro» y «tareas» vacío cuando el pedido es por persona, cliente, sin responsable o vencidas («todos los pendientes de Jarlan, pónselos a Kamila», «los que no tienen asignación, a Francisco»): el servidor resuelve el lote. Devolver o reabrir piden motivo por tarea: para eso usa cambiar_pendiente de a una.',
  allowed: allowedFor('TASKS_STATUS'),
  parameters: { type: 'object', properties: {
    tareas: { type: 'array', maxItems: 50, items: { type: 'string' }, description: 'Ids de las tareas; vacío si se usa filtro.' },
    filtro: { type: ['object', 'null'], description: 'Qué tareas, resueltas en el servidor: responsable (nombre), sinResponsable, cliente (nombre o id), estado (pendientes, en_proceso, devueltas, realizadas, todas = no cerradas) y vencidas; combinables.', properties: {
      responsable: { type: ['string', 'null'] },
      sinResponsable: { type: ['boolean', 'null'] },
      cliente: { type: ['string', 'null'] },
      estado: { type: ['string', 'null'], enum: ['pendientes', 'en_proceso', 'devueltas', 'realizadas', 'todas', null] },
      vencidas: { type: ['boolean', 'null'] }
    }, additionalProperties: false },
    estado: { type: ['string', 'null'], enum: ['pendiente', 'en proceso', 'realizada', null] },
    responsable: { type: ['string', 'null'], description: 'Nuevo responsable: el nombre que dio la persona; no lo inventes.' },
    fecha: { type: ['string', 'null'], description: 'Nueva entrega: mañana, viernes, 15 de octubre o YYYY-MM-DD.' },
    nuevo: { type: 'boolean' }
  }, required: ['tareas', 'filtro', 'estado', 'responsable', 'fecha'], additionalProperties: false },
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
}, {
  // Registrar un movimiento conversando, con su comprobante (Rodny, 22 de octubre de 2026).
  name: 'registrar_movimiento',
  description: 'Prepara un movimiento de Financiero (un ingreso o un egreso) con su comprobante. Úsala cuando la persona pida registrar un pago, un gasto, un cobro o un movimiento, sobre todo si manda la foto o el PDF de un comprobante, una factura o un recibo: léelo tú (valor, fecha, a quién o de quién, concepto, número de referencia) y pasa lo que viste junto con lo que dijo la persona. NO registra nada: muestra un párrafo y la persona confirma. Lo que falte (la cuenta, la categoría…) lo pregunta la herramienta de a una cosa, con botones: no lo inventes ni lo preguntes tú antes. Si dice el cliente, pásalo por su nombre. Para corregir algo del resumen, vuelve a llamarla con lo nuevo.',
  allowed: (user) => allowedFor('FINANCIAL_RECORD')(user) && hasFinancialPermission(user, 'write'),
  parameters: { type: 'object', properties: {
    tipo: { type: ['string', 'null'], description: 'ingreso o egreso; deducido de lo que dijo la persona o del comprobante.' },
    valor: { type: ['string', 'null'], description: 'El valor total del comprobante o el que dijo la persona, en pesos, por ejemplo «1.200.000».' },
    fecha: { type: ['string', 'null'], description: 'El día del movimiento: YYYY-MM-DD del comprobante, o hoy, ayer, el lunes, 15 de octubre.' },
    cuenta: { type: ['string', 'null'], description: 'La cuenta de banco o caja, si la persona la dijo o se ve en el comprobante (banco o últimos cuatro dígitos).' },
    categoria: { type: ['string', 'null'], description: 'La categoría si la persona la dijo o es inequívoca (impuestos, nómina, pauta, banco); si no, null y la herramienta pregunta.' },
    cliente: { type: ['string', 'null'], description: 'El cliente, por su nombre, si el movimiento es de un cliente.' },
    concepto: { type: ['string', 'null'], description: 'Qué fue, en pocas palabras: «Licencia de Canva», «Pago de octubre».' },
    contraparte: { type: ['string', 'null'], description: 'A quién se le pagó o quién pagó, si no es un cliente.' },
    referencia: { type: ['string', 'null'], description: 'Número de comprobante, factura o transacción, si aparece.' },
    comprobante: { type: ['string', 'null'], description: 'El nombre del archivo del chat que es el comprobante, o «el último». Null si llegó con este mensaje o no hay comprobante.' },
    nuevo: { type: 'boolean', description: 'Solo si la persona pide registrar otro movimiento distinto.' }
  }, required: ['tipo', 'valor', 'fecha', 'cuenta', 'categoria', 'cliente', 'concepto', 'contraparte', 'referencia', 'comprobante'], additionalProperties: false },
  run: run(service, 'FINANCIAL_RECORD')
}, {
  // Los compromisos de una reunión, a pendientes (Rodny, 14 de octubre de 2026).
  name: 'pendientes_de_reunion',
  description: 'Prepara los pendientes que salieron de una reunión: lee los compromisos de su minuta (tarea, responsable y fecha que anotó el análisis) y arma un pendiente por cada uno, con el responsable del equipo que corresponde y la fecha. NO crea nada: muestra el resumen numerado y la persona confirma. Pasa la reunión por su título (o su id, si lo tienes de memoria_de_reuniones); si la persona dijo el cliente o una fecha para los que no la tienen, pásalos; lo demás lo pregunta la herramienta de a una cosa. Para corregir un compromiso concreto usa ajustes con su número: otro responsable, otra fecha u omitirlo. Lo que ya es pendiente no se repite.',
  allowed: (user) => canUseBria(user) && actionModules('MINUTE_TASKS').every((module) => hasModulePermission(user, module)),
  parameters: { type: 'object', properties: {
    reunion: { type: ['string', 'null'], description: 'Título (o id) de la reunión. Null para seguir con la misma reunión que se estaba preparando.' },
    cliente: { type: ['string', 'null'], description: 'Cliente de los pendientes, si la persona lo dijo; «sin cliente» si dijo que no tienen.' },
    fecha: { type: ['string', 'null'], description: 'Fecha para los compromisos que no traen una: mañana, viernes, 17 de octubre, YYYY-MM-DD o «sin fecha».' },
    ajustes: { type: ['array', 'null'], description: 'Correcciones por número de compromiso.', items: { type: 'object', properties: {
      n: { type: 'integer', description: 'Número del compromiso en el resumen.' },
      responsable: { type: ['string', 'null'], description: 'Otro responsable, con el nombre que dio la persona.' },
      fecha: { type: ['string', 'null'], description: 'Otra fecha para ese compromiso.' },
      omitir: { type: 'boolean', description: 'true para no crear ese compromiso.' }
    }, required: ['n', 'responsable', 'fecha', 'omitir'], additionalProperties: false } },
    nuevo: { type: 'boolean' }
  }, required: ['reunion', 'cliente', 'fecha', 'ajustes'], additionalProperties: false },
  run: run(service, 'MINUTE_TASKS')
}, {
  // La parrilla del mes en borrador (Rodny, 14 de octubre de 2026, opción 2: propuesta en el chat y «Confirmar» envía las elegidas).
  name: 'proponer_parrilla',
  description: 'Propone la parrilla de un mes para un cliente: Bria lee el contrato (piezas por formato), el objetivo del mes, los criterios editoriales aprobados y la parrilla anterior, y arma las piezas (objetivo, formato, día, idea para el equipo y texto de publicación) siguiendo el énfasis que diga la persona («el cliente quiere énfasis en el lanzamiento», «nada de descuentos»). NO crea nada: muestra las piezas numeradas y la persona elige cuáles enviar a la parrilla como borrador y confirma. Antes localiza el cliente con buscar_cliente y usa su id. Para quitar piezas usa omitir con sus números; para quedarse solo con algunas, solo; para otra propuesta con más énfasis, rehacer. Si la parrilla del mes no existe, se crea al confirmar y la herramienta pide responsable y objetivo.',
  allowed: allowedFor('PLAN_DRAFT'),
  parameters: { type: 'object', properties: {
    clientId: { type: 'string' },
    mes: { type: ['string', 'null'], description: 'Mes: «noviembre», «11», «este mes» o «próximo mes».' },
    anio: { type: ['integer', 'null'] },
    enfasis: { type: ['string', 'null'], description: 'Lo que pidió la persona y lo que le comunicó el cliente, con sus palabras. Se acumula entre llamadas.' },
    piezas: { type: ['integer', 'null'], description: 'Cuántas piezas proponer, solo si la persona lo dijo; si no, las del contrato.' },
    omitir: { type: ['array', 'null'], items: { type: 'integer' }, description: 'Números de piezas de la propuesta que no se envían.' },
    solo: { type: ['array', 'null'], items: { type: 'integer' }, description: 'Si la persona elige unas pocas: solo esos números se envían.' },
    rehacer: { type: 'boolean', description: 'true para pedir otra propuesta al modelo (con el énfasis acumulado).' },
    responsable: { type: ['string', 'null'], description: 'Solo si la parrilla no existe: quién será responsable.' },
    objetivo: { type: ['string', 'null'], description: 'Solo si la parrilla no existe: el objetivo estratégico del mes, o «Usar el énfasis como objetivo».' },
    nuevo: { type: 'boolean' }
  }, required: ['clientId', 'mes', 'anio', 'enfasis', 'piezas', 'omitir', 'solo', 'rehacer', 'responsable', 'objetivo'], additionalProperties: false },
  run: run(service, 'PLAN_DRAFT')
}] : [];
