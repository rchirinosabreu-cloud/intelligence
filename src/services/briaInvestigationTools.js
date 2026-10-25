import { isManagerRole, hasModulePermission } from '../config/security.js';
import { buildInvestigation, INVESTIGATION_AREAS } from '../lib/briaInvestigation.js';
import { getTeamActivityStatus } from './activityStatusService.js';

const text = { type: 'string' }, ids = { type: 'array', items: text };
const rows = properties => ({ type: 'array', items: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } });
const bogotaTime = value => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
export const briaInvestigationTools = [{
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
        horarioBogota: { inicio: bogotaTime(row.currentEvent.startAt), fin: bogotaTime(row.currentEvent.endAt), zonaHoraria: 'America/Bogota' }
      } : null
    }));
    return { data: { consultadoEn: now.toISOString(), personas: people, alcance: 'Estado registrado ahora; no certifica presencia física ni disponibilidad futura.' }, sources: [{ kind: 'actividad', id: 'equipo', label: 'Actividad actual', url: '/actividad' }, ...people.filter(row => row.tarea).map(row => ({ kind: 'tarea_resumen', id: row.tarea.id }))] };
  }
}, {
  name: 'actualizar_seguimiento',
  description: 'Organiza una investigación operativa y la conserva en esta conversación para retomarla. Investiga primero usando las lecturas pertinentes de tareas, contenido/aprobaciones, Actividad, contexto y carga. Cada lectura compatible devuelve comprobanteConsulta con id; cita esos ids del turno actual. Compara alternativas con beneficio, costo e incertidumbre, y define condiciones observables de resolución. Marca explícitamente las áreas que no aplican o faltan; nunca supongas cobertura total. Al retomar vuelve a consultar: una acción ejecutada no prueba que el problema se resolvió. Este registro solo es análisis, no cambia tareas, asignaciones o fechas ni envía mensajes. Solo vincula accionPreparada si la persona pidió preparar esa alternativa y existe el borrador. Conserva las comprobaciones y el objetivo originales al seguir el mismo asunto. No la uses para saludos ni tareas sencillas sin pedido de análisis o seguimiento.',
  parameters: { type: 'object', properties: {
    nueva: { type: 'boolean' }, asunto: text, objetivo: text,
    cobertura: rows({ area: { type: 'string', enum: INVESTIGATION_AREAS }, estado: { type: 'string', enum: ['CONSULTADA', 'PENDIENTE', 'NO_APLICA'], description: 'CONSULTADA: lectura realizada, aunque queden dudas de negocio. PENDIENTE: falta lectura o acceso. NO_APLICA: área irrelevante para este asunto, con motivo y sin consultas; falta de acceso no significa que no aplique.' }, consultas: ids, motivo: text }),
    hallazgos: rows({ texto: text, consultas: { ...ids, minItems: 1, description: 'Ids de lecturas compatibles del turno actual. Si no hay lectura que lo respalde, va en incertidumbres, no en hallazgos.' } }),
    alternativas: rows({ propuesta: text, beneficio: text, costo: text, incertidumbre: text, consultas: { ...ids, minItems: 1 } }),
    recomendada: { type: ['string', 'null'], description: 'Número de la alternativa recomendada en esta revisión, o null si faltan datos.' },
    incertidumbres: ids,
    comprobaciones: rows({ id: { type: 'string', description: 'Al retomar, usa todos los ids originales: no inventes ni omitas condiciones.' }, criterio: { type: ['string', 'null'], description: 'Condición observable al crear el asunto. Al retomar envía null: el servidor conserva el criterio original por id; solo se actualizan resultado y consultas.' }, resultado: { type: 'string', enum: ['PENDIENTE', 'CUMPLIDO', 'NO_CUMPLIDO', 'DESCONOCIDO'] }, consultas: ids }),
    proximaRevision: { type: 'string', description: 'Momento o condición propuesta para volver a comprobar; no programa avisos ni promete volver sola.' },
    accionPreparada: { type: 'string', description: 'Id del borrador preparado para la alternativa que la persona pidió. No autoriza ejecutarlo.' }
  }, required: ['asunto', 'objetivo', 'cobertura', 'hallazgos', 'alternativas', 'comprobaciones', 'proximaRevision'], additionalProperties: false },
  allowed: user => isManagerRole(user.role),
  async run(args, ctx) {
    const investigation = buildInvestigation(args, { previous: ctx.investigation, receipts: ctx.investigationReceipts, now: ctx.now?.() || new Date(), action: ctx.pendingAction });
    return { data: { id: investigation.id, revision: investigation.revision, estado: investigation.estado, ejecucionAutorizada: false, seguimientoAutomatico: false }, investigation, sources: investigation.sources };
  }
}];
