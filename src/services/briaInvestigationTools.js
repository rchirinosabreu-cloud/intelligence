import { isManagerRole, hasModulePermission } from '../config/security.js';
import { buildInvestigation, INVESTIGATION_AREAS } from '../lib/briaInvestigation.js';
import { getTeamActivityStatus } from './activityStatusService.js';
import { canOpenTask, TASK_PRIVACY_SELECT, PRIVATE_TASK_HINT } from '../lib/taskPrivacy.js';

const text = { type: 'string', maxLength: 1200 }, ids = { type: 'array', maxItems: 10, items: text };
const rows = (properties, maxItems = 10) => ({ type: 'array', maxItems, items: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } });
const bogotaTime = value => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
export const briaInvestigationTools = [{
  name: 'leer_pendiente',
  description: 'Abre el detalle autorizado de una tarea identificada en Gestión: descripción, responsable, vencimiento y conversación reciente. La cabecera sola no demuestra bloqueos ni avance. Relaciona semánticamente los candidatos con el asunto; si hay ambigüedad pregunta antes de elegir. Ver un título no concede acceso al detalle privado, ni siquiera a un administrador. No modifica nada.',
  parameters: { type: 'object', properties: { id: text }, required: ['id'], additionalProperties: false },
  allowed: user => hasModulePermission(user, 'gestion'),
  async run({ id }, ctx) {
    if (typeof id !== 'string' || !id.trim()) throw Object.assign(new Error('Falta identificar la tarea.'), { status: 400 });
    const row = await ctx.db.task.findUnique({ where: { id }, select: {
      ...TASK_PRIVACY_SELECT, id: true, title: true, status: true, comments: true, dueDate: true, focusDeadlineAt: true, completedAt: true, updatedAt: true,
      client: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true, userId: true } },
      taskComments: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 31, select: { id: true, content: true, createdAt: true, author: { select: { name: true } } } }
    } });
    if (!row) throw Object.assign(new Error('La tarea ya no está disponible.'), { status: 404 });
    if (!canOpenTask(row, ctx.user.userId || ctx.user.id)) throw Object.assign(new Error(PRIVATE_TASK_HINT), { status: 403 });
    const comments = row.taskComments || [];
    return { data: { tarea: { id: row.id, titulo: row.title, estado: row.status, cliente: row.client, responsable: row.assignee?.name || null,
      descripcion: (row.comments || '').slice(0, 12000), vence: row.dueDate, horaLimiteBogota: row.focusDeadlineAt ? bogotaTime(row.focusDeadlineAt) : null,
      completadaEn: row.completedAt, actualizadaEn: row.updatedAt,
      comentarios: comments.slice(0, 30).map(comment => ({ id: comment.id, texto: comment.content.slice(0, 4000), fecha: comment.createdAt, autor: comment.author?.name || null })) },
      recortada: comments.length > 30 || (row.comments || '').length > 12000 || comments.slice(0, 30).some(comment => comment.content.length > 4000)
    }, sources: [{ kind: 'tarea', id: row.id, label: row.title, url: `/gestion?taskId=${row.id}` }] };
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
  description: 'Organiza una investigación operativa y la conserva en esta conversación para retomarla. Investiga primero usando las lecturas pertinentes de tareas, contenido/aprobaciones, Actividad, contexto y carga. Cada lectura compatible devuelve comprobanteConsulta con id; cita esos ids del turno actual. Compara alternativas con beneficio, costo e incertidumbre, y define condiciones observables de resolución. Marca explícitamente las áreas que no aplican o faltan; nunca supongas cobertura total. Al retomar vuelve a consultar: una acción ejecutada no prueba que el problema se resolvió. Este registro solo es análisis, no cambia tareas, asignaciones o fechas ni envía mensajes. Solo vincula accionPreparada si la persona pidió preparar esa alternativa y existe el borrador. Conserva las comprobaciones y el objetivo originales al seguir el mismo asunto. No la uses para saludos ni tareas sencillas sin pedido de análisis o seguimiento.',
  parameters: { type: 'object', properties: {
    nueva: { type: 'boolean' }, asunto: { ...text, maxLength: 200 }, objetivo: text,
    cobertura: rows({ area: { type: 'string', enum: INVESTIGATION_AREAS }, estado: { type: 'string', enum: ['CONSULTADA', 'PENDIENTE', 'NO_APLICA'], description: 'CONSULTADA: lectura realizada, aunque queden dudas de negocio. PENDIENTE: falta lectura o acceso. NO_APLICA: área irrelevante para este asunto, con motivo y sin consultas; falta de acceso no significa que no aplique.' }, consultas: ids, motivo: text }, 5),
    hallazgos: rows({ texto: text, consultas: { ...ids, minItems: 1, description: 'Ids de lecturas compatibles del turno actual. Si no hay lectura que lo respalde, va en incertidumbres, no en hallazgos.' } }),
    alternativas: rows({ propuesta: text, beneficio: text, costo: text, incertidumbre: text, consultas: { ...ids, minItems: 1 } }, 4),
    recomendada: { type: ['string', 'null'], description: 'Número de la alternativa recomendada en esta revisión, o null si faltan datos.' },
    incertidumbres: { type: 'array', maxItems: 10, items: text, description: 'Preguntas y datos por aclarar, escritos en palabras. No son identificadores de consultas.' },
    relato: { ...rows({ texto: text, consultas: { ...ids, minItems: 1 } }, 6), description: 'Respuesta conversacional para la persona, en párrafos conectados y sin encabezados de ficha. Apunta a 150–250 palabras, máximo 4000 caracteres entre los párrafos. Empieza por lo que encontraste y qué implica para su preocupación; conecta evidencia, incertidumbre principal, recomendación razonada y alternativas relevantes con sus diferencias. En una continuación explica qué cambió o sigue igual. Usa solo la evidencia de este turno y el registro que estás guardando; cita sus ids en consultas, nunca en el texto. No repitas objetivo, listas de fuentes, todos los criterios ni los rótulos del registro. No afirmes que guardaste, cerraste, programaste o ejecutaste algo: el servidor añade el estado real y los límites al guardar. Si no hay evidencia consultada usa una lista vacía y conserva lo pendiente.' },
    comprobaciones: rows({ id: { type: 'string', description: 'Al retomar, usa todos los ids originales: no inventes ni omitas condiciones.' }, criterio: { type: ['string', 'null'], description: 'Condición observable que resuelve la preocupación original, no solo completar el diagnóstico o decidir un plan. Para una entrega exige entregar y validar lo comprometido; acordar otra fecha o un plan de alcance no sustituye ese resultado ni cierra el asunto. Al retomar envía null: el servidor conserva el criterio original por id; solo se actualizan resultado y consultas.' }, resultado: { type: 'string', enum: ['PENDIENTE', 'CUMPLIDO', 'NO_CUMPLIDO', 'DESCONOCIDO'] }, consultas: ids }),
    proximaRevision: { type: 'string', description: 'Siguiente comprobación concreta: qué dato o resultado falta y un momento o condición propuesta. Distingue propuestas de acuerdos; no inventes un responsable ni una fecha comprometida. No programa avisos ni promete volver sola.' },
    accionPreparada: { type: ['string', 'null'], description: 'Id del borrador preparado para la alternativa que la persona pidió, o null si no existe. No autoriza ejecutarlo.' }
  }, required: ['nueva', 'asunto', 'objetivo', 'cobertura', 'hallazgos', 'alternativas', 'recomendada', 'incertidumbres', 'relato', 'comprobaciones', 'proximaRevision', 'accionPreparada'], additionalProperties: false },
  allowed: user => isManagerRole(user.role),
  async run(args, ctx) {
    const investigation = buildInvestigation(args, { previous: ctx.investigation, receipts: ctx.investigationReceipts, now: ctx.now?.() || new Date(), action: ctx.pendingAction });
    return { data: { id: investigation.id, revision: investigation.revision, estado: investigation.estado, ejecucionAutorizada: false, seguimientoAutomatico: false }, investigation, sources: investigation.sources };
  }
}];
