import { canUseBria } from '../lib/briaLivingMemory.js';
import { normalizeQuickReplies } from '../lib/briaQuickReplies.js';
export const conversationChoiceTool = {
  name: 'ofrecer_opciones',
  description: 'Presenta hasta seis respuestas breves que la persona puede pulsar para enviarlas como mensajes. Úsala siempre que plantees alternativas concretas, incluyendo elegir cuenta, responsable, prioridad o cómo continuar. No ejecuta acciones.',
  parameters: { type: 'object', properties: { opciones: { type: 'array', items: { type: 'string' }, maxItems: 6 } }, required: ['opciones'], additionalProperties: false },
  allowed: canUseBria,
  async run({ opciones }) { const quickReplies = normalizeQuickReplies(opciones); return { data: { opciones: quickReplies, message: 'Estas opciones se muestran como botones que envían su texto al chat.' }, quickReplies }; }
};
