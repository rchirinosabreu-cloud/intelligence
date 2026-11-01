import { canUseBria } from '../lib/briaLivingMemory.js';
import { normalizeQuickReplies } from '../lib/briaQuickReplies.js';
export const conversationChoiceTool = {
  name: 'ofrecer_opciones',
  description: 'Presenta hasta seis respuestas breves que la persona puede pulsar para enviarlas como mensajes. Úsala cuando plantees alternativas concretas entre las que ella tiene que elegir (cuenta, responsable, prioridad, cómo continuar) o cuando los botones ayuden a resolver una ambigüedad; una recomendación puede conversarse sin menú. Escribe en tu respuesta la pregunta concreta que esas opciones contestan. No ejecuta acciones.',
  parameters: { type: 'object', properties: { opciones: { type: 'array', items: { type: 'string' }, maxItems: 6 } }, required: ['opciones'], additionalProperties: false },
  allowed: canUseBria,
  async run({ opciones }) { const quickReplies = normalizeQuickReplies(opciones); return { data: { opciones: quickReplies, message: 'Estas opciones se muestran como botones que envían su texto al chat.' }, quickReplies }; }
};
