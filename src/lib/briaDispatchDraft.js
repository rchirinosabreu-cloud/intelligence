// Despachos a producción desde la conversación con Bria (9 de octubre de 2026). Un despacho es un lote de
// piezas de una parrilla, cada una con su responsable, su fecha de entrega y su prioridad. Bria lo prepara;
// solo una confirmación escrita por la persona lo ejecuta, pieza por pieza, por la misma vía que el botón
// «Despachar a Kanban» de la parrilla. Lógica pura, compartida por el servicio y la conversación.

import { humanDate } from './briaAssistant.js';

const fold = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const DISPATCH_CONFIRM = 'Despachar a producción';
export const DISPATCH_CANCEL = 'Cancelar despacho';
export const DISPATCH_MAX_ITEMS = 20;

/** Pedir que piezas pasen a producción. Revisar o preguntar por una cuenta no lo es. */
export const dispatchIntent = (question) => /(despach|(manda|mandar|envia|enviar|pasa|pasar)\b[^.!?]{0,60}\b(produccion|kanban)|prepara(r|me)? (los |las )?(pendientes|tareas)( de produccion)?)/.test(fold(question));

/** La confirmación es una frase corta y completa; dentro de un texto más largo no cuenta. */
export const isDispatchConfirmation = (question) => /^(?:(?:si|ok|vale|dale)[,. ]+)?(?:despachar(?: a produccion)?|despachalos|despachalas|confirmo el despacho)[.! ]*$/.test(fold(question));
export const isDispatchCancellation = (question) => /^(?:cancelar (?:el )?despacho|cancela el despacho|no despachar)[.! ]*$/.test(fold(question));

const active = (draft) => (draft?.items || []).filter((item) => !item.skip);

export const dispatchStage = (draft) => {
  if (!draft) return null;
  if (['DONE', 'CANCELLED'].includes(draft.status)) return draft.status;
  if (!active(draft).length) return 'EMPTY';
  if (active(draft).some((item) => !item.assignee)) return 'ASSIGNEE';
  return 'READY';
};

const PRIORITY = { NORMAL: 'normal', ALTA: 'alta' };
const line = (item) => `- **${item.title}**${item.format ? ` (${item.format}${item.publishDay ? `, sale el ${humanDate(item.publishDay)}` : ''})` : ''} → ${item.assignee?.name || '*sin responsable*'}, entrega el ${humanDate(item.dueDate)}, prioridad ${PRIORITY[item.priority] || 'normal'}`;

export const dispatchReply = (draft) => {
  const stage = dispatchStage(draft);
  const skipped = (draft?.items || []).filter((item) => item.skip);
  const skippedText = skipped.length ? `\n\n**No se despachan**\n${skipped.map((item) => `- ${item.title}: ${item.skip}`).join('\n')}` : '';
  if (stage === 'EMPTY') return { answer: `No queda ninguna pieza para despachar.${skippedText}`, quickReplies: [] };
  if (stage === 'ASSIGNEE') {
    const missing = active(draft).filter((item) => !item.assignee);
    const options = missing.length === 1 ? (missing[0].assigneeCandidates || []).map((row) => row.name) : [];
    const ask = missing.map((item) => `- **${item.title}**${item.assigneeCandidates?.length ? `: ¿${item.assigneeCandidates.map((row) => row.name).join(' o ')}?` : ''}`).join('\n');
    return { answer: `Me falta saber quién se encarga de:\n${ask}${skippedText}`, quickReplies: options };
  }
  if (stage === 'READY') {
    return {
      answer: `Así quedaría el despacho a producción de **${draft.client?.name || 'la cuenta'}**:\n\n${active(draft).map(line).join('\n')}${skippedText}\n\nCada pieza queda como una tarea de producción en Gestión, ligada a su pieza. ¿Las despacho así? También puedes pedirme cualquier ajuste.`,
      quickReplies: [DISPATCH_CONFIRM, DISPATCH_CANCEL]
    };
  }
  if (stage === 'CANCELLED') return { answer: 'Descarté el despacho; no se creó ninguna tarea.', quickReplies: [] };
  return { answer: dispatchResultText(draft.results || []), quickReplies: [] };
};

export const dispatchResultText = (results = []) => {
  const done = results.filter((row) => ['CREATED', 'ALREADY'].includes(row.outcome));
  const failed = results.filter((row) => !['CREATED', 'ALREADY'].includes(row.outcome));
  const parts = [];
  if (done.length) parts.push(`Despaché ${done.length === 1 ? 'una pieza' : `${done.length} piezas`} a producción:\n${done.map((row) => `- ${row.title}${row.assignee ? ` → ${row.assignee}` : ''}${row.outcome === 'ALREADY' ? ' (ya estaba despachada)' : ''}: [abrir en Gestión](/gestion?taskId=${encodeURIComponent(row.taskId)})`).join('\n')}`);
  if (failed.length) parts.push(`**No se despacharon**\n${failed.map((row) => `- ${row.title}: ${row.reason}`).join('\n')}`);
  return parts.join('\n\n') || 'No se despachó ninguna pieza.';
};
