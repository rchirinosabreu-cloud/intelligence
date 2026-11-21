// El modelo de la vía rápida de la voz (ver `src/lib/briaQuick.js`): la API de Claude, por el SDK oficial y por la
// misma salida gobernada que el resto de la IA (inventario de destinos, registro de uso sin contenido). Apagada
// mientras no exista ANTHROPIC_API_KEY en el servicio; `BRIA_QUICK=off` la apaga aunque la clave exista.

import Anthropic from '@anthropic-ai/sdk';
import { governedFetch } from './aiEgress.js';
import { ASSISTANT_USE_CASE } from '../lib/briaAssistant.js';
import { QUICK_HANDOFF, QUICK_TOOL } from '../lib/briaQuick.js';

export const QUICK_MODEL = 'claude-haiku-5-5';
const QUICK_TIMEOUT_MS = 8000;
const QUICK_MAX_TOKENS = 600;

export const createQuickBrain = ({ env = process.env, fetchImpl = governedFetch, Client = Anthropic, timeoutMs = QUICK_TIMEOUT_MS } = {}) => {
  const apiKey = String(env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey || String(env.BRIA_QUICK || '').toLowerCase() === 'off') return null;
  const model = env.BRIA_QUICK_MODEL || QUICK_MODEL;
  return {
    model,
    /** Devuelve el texto, o `handoff` con el motivo cuando el turno debe seguir por el camino completo. */
    async answer({ system, messages, tools = [], onTextDelta }) {
      let response = null;
      // Un cliente por turno: así el renglón de uso de esta respuesta se cierra con sus propios tokens.
      const client = new Client({
        apiKey, baseURL: 'https://api.anthropic.com', maxRetries: 0, timeout: timeoutMs,
        fetch: async (url, init = {}) => (response = await fetchImpl(url, { ...init, governanceContext: { useCase: ASSISTANT_USE_CASE }, reportsStreamUsage: true }))
      });
      try {
        const stream = client.messages.stream({
          model, max_tokens: QUICK_MAX_TOKENS,
          // Sin pensar y con el esfuerzo mínimo: aquí lo que cuenta es el primer sonido.
          thinking: { type: 'disabled' }, output_config: { effort: 'low' },
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          // Las lecturas de la persona y, al final, la señal para pasar el turno.
          tools: [...tools.map(tool => ({ name: tool.name, description: tool.description || '', input_schema: tool.parameters || { type: 'object', properties: {} } })), QUICK_TOOL], messages
        }, { signal: AbortSignal.timeout(timeoutMs) });
        if (onTextDelta) stream.on('text', delta => onTextDelta(delta));
        const message = await stream.finalMessage();
        response?.reportStreamUsage?.({ payload: { usage: message.usage } });
        const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('').trim();
        const uses = message.content.filter(block => block.type === 'tool_use');
        const asked = uses.some(block => block.name === QUICK_HANDOFF);
        const calls = asked ? [] : uses.map(block => ({ id: block.id, name: block.name, args: block.input || {} }));
        const reason = asked ? 'consulta' : calls.length ? null : message.stop_reason !== 'end_turn' ? String(message.stop_reason || 'incompleta') : !text ? 'vacia' : null;
        return { text, calls, content: message.content, handoff: Boolean(reason), reason, model: message.model || model, usage: message.usage };
      } catch (error) {
        response?.reportStreamUsage?.({ failed: true });
        throw error;
      }
    }
  };
};

let shared;
export const getQuickBrain = () => (shared === undefined ? (shared = createQuickBrain()) : shared);
