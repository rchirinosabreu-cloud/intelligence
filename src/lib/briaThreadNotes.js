// Las entregas fijas de Bria viven cada una en su propio chat (Rodny, 20 de noviembre de 2026): la lectura de la
// mañana, el cierre del día, el foco de la semana y la revisión del mes. La primera abre el chat y las siguientes
// entran como un mensaje más. El chat se reconoce por el tipo de nota, no por el título.

export const DAILY_CLOSE_THREAD_TITLE = 'Cierre del día';
export const WEEKLY_FOCUS_THREAD_TITLE = 'Foco de la semana';
export const MONTHLY_REVIEW_THREAD_TITLE = 'Revisión del mes';

/** Deja la nota en el chat fijo de su tipo; un almacén sin chats fijos conserva el chat suelto con su título fechado. */
export const leaveThreadNote = (store, actor, { threadTitle, title, text, metadata }) => typeof store.postThreadNote === 'function'
  ? store.postThreadNote(actor, { title: threadTitle, text, metadata })
  : store.postAssistantNote(actor, { title, text, metadata });
