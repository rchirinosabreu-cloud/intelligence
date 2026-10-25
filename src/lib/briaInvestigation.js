import { randomUUID } from 'node:crypto';
import { knowledgeError } from './briaKnowledge.js';

// Capacidades de lectura, no frases del usuario. El modelo decide qué necesita investigar.
export const INVESTIGATION_READS = {
  tareas_de_cliente: 'TAREAS', buscar_pendientes: 'TAREAS', mis_tareas: 'TAREAS', leer_pendiente: 'TAREAS',
  parrilla_de_cliente: 'CONTENIDO', leer_piezas_de_parrilla: 'CONTENIDO', criterios_y_hallazgos: 'CONTENIDO', publicaciones_programadas: 'CONTENIDO',
  actividad_del_equipo: 'ACTIVIDAD',
  operacion_de_cliente: 'CONTEXTO', memoria_de_reuniones: 'CONTEXTO',
  carga_del_equipo: 'CARGA', ritmo_del_equipo: 'CARGA'
};
export const INVESTIGATION_AREAS = ['TAREAS', 'CONTENIDO', 'ACTIVIDAD', 'CONTEXTO', 'CARGA'];
const string = (value, limit = 1200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw knowledgeError('Falta un texto válido en la investigación.');
  return value.trim();
};
const list = (value, max = 10) => {
  if (!Array.isArray(value) || value.length > max) throw knowledgeError('La investigación excede el tamaño permitido o está incompleta.');
  return value;
};
const unique = sources => [...new Map(sources.map(source => [`${source.kind}:${source.id}`, source])).values()];

export const buildInvestigation = (args, { previous, receipts = [], now = new Date(), action } = {}) => {
  const prior = args.nueva === true ? null : previous;
  const byId = new Map(receipts.map(receipt => [receipt.id, receipt]));
  if (args.incertidumbres?.some(value => byId.has(value))) throw knowledgeError('Las incertidumbres deben explicar qué falta saber, no contener identificadores de consultas.');
  const selected = ids => list(ids).map(id => {
    const receipt = byId.get(id);
    if (!receipt) throw knowledgeError('Una fuente citada no fue consultada en este turno. Vuelve a leerla antes de actualizar el seguimiento.');
    return receipt;
  });
  const coverage = new Map();
  for (const row of list(args.cobertura, 5)) {
    if (!INVESTIGATION_AREAS.includes(row.area) || coverage.has(row.area)) throw knowledgeError('Revisa las áreas de la investigación.');
    const reads = selected(row.consultas || []);
    if (reads.some(read => read.area !== row.area)) throw knowledgeError('Esa consulta no acredita el área que se está revisando.');
    if (!['CONSULTADA', 'PENDIENTE', 'NO_APLICA'].includes(row.estado)) throw knowledgeError('El estado de cobertura no es válido.');
    const reason = row.motivo ? string(row.motivo) : null;
    if (row.estado === 'NO_APLICA' && (reads.length || !reason)) throw knowledgeError('Un área no aplicable necesita un motivo y no puede tener consultas.');
    const state = row.estado === 'CONSULTADA' && (!reads.length || reads.some(read => read.partial)) ? 'PENDIENTE' : row.estado;
    coverage.set(row.area, { area: row.area, consultas: reads.map(read => read.id), estado: state, motivo: reads.some(read => read.partial) ? 'La lectura es parcial.' : reason || (state === 'PENDIENTE' ? 'Falta consultar esta área.' : null) });
  }
  const areas = INVESTIGATION_AREAS.map(area => coverage.get(area) || { area, estado: 'PENDIENTE', consultas: [], motivo: 'Falta revisar su pertinencia y consultar si corresponde.' });
  const findings = list(args.hallazgos).map(row => ({ texto: string(row.texto), consultas: selected(row.consultas).map(read => read.id) }));
  if (findings.some(row => !row.consultas.length)) throw knowledgeError('Cada hallazgo necesita al menos una consulta real. Las hipótesis van en las incertidumbres.');
  const alternatives = list(args.alternativas, 4).map((row, index) => ({ id: String(index + 1), propuesta: string(row.propuesta), beneficio: string(row.beneficio), costo: string(row.costo), incertidumbre: string(row.incertidumbre), consultas: selected(row.consultas).map(read => read.id) }));
  if (alternatives.some(row => !row.consultas.length)) throw knowledgeError('Cada alternativa necesita evidencia consultada; declara sus supuestos por separado.');
  const recommended = args.recomendada == null ? null : String(args.recomendada);
  if (recommended && !alternatives.some(row => row.id === recommended)) throw knowledgeError('La alternativa recomendada debe existir en esta revisión.');
  const checks = list(args.comprobaciones).map(row => {
    if (!['PENDIENTE', 'CUMPLIDO', 'NO_CUMPLIDO', 'DESCONOCIDO'].includes(row.resultado)) throw knowledgeError('El resultado de una comprobación no es válido.');
    const reads = selected(row.consultas || []);
    const result = ['CUMPLIDO', 'NO_CUMPLIDO'].includes(row.resultado) && (!reads.length || reads.some(read => read.partial)) ? 'DESCONOCIDO' : row.resultado;
    const id = string(row.id, 80);
    const original = prior?.comprobaciones.find(check => check.id === id);
    if (prior && !original) throw knowledgeError('Conserva las condiciones del asunto que estamos siguiendo. Un objetivo distinto requiere una investigación nueva.');
    return { id, criterio: original?.criterio || string(row.criterio), resultado: result, consultas: reads.map(read => read.id) };
  });
  if (!checks.length || new Set(checks.map(row => row.id)).size !== checks.length) throw knowledgeError('Define comprobaciones distintas para poder seguir el resultado.');
  if (prior && (prior.comprobaciones.length !== checks.length || prior.comprobaciones.some(old => !checks.some(row => row.id === old.id)))) throw knowledgeError('Conserva las condiciones del asunto que estamos siguiendo. Un objetivo distinto requiere una investigación nueva.');
  const complete = areas.every(row => row.estado !== 'PENDIENTE');
  const resolved = Boolean(prior) && complete && checks.every(row => row.resultado === 'CUMPLIDO');
  const usedIds = new Set([...areas.flatMap(row => row.consultas), ...findings.flatMap(row => row.consultas), ...alternatives.flatMap(row => row.consultas), ...checks.flatMap(row => row.consultas)]);
  const used = receipts.filter(read => usedIds.has(read.id));
  let linkedAction = prior?.accion || null;
  if (args.accionPreparada != null) {
    if (!action || action.id !== args.accionPreparada || action.status !== 'DRAFT') throw knowledgeError('Solo se puede vincular una acción realmente preparada y pendiente de aprobación.');
    if (!recommended) throw knowledgeError('Indica qué alternativa corresponde al cambio preparado.');
    linkedAction = { id: action.id, type: action.type, status: 'DRAFT', alternativa: recommended, revisionInvestigacion: (prior?.revision || 0) + 1 };
  }
  return {
    id: prior?.id || randomUUID(), revision: (prior?.revision || 0) + 1,
    asunto: prior?.asunto || string(args.asunto, 200), objetivo: prior?.objetivo || string(args.objetivo),
    revisadaEn: now.toISOString(), estado: resolved ? 'RESUELTO' : checks.some(row => row.resultado === 'CUMPLIDO') ? 'MEJORA_PARCIAL' : 'ABIERTO',
    cobertura: areas, hallazgos: findings, alternativas: alternatives, recomendada: recommended,
    incertidumbres: list(args.incertidumbres || []).map(value => string(value)),
    comprobaciones: checks, proximaRevision: string(args.proximaRevision),
    consultas: used, sources: unique([...(prior?.sources || []), ...used.flatMap(read => read.sources)]), accion: linkedAction,
    ejecucionAutorizada: false, seguimientoAutomatico: false
  };
};

