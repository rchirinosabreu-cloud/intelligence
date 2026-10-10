// Eliminar pendientes desde la conversación con Bria (Rodny, 10 de octubre de 2026: «Bria no puede eliminar
// pendientes desde el chat, debe tener la posibilidad de hacerlo»). Bria prepara qué se va a eliminar y por
// qué; solo una confirmación escrita por la persona lo ejecuta, por la misma vía que el botón de Gestión
// (con su registro de eliminación). Lógica pura, compartida por el servicio y la conversación.

const fold = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const DELETE_CONFIRM = 'Eliminar pendiente';
export const DELETE_CANCEL = 'No eliminar';
export const DELETE_MAX_ITEMS = 10;
export const DELETE_REASON_OPTIONS = ['Se creó por error', 'Ya no aplica', 'Está repetido'];

/** Pedir que un pendiente desaparezca. Cerrarlo, devolverlo o preguntar por él no lo es. */
export const deleteIntent = (question) => /((elimina|eliminar|borra|borrar|quita|quitar|descarta|descartar|suprime|suprimir)(me|lo|la|los|las)?\b[^.!?]{0,60}\b(pendiente|tarea)s?|\b(pendiente|tarea)s?\b[^.!?]{0,40}\b(elimin|borr))/.test(fold(question));

/** La confirmación es una frase corta y completa; dentro de un texto más largo no cuenta. */
export const isDeleteConfirmation = (question) => /^(?:(?:si|ok|vale|dale)[,. ]+)?(?:eliminar(?: (?:el |los |la |las )?(?:pendientes?|tareas?))?|borrar(?: (?:el |los |la |las )?(?:pendientes?|tareas?))?|eliminalos?|eliminalas?|borralos?|borralas?|confirmo la eliminacion)[.! ]*$/.test(fold(question));
export const isDeleteCancellation = (question) => /^(?:no eliminar|no borrar|no (?:lo|los|la|las) (?:elimines|borres)|cancelar (?:la )?eliminacion|cancela la eliminacion|dejalo|dejalos)[.! ]*$/.test(fold(question));

const active = (draft) => (draft?.items || []).filter((item) => !item.skip);

export const deleteStage = (draft) => {
  if (!draft) return null;
  if (['DONE', 'CANCELLED'].includes(draft.status)) return draft.status;
  if (!active(draft).length) return 'EMPTY';
  if (!draft.reason) return 'REASON';
  return 'READY';
};

const STATUS = { PENDIENTE: 'pendiente', EN_CURSO: 'en proceso', DEVUELTA: 'devuelta', REALIZADA: 'realizada' };
const line = (item) => `- **${item.title}**${item.client ? ` · ${item.client}` : ''}${item.assignee ? ` · ${item.assignee}` : ''}${item.status ? ` · ${STATUS[item.status] || item.status}` : ''}`;

export const deleteReply = (draft) => {
  const stage = deleteStage(draft);
  const skipped = (draft?.items || []).filter((item) => item.skip);
  const skippedText = skipped.length ? `\n\n**No se eliminan**\n${skipped.map((item) => `- ${item.title}: ${item.skip}`).join('\n')}` : '';
  const count = active(draft).length;
  if (stage === 'EMPTY') return { answer: `No queda ningún pendiente que pueda eliminar.${skippedText}`, quickReplies: [] };
  if (stage === 'REASON') {
    return { answer: `Antes de eliminar${count === 1 ? ` **${active(draft)[0].title}**` : ` estos ${count} pendientes`}, dime por qué: queda anotado en el registro de eliminaciones.${skippedText}`, quickReplies: DELETE_REASON_OPTIONS };
  }
  if (stage === 'READY') {
    return {
      answer: `Voy a eliminar definitivamente ${count === 1 ? 'este pendiente' : `estos ${count} pendientes`}:\n\n${active(draft).map(line).join('\n')}\n\nMotivo: ${draft.reason}${skippedText}\n\nEsto no se deshace: la tarea, su conversación y sus adjuntos desaparecen del tablero; queda registrado que se eliminó, quién y por qué. ¿${count === 1 ? 'Lo elimino' : 'Los elimino'}?`,
      quickReplies: [DELETE_CONFIRM, DELETE_CANCEL]
    };
  }
  if (stage === 'CANCELLED') return { answer: 'No eliminé nada; los pendientes siguen donde estaban.', quickReplies: [] };
  return { answer: deleteResultText(draft.results || []), quickReplies: [] };
};

export const deleteResultText = (results = []) => {
  const done = results.filter((row) => row.outcome === 'DELETED');
  const already = results.filter((row) => row.outcome === 'ALREADY');
  const failed = results.filter((row) => ['FAILED', 'SKIPPED'].includes(row.outcome));
  const parts = [];
  if (done.length) parts.push(`Eliminé ${done.length === 1 ? 'el pendiente' : `${done.length} pendientes`}:\n${done.map((row) => `- ${row.title}`).join('\n')}`);
  if (already.length) parts.push(`${already.length === 1 ? 'Este ya no existía' : 'Estos ya no existían'}:\n${already.map((row) => `- ${row.title}`).join('\n')}`);
  if (failed.length) parts.push(`**No se eliminaron**\n${failed.map((row) => `- ${row.title}: ${row.reason}`).join('\n')}`);
  return parts.join('\n\n') || 'No se eliminó ningún pendiente.';
};
