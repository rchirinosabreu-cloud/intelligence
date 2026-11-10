import { governanceError } from '../lib/aiGovernance.js';

export const BRIA_PILOT_MODEL = 'gpt-6-luna';
export const BRIA_PILOT_EFFORT = 'low';
export const briaPilotEnabled = (env = process.env) => env.BRIA_SPEND_PILOT === 'true';

export function assertBriaPilotOwner(userId, env = process.env) {
  if (briaPilotEnabled(env) && (!userId || userId !== env.BRIA_SPEND_PILOT_USER_ID?.trim())) {
    throw governanceError('Este piloto de Bria está limitado a la cuenta autorizada.', 403, 'BRIA_PILOT_SCOPE');
  }
}

export function assertBriaPilotRequest({ env, context, endpoint, body }) {
  const chat = context?.briaPilotChat;
  assertBriaPilotOwner(chat?.userId, env);
  if (!['web', 'whatsapp'].includes(chat?.channel) || endpoint !== '/v1/responses' ||
      body.model !== BRIA_PILOT_MODEL || body.reasoning?.effort !== BRIA_PILOT_EFFORT || body.store !== false ||
      (body.service_tier && body.service_tier !== 'default') || body.background || body.previous_response_id ||
      body.conversation || body.tools?.some(tool => tool.type !== 'function')) {
    throw governanceError('Este flujo de IA está fuera del piloto de Bria.', 403, 'BRIA_PILOT_SCOPE');
  }
}
