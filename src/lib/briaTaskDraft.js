import { humanDate } from './briaAssistant.js';
import { normalizeQuickReplies } from './briaQuickReplies.js';
export { normalizeQuickReplies } from './briaQuickReplies.js';
const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const advanceDay = (today, amount) => { const day = new Date(`${today}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + amount); return day.toISOString().slice(0, 10); };
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
export const isTaskConfirmation = question => /^(?:(?:si|ok|vale)[,. ]+)?(?:crear (?:el )?pendiente|crea (?:el )?(?:pendiente|tarea)|confirmo|procede|adelante|confirmar creacion)[.! ]*$/.test(clean(question));
export const isTaskCancellation = question => /^(?:cancelar (?:el )?pendiente|cancela (?:el )?(?:pendiente|tarea)|descarta (?:el |este )?pendiente)[.! ]*$/.test(clean(question));
export const taskCreationIntent = question => /\b(?:crea(?:r|me)?|asigna(?:r|le)?|registr(?:a|ar)|pon(?:le|me)?|nuevo|nueva)\b[^.!?]{0,140}\b(?:pendiente|tarea)\b/.test(clean(question));
export const materialDeclined = (question, stage) => /\b(?:sin|no (?:hay|tengo|tenemos|anadire|voy a anadir|quiero anadir|necesito))\b[^.!?]{0,50}\b(?:insumos|referencias|material)\b/.test(clean(question)) || (stage === 'MATERIAL' && /^(?:no|no gracias|procede|si,? procede|continua|continuar sin insumos|no,? procede)[.! ]*$/.test(clean(question)));
export const taskDraftStage = draft => {
  if (!draft) return null;
  if (['CREATED','CANCELLED'].includes(draft.status)) return draft.status;
  if (!draft.client) return 'CLIENT';
  if (!draft.assignee) return 'ASSIGNEE';
  if (!draft.dueDate) return 'DATE';
  if (!draft.context || !draft.title) return 'CONTEXT';
  if (!draft.withoutMaterials && !(draft.references?.length || draft.inputs?.length || draft.files?.length)) return 'MATERIAL';
  if (!['NORMAL','ALTA','URGENTE'].includes(draft.priority)) return 'PRIORITY';
  return 'READY';
};
export const taskDraftReply = draft => {
  const stage = taskDraftStage(draft), warning = draft.withoutMaterials ? `Un buen pendiente incluye referencias o insumos. ${draft.assignee?.name || 'La persona responsable'} podría tener dificultad para empezar sin insumos disponibles.` : '';
  if (stage === 'CLIENT') return { answer: draft.clientCandidates?.length ? 'Encontré estas cuentas. ¿Para cuál es el pendiente?' : '¿Para qué cliente es el pendiente?', quickReplies: normalizeQuickReplies(draft.clientCandidates?.map(row => row.name)) };
  if (stage === 'ASSIGNEE') return { answer: draft.assigneeCandidates?.length ? 'Encontré estas personas. ¿A quién se lo asignamos?' : '¿Quién será responsable del pendiente?', quickReplies: normalizeQuickReplies(draft.assigneeCandidates?.map(row => row.name)) };
  if (stage === 'DATE') return { answer: '¿Para qué fecha necesitas el pendiente? Dime un día concreto.', quickReplies: ['Hoy', 'Mañana', 'Pasado mañana'] };
  if (stage === 'CONTEXT') return { answer: 'Cuéntame qué debe hacer y qué resultado esperas. Lo sintetizaré como contexto del pendiente.', quickReplies: [] };
  if (stage === 'MATERIAL') return { answer: `Ya tengo la cuenta, responsable, fecha y contexto. ¿Añadirás referencias o insumos? Puedes adjuntar archivos o pegar enlaces.\n\nUn buen pendiente incluye ese material; ${draft.assignee.name} podría tener dificultad para empezar sin insumos disponibles.`, quickReplies: ['Continuar sin insumos'] };
  if (stage === 'PRIORITY') return { answer: `${warning ? warning + '\n\n' : ''}¿Qué prioridad le damos al pendiente?`, quickReplies: ['Normal', 'Alta', 'Urgente'] };
  if (stage === 'READY') {
    const materials = [...(draft.references || []).map(row => `Referencia: ${row.url}`), ...(draft.inputs || []).map(row => `Insumo: ${row.url}`), ...(draft.files || []).map(row => `Archivo: ${row.name}`)];
    return { answer: `Así quedaría el pendiente:\n\n**${draft.title}**\n- Cliente: ${draft.client.name}\n- Responsable: ${draft.assignee.name}\n- Fecha: ${humanDate(draft.dueDate)}\n- Prioridad: ${{ NORMAL: 'Normal', ALTA: 'Alta', URGENTE: 'Urgente' }[draft.priority]}\n\n**Contexto que guardaré como comentario**\n\n${draft.context}\n\n${materials.length ? materials.map(row => `- ${row}`).join('\n') : warning}\n\n¿Lo creo así? También puedes indicarme cualquier ajuste.`, quickReplies: ['Crear pendiente', 'Cancelar pendiente'] };
  }
  return { answer: stage === 'CANCELLED' ? 'Descarté el borrador del pendiente.' : 'Ese pendiente ya está creado.', quickReplies: [] };
};
