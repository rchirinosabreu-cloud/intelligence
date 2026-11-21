// El modelo de la sesión diaria de project manager (ver `src/lib/briaPmSession.js`): un modelo fuerte de la API de
// Claude, por el SDK oficial y por la misma salida gobernada que el resto de la IA. Una llamada al día, con salida
// estructurada. Apagada sin ANTHROPIC_API_KEY; `BRIA_PM=off` la apaga aunque la clave exista.

import Anthropic from '@anthropic-ai/sdk';
import { governedFetch } from './aiEgress.js';
import { PM_SESSION_USE_CASE } from '../lib/briaPmSession.js';

export const PM_MODEL = 'claude-opus-5-5';
const PM_TIMEOUT_MS = 180_000;
const PM_MAX_TOKENS = 16_000;

export const createPmBrain = ({ env = process.env, fetchImpl = governedFetch, Client = Anthropic, timeoutMs = PM_TIMEOUT_MS } = {}) => {
  const apiKey = String(env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey || String(env.BRIA_PM || '').toLowerCase() === 'off') return null;
  const model = env.BRIA_PM_MODEL || PM_MODEL;
  return {
    model,
    async plan({ system, user, schema }) {
      let response = null;
      const client = new Client({
        apiKey, baseURL: 'https://api.anthropic.com', maxRetries: 1, timeout: timeoutMs,
        fetch: async (url, init = {}) => (response = await fetchImpl(url, { ...init, governanceContext: { useCase: PM_SESSION_USE_CASE }, reportsStreamUsage: true }))
      });
      try {
        // Este modelo siempre piensa; la profundidad se pide con el esfuerzo. Se transmite para no depender de un
        // tiempo de espera largo, y la respuesta sale ya con la forma del esquema.
        const message = await client.messages.stream({
          model, max_tokens: PM_MAX_TOKENS,
          output_config: { effort: 'high', format: { type: 'json_schema', schema } },
          system, messages: [{ role: 'user', content: user }]
        }, { signal: AbortSignal.timeout(timeoutMs) }).finalMessage();
        response?.reportStreamUsage?.({ payload: { usage: message.usage } });
        if (message.stop_reason !== 'end_turn') throw Object.assign(new Error(`La sesión no terminó: ${message.stop_reason || 'incompleta'}.`), { code: 'PM_SESSION_INCOMPLETE' });
        return { text: message.content.filter(block => block.type === 'text').map(block => block.text).join('').trim(), model: message.model || model, usage: message.usage };
      } catch (error) {
        response?.reportStreamUsage?.({ failed: true });
        throw error;
      }
    }
  };
};

let shared;
export const getPmBrain = () => (shared === undefined ? (shared = createPmBrain()) : shared);
