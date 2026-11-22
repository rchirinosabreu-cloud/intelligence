import { canUseBria } from '../lib/briaLivingMemory.js';
import { normalizeQuickReplies } from '../lib/briaQuickReplies.js';
import { closeAction } from '../lib/briaActions.js';
export const conversationChoiceTool = {
  name: 'ofrecer_opciones',
  description: 'Presenta hasta seis respuestas breves que la persona puede pulsar para enviarlas como mensajes. Úsala cuando plantees alternativas concretas entre las que ella tiene que elegir (cuenta, responsable, prioridad, cómo continuar) o cuando los botones ayuden a resolver una ambigüedad; una recomendación puede conversarse sin menú. Escribe en tu respuesta la pregunta concreta que esas opciones contestan. No ejecuta acciones.',
  parameters: { type: 'object', properties: { opciones: { type: 'array', items: { type: 'string' }, maxItems: 6 } }, required: ['opciones'], additionalProperties: false },
  allowed: canUseBria,
  async run({ opciones }) { const quickReplies = normalizeQuickReplies(opciones); return { data: { opciones: quickReplies, message: 'Estas opciones se muestran como botones que envían su texto al chat.' }, quickReplies }; }
};

// Descartar lo que estaba en preparación (Rodny, 21 de noviembre de 2026, hablando con Bria: «sigue mencionando algo
// sobre un borrador, no tiene opción para descartarlo»). Antes solo se cerraba con la palabra exacta («cancelar»,
// «descártalo»); dicho de otra forma, y sobre todo en voz, el borrador seguía vivo y Bria lo traía en cada respuesta.
// No ejecuta nada ni borra nada de la plataforma: solo cierra el borrador de esta conversación.
export const discardDraftTool = {
  name: 'descartar_borrador',
  description: 'Descarta la acción o el borrador que estaba en preparación en esta conversación, sin ejecutar nada. Llámala cuando la persona diga, con cualquier palabra, que ya no lo quiere, que lo dejes, que lo olvides, que no era eso, o cuando pida seguir con otro tema dejando claro que ese borrador no va. No la llames si solo hace una pregunta suelta y el borrador sigue teniendo sentido. Después confirma en una frase que lo descartaste y sigue con lo que pidió.',
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  allowed: canUseBria,
  async run(_args, ctx = {}) {
    const action = ctx.pendingAction;
    if (!action || ['DONE', 'CANCELLED', 'CREATED'].includes(action.status)) return { data: { descartado: false, message: 'No hay ningún borrador en preparación en esta conversación. No lo menciones más.' } };
    return { data: { descartado: true, titulo: action.title || null, message: 'El borrador quedó descartado y no se ejecutó nada. No vuelvas a mencionarlo salvo que la persona lo pida.' }, pendingAction: closeAction(action, 'CANCELLED') };
  }
};
