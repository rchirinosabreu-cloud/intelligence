// Base común de las acciones de Bria en la plataforma (9 de octubre de 2026). Rodny: «la idea es que Bria
// contribuya a desarrollar buenas prácticas más que simplemente poner cosas … crea la parrilla tal, ¿quién será
// el responsable? ¿cuál será el objetivo estratégico?».
//
// Una acción pendiente se arma en el servidor con lo que la persona dijo, lo que se pudo deducir y lo que la
// plataforma exige. Si falta algo, Bria lo pregunta de a una cosa, con opciones cuando las hay. Cuando no
// falta nada, muestra el resumen y solo la ejecuta con una confirmación escrita sobre ESA respuesta: una
// acción de una respuesta anterior nunca se ejecuta con un «confirmar» suelto.
//
// Una sola base (Rodny, 10 de octubre de 2026: «lo de unificar por dentro, hazlo»): crear pendiente, despachar a
// producción y eliminar pendientes, que nacieron con su propio flujo, viajan ahora como acciones de esta misma
// base (`TASK_CREATE`, `DISPATCH`, `TASK_DELETE`). Conservan su borrador (`draft`), sus textos y sus frases de
// confirmación («Crear pendiente», «Despachar a producción», «Eliminar pendiente»), y además aceptan «Confirmar».

import { taskDraftReply, taskDraftStage, isTaskConfirmation, isTaskCancellation } from './briaTaskDraft.js';
import { dispatchReply, dispatchStage, isDispatchConfirmation, isDispatchCancellation, dispatchResultText, DISPATCH_CONFIRM } from './briaDispatchDraft.js';
import { deleteReply, deleteStage, isDeleteConfirmation, isDeleteCancellation, deleteResultText, DELETE_CONFIRM } from './briaDeleteDraft.js';

const fold = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const ACTION_CONFIRM = 'Confirmar';
export const ACTION_CANCEL = 'Cancelar';

export const isActionConfirmation = (question) => /^(?:(?:si|ok|vale|dale)[,. ]+)?(?:confirmar|confirmo|confirma|hazlo|adelante)[.! ]*$/.test(fold(question));
export const isActionCancellation = (question) => /^(?:(?:no)[,. ]+)?(?:cancelar|cancela|cancelalo|descartalo|olvidalo)[.! ]*$/.test(fold(question));

/* ------------------------------------------------------------ Los tres flujos que nacieron aparte */

// Para cada uno: la clave con la que se guardaba antes (compatibilidad con turnos ya guardados), cómo leer su
// etapa, su respuesta, sus frases, qué estados cuentan como terminado, la frase canónica que entiende su
// servicio y los módulos que exige.
export const LEGACY_ACTIONS = {
  TASK_CREATE: { field: 'taskDraft', stage: taskDraftStage, reply: taskDraftReply, confirms: isTaskConfirmation, cancels: isTaskCancellation, done: ['CREATED'], confirmPhrase: 'Crear pendiente', permission: ['gestion'] },
  DISPATCH: { field: 'dispatchDraft', stage: dispatchStage, reply: dispatchReply, confirms: isDispatchConfirmation, cancels: isDispatchCancellation, done: ['DONE'], confirmPhrase: DISPATCH_CONFIRM, permission: ['gestion', 'parrillas'] },
  TASK_DELETE: { field: 'deleteDraft', stage: deleteStage, reply: deleteReply, confirms: isDeleteConfirmation, cancels: isDeleteCancellation, done: ['DONE'], confirmPhrase: DELETE_CONFIRM, permission: ['gestion'] }
};
export const isLegacyAction = (action) => Boolean(action && LEGACY_ACTIONS[action.type]);

const legacyStatus = (type, draft) => {
  if (!draft) return 'DRAFT';
  if (draft.status === 'CANCELLED') return 'CANCELLED';
  if (LEGACY_ACTIONS[type].done.includes(draft.status)) return 'DONE';
  return 'DRAFT';
};

/** El borrador de un flujo viejo, envuelto como acción de la base común. */
export const wrapLegacyAction = (type, draft, extra = {}) => {
  const legacy = LEGACY_ACTIONS[type];
  if (!legacy || !draft) return null;
  const status = legacyStatus(type, draft);
  const stage = legacy.stage(draft);
  return {
    id: draft.id, ownerId: draft.ownerId, type, status, draft,
    title: extra.title || draft.title || legacy.confirmPhrase,
    summary: [], warnings: [],
    missing: status === 'DRAFT' && stage !== 'READY' ? [{ field: stage }] : [],
    ...(extra.result ? { result: extra.result } : {})
  };
};

export const actionStage = (action) => {
  if (!action) return null;
  if (['DONE', 'CANCELLED'].includes(action.status)) return action.status;
  return action.missing?.length ? 'MISSING' : 'READY';
};

const lines = (items = []) => items.filter(Boolean).map((item) => `- ${item}`).join('\n');

/** Lo que Bria responde con una acción pendiente. Lo escribe la plataforma: es exactamente lo que se ejecutará. */
export const actionReply = (action) => {
  const stage = actionStage(action);
  if (isLegacyAction(action)) {
    if (stage === 'DONE' && action.result) return { answer: action.result, quickReplies: [] };
    return LEGACY_ACTIONS[action.type].reply(action.draft);
  }
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

/** «Confirmar» vale para todas; cada flujo viejo conserva además sus frases («Crear pendiente», «Despachar a producción»…). */
export const confirmsAction = (action, question) => isActionConfirmation(question) || Boolean(action && LEGACY_ACTIONS[action.type]?.confirms(question));
export const cancelsAction = (action, question) => isActionCancellation(question) || Boolean(action && LEGACY_ACTIONS[action.type]?.cancels(question));

/** Lo que se dice cuando la persona vuelve a confirmar algo que ya se hizo. */
export const alreadyDoneReply = (action) => {
  if (action?.type === 'TASK_CREATE' && action.draft?.taskId) return `Este pendiente ya está creado. [Abrir en Gestión](/gestion?taskId=${encodeURIComponent(action.draft.taskId)})`;
  if (action?.type === 'DISPATCH') return `Ese despacho ya se hizo.\n\n${dispatchResultText(action.draft?.results || [])}`;
  if (action?.type === 'TASK_DELETE') return `Esa eliminación ya se hizo.\n\n${deleteResultText(action.draft?.results || [])}`;
  return `Eso ya se hizo.${action?.result ? `\n\n${action.result}` : ''}`;
};

/**
 * La acción de la respuesta inmediatamente anterior, si la hay. Solo esa se puede confirmar. Un turno guardado
 * antes de la base común (con `taskDraft`, `dispatchDraft` o `deleteDraft`) se lee igual.
 */
export const pendingActionOf = (turns = []) => {
  const last = [...turns].reverse().find((turn) => turn.role === 'assistant');
  if (!last) return null;
  if (last.pendingAction) return last.pendingAction;
  for (const [type, legacy] of Object.entries(LEGACY_ACTIONS)) if (last[legacy.field]) return wrapLegacyAction(type, last[legacy.field]);
  return null;
};
