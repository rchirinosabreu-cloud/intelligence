// Base común de las acciones de Bria en la plataforma (9 de octubre de 2026). Rodny: «la idea es que Bria
// contribuya a desarrollar buenas prácticas más que simplemente poner cosas … crea la parrilla tal, ¿quién será
// el responsable? ¿cuál será el objetivo estratégico?».
//
// Una acción pendiente se arma en el servidor con lo que la persona dijo, lo que se pudo deducir y lo que la
// plataforma exige. Si falta algo, Bria lo pregunta de a una cosa, con opciones cuando las hay. Cuando no
// falta nada, muestra el resumen y solo la ejecuta con una confirmación escrita sobre ESA respuesta: una
// acción de una respuesta anterior nunca se ejecuta con un «confirmar» suelto.

const fold = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const ACTION_CONFIRM = 'Confirmar';
export const ACTION_CANCEL = 'Cancelar';

export const isActionConfirmation = (question) => /^(?:(?:si|ok|vale|dale)[,. ]+)?(?:confirmar|confirmo|confirma|hazlo|adelante)[.! ]*$/.test(fold(question));
export const isActionCancellation = (question) => /^(?:(?:no)[,. ]+)?(?:cancelar|cancela|cancelalo|descartalo|olvidalo)[.! ]*$/.test(fold(question));

export const actionStage = (action) => {
  if (!action) return null;
  if (['DONE', 'CANCELLED'].includes(action.status)) return action.status;
  return action.missing?.length ? 'MISSING' : 'READY';
};

const lines = (items = []) => items.filter(Boolean).map((item) => `- ${item}`).join('\n');

/** Lo que Bria responde con una acción pendiente. Lo escribe la plataforma: es exactamente lo que se ejecutará. */
export const actionReply = (action) => {
  const stage = actionStage(action);
  if (stage === 'CANCELLED') return { answer: 'Listo, no hice ningún cambio.', quickReplies: [] };
  if (stage === 'DONE') return { answer: action.result || 'Listo.', quickReplies: [] };
  const head = `**${action.title}**${action.summary?.length ? `\n\n${lines(action.summary)}` : ''}`;
  const warnings = action.warnings?.length ? `\n\n${lines(action.warnings)}` : '';
  if (stage === 'MISSING') {
    const next = action.missing[0];
    return { answer: `${head}${warnings}\n\n${next.question}`, quickReplies: (next.options || []).slice(0, 6) };
  }
  return { answer: `${head}${warnings}\n\n¿Lo hago así? También puedes pedirme cualquier ajuste.`, quickReplies: [ACTION_CONFIRM, ACTION_CANCEL] };
};

/** La acción de la respuesta inmediatamente anterior, si la hay. Solo esa se puede confirmar. */
export const pendingActionOf = (turns = []) => {
  const last = [...turns].reverse().find((turn) => turn.role === 'assistant');
  return last?.pendingAction || null;
};
