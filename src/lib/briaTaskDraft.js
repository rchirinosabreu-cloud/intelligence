import { humanDate } from './briaAssistant.js';
import { normalizeQuickReplies } from './briaQuickReplies.js';
export { normalizeQuickReplies } from './briaQuickReplies.js';
const clean = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const advanceDay = (today, amount) => { const day = new Date(`${today}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + amount); return day.toISOString().slice(0, 10); };
export const TASK_PRIORITIES = ['NORMAL','ALTA','URGENTE'];
export const MAX_TASKS_PER_DRAFT = 15;
const PRIORITY_LABEL = { NORMAL: 'Normal', ALTA: 'Alta', URGENTE: 'Urgente' };
export const resolveTaskDate = (value, today) => {
  const text = clean(value); if (!validDay(today)) return null;
  if (validDay(text)) return text;
  if (['hoy','manana','pasado manana'].includes(text)) return advanceDay(today, ['hoy','manana','pasado manana'].indexOf(text));
  const weekday = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'].indexOf(text.replace(/^(?:el |este |proximo )+/, ''));
  if (weekday >= 0) return advanceDay(today, (weekday - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7 || 7);
  const written = text.match(/^(\d{1,2}) (?:de )?([a-z]+)(?: (?:de )?(\d{4}))?$/);
  if (!written || !months.includes(written[2])) return null;
  const day = `${written[3] || today.slice(0, 4)}-${String(months.indexOf(written[2]) + 1).padStart(2, '0')}-${written[1].padStart(2, '0')}`;
  return validDay(day) ? day : null;
};
export const isTaskConfirmation = question => /^(?:(?:si|ok|vale)[,. ]+)?(?:crear (?:el |los )?pendientes?|crea (?:el |los )?(?:pendientes?|tareas?)|confirmo|procede|adelante|confirmar creacion)[.! ]*$/.test(clean(question));
export const isTaskCancellation = question => /^(?:cancelar (?:el |los )?pendientes?|cancela (?:el |los )?(?:pendientes?|tareas?)|descarta (?:el |este |los )?pendientes?)[.! ]*$/.test(clean(question));
// Solo el atajo exacto de la pantalla inicia un borrador sin interpretación. El texto libre lo entiende Bria.
export const isTaskDraftStarter = question => clean(question) === 'crear un pendiente';
/** Comprueba procedencia, no semántica ni aprobación: la interpretación solo permite preparar un borrador. */
export const taskDraftRequestProblem = ({ request, question, ongoing = false, newDraft = false } = {}) => {
  if (!request || !['PREPARE', 'ADJUST'].includes(request.intent)) return 'Hace falta identificar el pedido de preparar o ajustar este borrador.';
  const normalize = value => typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, ' ').trim() : '';
  const quote = normalize(request.evidence), current = normalize(question);
  if (!quote || !current || !current.includes(quote)) return 'El pedido debe estar citado en tu mensaje actual, no en un documento ni en otra fuente.';
  if (request.intent === 'ADJUST' && (!ongoing || newDraft)) return 'Primero prepara un borrador antes de ajustarlo.';
  return null;
};
export const materialDeclined = (question, stage) => /\b(?:sin|no (?:hay|tengo|tenemos|anadire|voy a anadir|quiero anadir|necesito))\b[^.!?]{0,50}\b(?:insumos|referencias|material)\b/.test(clean(question)) || (stage === 'MATERIAL' && /^(?:no|no gracias|procede|si,? procede|continua|continuar sin insumos|no,? procede)[.! ]*$/.test(clean(question)));

/**
 * Los pendientes de un borrador (Rodny, 20 de octubre de 2026: «créame estos cinco»). Un borrador sin `items` es un
 * solo pendiente, como siempre; con `items`, cada ítem toma lo suyo y hereda del borrador lo que no trae (cliente,
 * responsable, fecha, prioridad, material). La prioridad es Normal salvo que alguien diga otra.
 */
export const taskDraftItems = draft => {
  if (!draft) return [];
  const base = {
    id: draft.id, title: draft.title || null, context: draft.context || null, client: draft.client || null, assignee: draft.assignee || null, dueDate: draft.dueDate || null,
    priority: TASK_PRIORITIES.includes(draft.priority) ? draft.priority : 'NORMAL', references: draft.references || [], inputs: draft.inputs || [], files: draft.files || [],
    isSpecial: draft.isSpecial === true, collaborators: draft.collaborators || [], collaboratorMissing: draft.collaboratorMissing || [], unresolved: draft.unresolved || []
  };
  if (!Array.isArray(draft.items) || !draft.items.length) return [base];
  return draft.items.map(item => {
    const own = Object.fromEntries(Object.entries(item || {}).filter(([key, value]) => (['client', 'assignee'].includes(key) && value === null) || (value != null && (['collaborators', 'collaboratorMissing', 'unresolved'].includes(key) || !(Array.isArray(value) && !value.length)))));
    const result = { ...base, ...own, priority: TASK_PRIORITIES.includes(item?.priority) ? item.priority : base.priority };
    result.collaborators = result.collaborators.filter(member => member.id !== result.assignee?.id);
    return result;
  });
};
// El título ya dice qué hay que hacer: el contexto es un detalle más, nunca una parada («historias de la semana para
// Kamila mañana» es un pendiente completo). Sin contexto no se escribe comentario inicial.
// Un título que solo repite el pedido («Crear pendiente», «Nueva tarea urgente») no dice qué hay que hacer: es como no
// tener título, y Bria lo pregunta (Rodny, 22 de octubre de 2026: el pendiente salió titulado «Crear pendiente»).
const PLACEHOLDER_WORDS = new Set(['crear', 'crea', 'creame', 'nuevo', 'nueva', 'un', 'una', 'el', 'la', 'pendiente', 'pendientes', 'tarea', 'tareas', 'urgente', 'para', 'hoy', 'manana', 'registrar', 'asignar', 'agregar', 'anadir', 'de', 'otro', 'otra']);
export const isPlaceholderTaskTitle = title => {
  const words = clean(title).replace(/[^a-z0-9ñ ]+/g, ' ').split(/\s+/).filter(Boolean);
  return words.length > 0 && words.some(word => ['pendiente', 'pendientes', 'tarea', 'tareas'].includes(word)) && words.every(word => PLACEHOLDER_WORDS.has(word));
};
const itemStage = item => !item.client ? 'CLIENT' : !item.assignee ? 'ASSIGNEE' : !item.dueDate ? 'DATE' : (!item.title || isPlaceholderTaskTitle(item.title)) ? 'CONTEXT' : item.collaboratorMissing?.length ? 'COLLABORATORS' : item.unresolved?.length ? 'UNRESOLVED' : 'READY';
/** El primer pendiente al que le falta algo, con su posición (1 en adelante) para nombrarlo en un lote. */
export const taskDraftMissing = draft => {
  const items = taskDraftItems(draft);
  for (let index = 0; index < items.length; index += 1) { const stage = itemStage(items[index]); if (stage !== 'READY') return { index: index + 1, item: items[index], stage, batch: items.length > 1 }; }
  return null;
};
export const taskDraftStage = draft => {
  if (!draft) return null;
  if (['CREATED','CANCELLED'].includes(draft.status)) return draft.status;
  return taskDraftMissing(draft)?.stage || 'READY';
};
const materialLines = item => [...(item.references || []).map(row => `Referencia: ${row.url}`), ...(item.inputs || []).map(row => `Insumo: ${row.url}`), ...(item.files || []).map(row => `Archivo: ${row.name}`)];
// Los insumos ya no son una parada (Rodny, 20 de octubre de 2026): se nombran en el resumen y se pueden añadir después.
const NO_MATERIAL = 'Sin referencias ni insumos todavía: puedes adjuntarlos ahora o después en la tarea.';
const capabilityLines = item => `- Proyecto especial: ${item.isSpecial ? 'Sí' : 'No'}\n- Colaboradores: ${item.collaborators?.length ? item.collaborators.map(member => member.name).join(', ') : 'Ninguno'}`;
export const taskDraftReply = draft => {
  const stage = taskDraftStage(draft);
  if (stage === 'COLLABORATORS' || stage === 'UNRESOLVED') {
    const { item, index, batch } = taskDraftMissing(draft);
    const prefix = batch ? `Del pendiente ${index} («${item.title}»): ` : '';
    if (stage === 'UNRESOLVED') return { answer: `${prefix}El borrador aún no cubre todo el pedido:\n${item.unresolved.map(text => `- ${text}`).join('\n')}\n\nConservo los demás datos. Falta resolver esto antes de ofrecer la creación.`, quickReplies: [] };
    const missing = item.collaboratorMissing[0];
    return { answer: `${prefix}${missing.candidates?.length ? `Encontré varias personas para «${missing.reference}». ¿Cuál será colaborador?` : `No encontré un colaborador activo para «${missing.reference}». ¿A quién te refieres?`}`, quickReplies: normalizeQuickReplies(missing.candidates?.map(member => member.name)) };
  }
  if (['CLIENT','ASSIGNEE','DATE','CONTEXT'].includes(stage)) {
    const missing = taskDraftMissing(draft);
    const about = missing.batch ? `Del pendiente ${missing.index}${missing.item.title ? ` («${missing.item.title}»)` : ''}: ` : '';
    if (stage === 'CLIENT') {
      const own = missing.batch ? draft.items[missing.index - 1] : null;
      // Una lista propia vacía significa que ese cliente no se encontró; no ofrece las opciones de otro.
      const candidates = own && (Object.hasOwn(own, 'clientCandidates') || Object.hasOwn(own, 'client')) ? own.clientCandidates : draft.clientCandidates;
      return { answer: `${about}${candidates?.length ? 'encontré estas cuentas. ¿Para cuál es el pendiente?' : '¿para qué cliente es el pendiente?'}`.replace(/^(\p{L})/u, m => m.toUpperCase()), quickReplies: normalizeQuickReplies(candidates?.map(row => row.name)) };
    }
    if (stage === 'ASSIGNEE') return { answer: `${about}${draft.assigneeCandidates?.length ? 'encontré estas personas. ¿A quién se lo asignamos?' : '¿quién será responsable del pendiente?'}`.replace(/^(\p{L})/u, m => m.toUpperCase()), quickReplies: normalizeQuickReplies(draft.assigneeCandidates?.map(row => row.name)) };
    if (stage === 'DATE') return { answer: `${about}¿para qué fecha lo necesitas? Dime un día concreto.`.replace(/^(\p{L})/u, m => m.toUpperCase()), quickReplies: ['Hoy', 'Mañana', 'Pasado mañana'] };
    return { answer: `${about}¿qué hay que hacer? Dímelo en una frase y la pongo como título.`.replace(/^(\p{L})/u, m => m.toUpperCase()), quickReplies: [] };
  }
  if (stage === 'READY') {
    const items = taskDraftItems(draft);
    if (items.length === 1) {
      const [item] = items, materials = materialLines(item);
      return { answer: `Así quedaría el pendiente:\n\n**${item.title}**\n- Cliente: ${item.client.name}${draft.clientInferred ? ' (el mismo del pendiente anterior)' : ''}\n- Responsable: ${item.assignee.name}\n- Fecha: ${humanDate(item.dueDate)}\n- Prioridad: ${PRIORITY_LABEL[item.priority]}\n${capabilityLines(item)}\n\n${item.context ? `**Contexto que guardaré como comentario**\n\n${item.context}\n\n` : ''}${materials.length ? materials.map(row => `- ${row}`).join('\n') : NO_MATERIAL}\n\n¿Lo creo así? También puedes indicarme cualquier ajuste.`, quickReplies: ['Crear pendiente', 'Cancelar pendiente'] };
    }
    const sameClient = items.every(item => item.client.id === items[0].client.id);
    const rows = items.map((item, index) => {
      const materials = materialLines(item);
      return `${index + 1}. **${item.title}** — ${item.assignee.name} · ${humanDate(item.dueDate)} · ${PRIORITY_LABEL[item.priority]}${sameClient ? '' : ` · ${item.client.name}`}\n${capabilityLines(item)}${item.context ? `\n   ${item.context}` : ''}${materials.length ? `\n   ${materials.join(' · ')}` : ''}`;
    });
    const anyWithout = items.some(item => !materialLines(item).length);
    return { answer: `Así quedarían los ${items.length} pendientes${sameClient ? ` de ${items[0].client.name}${draft.clientInferred ? ' (el mismo del pendiente anterior)' : ''}` : ''}:\n\n${rows.join('\n\n')}${anyWithout ? `\n\n${NO_MATERIAL}` : ''}\n\n¿Los creo así? También puedes indicarme cualquier ajuste («el 2 para el viernes», «el 3 a Melissa»).`, quickReplies: ['Crear pendientes', 'Cancelar pendiente'] };
  }
  return { answer: stage === 'CANCELLED' ? 'Descarté el borrador del pendiente.' : 'Ese pendiente ya está creado.', quickReplies: [] };
};
