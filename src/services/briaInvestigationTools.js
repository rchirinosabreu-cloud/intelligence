import { isManagerRole, hasModulePermission } from '../config/security.js';
import { buildInvestigation, INVESTIGATION_AREAS } from '../lib/briaInvestigation.js';
import { getTeamActivityStatus } from './activityStatusService.js';
import { canOpenTask, TASK_PRIVACY_SELECT, PRIVATE_TASK_HINT } from '../lib/taskPrivacy.js';
import { taskTemporalEvidence } from '../lib/briaTemporalEvidence.js';

const text = { type: 'string', maxLength: 1200 }, ids = { type: 'array', maxItems: 10, items: text };
const rows = (properties, maxItems = 10) => ({ type: 'array', maxItems, items: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } });
const bogotaTime = value => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
export const briaInvestigationTools = [{
  name: 'leer_pendiente',
  description: 'Abre el detalle autorizado de una tarea identificada en Gestión: descripción, responsable, plazos separados y conversación reciente. Si puedes leer Parrillas, incluye la identidad de la pieza vinculada para contrastar su aprobación, contenido y publicación con leer_piezas_de_parrilla. La cabecera sola no demuestra bloqueos ni avance. Relaciona semánticamente los candidatos con el asunto; si hay ambigüedad pregunta antes de elegir. Ver un título no concede acceso al detalle privado, ni siquiera a un administrador. No modifica nada.',
  parameters: { type: 'object', properties: { id: text }, required: ['id'], additionalProperties: false },
  allowed: user => hasModulePermission(user, 'gestion'),
  async run({ id }, ctx) {
    if (typeof id !== 'string' || !id.trim()) throw Object.assign(new Error('Falta identificar la tarea.'), { status: 400 });
    const editorial = hasModulePermission(ctx.user, 'parrillas');
    const row = await ctx.db.task.findUnique({ where: { id }, select: {
      ...TASK_PRIVACY_SELECT, id: true, title: true, status: true, comments: true, dueDate: true, focusDeadlineAt: true, completedAt: true, updatedAt: true,
      client: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true, userId: true } },
      ...(editorial ? { contentItem: { select: { id: true, planId: true, objective: true, status: true, publishDate: true, publishTime: true, deletedAt: true, plan: { select: { id: true, deletedAt: true } } } } } : {}),
      taskComments: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 31, select: { id: true, content: true, createdAt: true, author: { select: { name: true } } } }
    } });
    if (!row) throw Object.assign(new Error('La tarea ya no está disponible.'), { status: 404 });
    if (!canOpenTask(row, ctx.user.userId || ctx.user.id)) throw Object.assign(new Error(PRIVATE_TASK_HINT), { status: 403 });
    const comments = row.taskComments || [];
    const item = editorial && row.contentItem && !row.contentItem.deletedAt && row.contentItem.plan && !row.contentItem.plan.deletedAt ? row.contentItem : null;
    const pieza = item ? { id: item.id, planId: item.planId, titulo: item.objective, estado: item.status } : null;
    return { data: { tarea: { id: row.id, titulo: row.title, estado: row.status, cliente: row.client, responsable: row.assignee?.name || null,
      descripcion: (row.comments || '').slice(0, 12000), vence: row.dueDate, horaLimiteBogota: row.focusDeadlineAt ? bogotaTime(row.focusDeadlineAt) : null,
      completadaEn: row.completedAt, actualizadaEn: row.updatedAt,
      pieza, plazos: taskTemporalEvidence({ ...row, contentItem: item }, { today: ctx.today, now: ctx.now?.() || new Date() }),
      comentarios: comments.slice(0, 30).map(comment => ({ id: comment.id, texto: comment.content.slice(0, 4000), fecha: comment.createdAt, autor: comment.author?.name || null })) },
      recortada: comments.length > 30 || (row.comments || '').length > 12000 || comments.slice(0, 30).some(comment => comment.content.length > 4000)
    }, sources: [{ kind: 'tarea', id: row.id, label: row.title, url: `/gestion?taskId=${row.id}` }, ...(pieza ? [{ kind: 'pieza', id: pieza.id, label: pieza.titulo, url: `/parrillas/${pieza.planId}?item=${pieza.id}` }] : [])] };
  }
}, {
  name: 'actividad_del_equipo',
  description: 'Consulta el estado actual registrado en Actividad, incluidas reuniones vigentes y trabajo en curso. Sirve para disponibilidad actual; las tareas y las previsiones no lo sustituyen. No demuestra presencia física. No modifica nada.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  allowed: user => hasModulePermission(user, 'actividad'),
  async run(_args, ctx) {
    const now = ctx.now?.() || new Date();
    const data = await (ctx.readActivity || getTeamActivityStatus)({ db: ctx.db, now });
    const people = data.map(row => ({ id: row.id, nombre: row.name, estado: row.status,
      tarea: hasModulePermission(ctx.user, 'gestion') && row.currentTask ? { id: row.currentTask.id, titulo: row.currentTask.title, cliente: row.currentTask.clientName } : null,
      evento: row.currentEvent ? { id: row.currentEvent.id, titulo: row.currentEvent.title, tipo: row.currentEvent.type,
        vigenteEnConsulta: new Date(row.currentEvent.startAt) <= now && now < new Date(row.currentEvent.endAt),
        horarioBogota: { inicio: bogotaTime(row.currentEvent.startAt), fin: bogotaTime(row.currentEvent.endAt), zonaHoraria: 'America/Bogota' }
      } : null
    }));
    return { data: { consultadoEn: now.toISOString(), horaConsultaBogota: bogotaTime(now), personas: people, alcance: 'Estado registrado en el instante de consulta indicado. vigenteEnConsulta calcula si el evento sigue en curso en ese instante. No certifica presencia física ni disponibilidad futura.' }, sources: [{ kind: 'actividad', id: 'equipo', label: 'Actividad actual', url: '/actividad' }, ...people.filter(row => row.tarea).map(row => ({ kind: 'tarea_resumen', id: row.tarea.id }))] };
  }
}, {
  name: 'actualizar_seguimiento',
  strict: true,
  description: 'Organiza una investigación operativa y la conserva en esta conversación para retomarla, cuando la persona pide conservar o actualizar un seguimiento; una consulta de panorama no crea por sí sola un seguimiento. Investiga primero eligiendo las fuentes por el propósito y el alcance temporal del pedido: tareas, contenido y aprobaciones, Actividad actual, contexto y carga cuando sean pertinentes, y el mapa de la plataforma si te falta una capacidad; explica lo no consultado o no aplicable. Cada lectura compatible devuelve comprobanteConsulta con id; cita esos ids del turno actual. Cuando el pedido requiera decidir entre vías distintas, plantea maneras distintas de resolver el mismo objetivo con beneficio, efectos, costo e incertidumbre, sin inventar duración, causalidad ni disponibilidad; explica en la conversación la opción recomendada y qué cambiaría al elegir otra, no solo en los campos internos. Dos acciones complementarias o recomendaciones para cuentas distintas no son por eso alternativas entre sí; un siguiente paso o una actualización explican lo que cambió sin inventar otra decisión ni repetir opciones anteriores. Define condiciones observables de resolución. Marca explícitamente las áreas que no aplican o faltan; nunca supongas cobertura total. Al retomar conserva el objetivo y las condiciones de resolución, vuelve a consultar evidencia nueva y distingue acción ejecutada de problema resuelto: una acción ejecutada no prueba que el problema se resolvió. Este registro solo es análisis: una corrección del análisis no modifica la plataforma, no cambia tareas, asignaciones o fechas ni envía mensajes. Elegir una opción permite preparar su cambio solo si la persona lo pide, y la ejecución siempre espera la aprobación del resumen: vincula accionPreparada solo si la persona pidió preparar esa alternativa y existe el borrador. No la uses para saludos ni tareas sencillas sin pedido de análisis o seguimiento.',
  parameters: { type: 'object', properties: {
    nueva: { type: 'boolean' }, asunto: { ...text, maxLength: 200 }, objetivo: text,
    cobertura: rows({ area: { type: 'string', enum: INVESTIGATION_AREAS }, estado: { type: 'string', enum: ['CONSULTADA', 'PENDIENTE', 'NO_APLICA'], description: 'CONSULTADA: lectura realizada, aunque queden dudas de negocio. PENDIENTE: falta lectura o acceso. NO_APLICA: área irrelevante para este asunto, con motivo y sin consultas; falta de acceso no significa que no aplique.' }, consultas: ids, motivo: text }, 5),
    hallazgos: rows({ texto: text, consultas: { ...ids, minItems: 1, description: 'Ids de lecturas compatibles del turno actual. Si no hay lectura que lo respalde, va en incertidumbres, no en hallazgos.' } }),
    decision: { type: ['string', 'null'], description: 'La pregunta concreta entre cuyos caminos hay que elegir ahora, distinta del objetivo general que seguirá abierto. Cada alternativa debe responder a esta misma decisión y explicar qué se gana o pierde al elegirla frente a las otras. Si dos propuestas se pueden cumplir juntas, son pasos complementarios, no caminos entre los que elegir. Usa null si esta revisión solo actualiza el progreso o propone un siguiente paso sin comparación.' },
    alternativas: { ...rows({ propuesta: text, beneficio: text, costo: text, incertidumbre: text, consultas: { ...ids, minItems: 1 } }, 4), description: 'Si el pedido requiere comparar una decisión, plantea vías distintas para resolver ese mismo objetivo y sus consecuencias; explica en el relato qué cambia al elegir una u otra. No rellenes opciones con pasos complementarios o recomendaciones para otras cuentas. Al retomar conserva objetivo y condiciones, pero reevalúa las opciones según la evidencia nueva: no copies alternativas obsoletas para llenar el registro. Si solo corresponde contar qué cambió y el siguiente paso, usa [] y recomendada null; no fabriques una decisión para cada actualización.' },
    recomendada: { type: ['string', 'null'], description: 'Número de la alternativa recomendada en esta revisión, o null si no corresponde comparar vías distintas ahora o faltan datos.' },
    incertidumbres: { type: 'array', maxItems: 10, items: text, description: 'Preguntas y datos por aclarar, escritos en palabras. No son identificadores de consultas.' },
    relato: { ...rows({ texto: text, consultas: { ...ids, minItems: 1 } }, 6), description: 'Respuesta conversacional para la persona, con la voz general de Bria. Ajusta la extensión a la profundidad del pedido y a lo nuevo que encontraste, sin mínimo de palabras; máximo 4000 caracteres entre los párrafos. Empieza por la respuesta a su preocupación y explica por qué con hechos concretos; enlaza la recomendación, la duda que podría cambiarla y las alternativas pertinentes con sus consecuencias. En una continuación parte del acuerdo previo y de qué cambió o sigue pendiente. Usa solo la evidencia de este turno y el registro que estás guardando; cita sus ids en consultas, nunca en el texto. No recites el registro como ficha ni repitas objetivo, listas de fuentes o todos los criterios. El relato será la respuesta completa, sin coletillas añadidas por el servidor. Cuando guardes este seguimiento, incluye en la conversación su estado real y la siguiente comprobación propuesta, con naturalidad y sin recitar el registro. Si lo mantienes abierto, explica qué falta para cerrarlo. La revisión es una propuesta, no un aviso automático; no prometas contactar, ejecutar ni volver sola. No afirmes un cierre antes de validar todas las condiciones ni una cobertura que falte. El servidor guarda el registro si es válido. Si no hay evidencia consultada usa una lista vacía y conserva lo pendiente.' },
    comprobaciones: rows({ id: { type: 'string', description: 'Al retomar, usa todos los ids originales: no inventes ni omitas condiciones.' }, criterio: { type: ['string', 'null'], description: 'Condición observable que resuelve la preocupación original, no solo completar el diagnóstico o decidir un plan. Para una entrega exige entregar y validar lo comprometido; acordar otra fecha o un plan de alcance no sustituye ese resultado ni cierra el asunto. Al retomar envía null: el servidor conserva el criterio original por id; solo se actualizan resultado y consultas.' }, resultado: { type: 'string', enum: ['PENDIENTE', 'CUMPLIDO', 'NO_CUMPLIDO', 'DESCONOCIDO'] }, consultas: ids }),
    proximaRevision: { type: 'string', description: 'Siguiente comprobación concreta: qué dato o resultado falta y un momento o condición propuesta. Distingue propuestas de acuerdos; no inventes un responsable ni una fecha comprometida. No programa avisos ni promete volver sola.' },
    accionPreparada: { type: ['string', 'null'], description: 'Id del borrador preparado para la alternativa que la persona pidió, o null si no existe. No autoriza ejecutarlo.' }
  }, required: ['nueva', 'asunto', 'objetivo', 'cobertura', 'hallazgos', 'decision', 'alternativas', 'recomendada', 'incertidumbres', 'relato', 'comprobaciones', 'proximaRevision', 'accionPreparada'], additionalProperties: false },
  allowed: user => isManagerRole(user.role),
  async run(args, ctx) {
    const investigation = buildInvestigation(args, { previous: ctx.investigation, receipts: ctx.investigationReceipts, now: ctx.now?.() || new Date(), action: ctx.pendingAction });
    return { data: { id: investigation.id, revision: investigation.revision, estado: investigation.estado, cobertura: investigation.cobertura, comprobaciones: investigation.comprobaciones, proximaRevision: investigation.proximaRevision, ejecucionAutorizada: false, seguimientoAutomatico: false }, investigation, sources: investigation.sources };
  }
}];