export const investigationReply = record => {
  const labels = { TAREAS: 'Gestión', CONTENIDO: 'Contenido y aprobaciones', ACTIVIDAD: 'Actividad', CONTEXTO: 'Contexto del cliente', CARGA: 'Carga del equipo' };
  const pending = record.cobertura.filter(row => row.estado === 'PENDIENTE');
  return [
    `**${record.asunto}**`, record.objetivo,
    ...(record.pendientesDelRecorrido?.length ? ['La investigación quedó incompleta. Conservé el asunto para retomarlo.', ...record.pendientesDelRecorrido.map(text => `- ${text}`)] : []),
    ...record.consultas.map(row => `Consultado en ${labels[row.area]}: ${new Date(row.consultadoEn).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} (Bogotá)${row.partial ? ' · lectura parcial' : ''}.`),
    ...record.hallazgos.map(row => `- ${row.texto}`),
    ...(pending.length ? ['**Falta comprobar**', ...pending.map(row => `- ${labels[row.area]}: ${row.motivo}`)] : []),
    ...record.alternativas.map(row => `**Opción ${row.id}${record.recomendada === row.id ? ' · recomendada' : ''}: ${row.propuesta}**\nBeneficio: ${row.beneficio}\nCosto o efecto: ${row.costo}\nIncertidumbre: ${row.incertidumbre}`),
    ...record.incertidumbres.map(text => `Por aclarar: ${text}`),
    `**Seguimiento: ${record.estado === 'RESUELTO' ? 'resuelto según lo consultado' : record.estado === 'MEJORA_PARCIAL' ? 'mejora parcial' : 'abierto'}**`,
    ...record.comprobaciones.map(row => `- ${row.criterio}: ${{ PENDIENTE: 'pendiente', CUMPLIDO: 'comprobado', NO_CUMPLIDO: 'aún no se cumple', DESCONOCIDO: 'sin evidencia suficiente' }[row.resultado]}`),
    `Próxima revisión propuesta: ${record.proximaRevision}. Se retoma en esta conversación; todavía no hay un aviso programado.`,
    'Este análisis no ejecuta cambios. Cualquier acción requiere revisar y aprobar su resumen.'
  ].join('\n\n');
};
