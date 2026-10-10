import { getGovernanceService } from './aiGovernanceService.js';
import { governanceError } from '../lib/aiGovernance.js';
import { currentAiContext } from '../lib/aiRequestContext.js';
import { buildUsageEvent, extractUsage, getAiUsageLog } from './aiUsageLog.js';

// Server-only transport. Scope must come from an authorized, persisted resource,
// never from an arbitrary clientId supplied in a proxy request.
// Every exit (allowed, blocked or failed) leaves a row in the AI usage log (27 September
// 2026), without the content; a failing log never breaks the AI call.
export const createGovernedFetch = ({ fetchImpl, governance, usageLog, clock = () => Date.now() } = {}) => async (url, options = {}) => {
  const target = new URL(url);
  const { governanceContext, reportsStreamUsage, ...outgoing } = options;
  let provider, model;
  const multipart = options.body instanceof FormData;
  const body = multipart ? { model: options.body.get('model') } : JSON.parse(options.body || '{}');
  if (target.origin === 'https://api.openai.com' && ['/v1/responses', '/v1/embeddings', '/v1/chat/completions', '/v1/audio/transcriptions'].includes(target.pathname) && (!multipart || target.pathname === '/v1/audio/transcriptions')) {
    provider = 'openai'; model = body.model;
  } else if (target.origin === 'https://api.fireflies.ai' && target.pathname === '/graphql') {
    provider = 'fireflies'; model = 'graphql';
  } else {
    throw governanceError('Destino de IA no inventariado.', 403, 'AI_DESTINATION_INVALID');
  }
  if (typeof model !== 'string' || !model.trim()) throw governanceError('Modelo de IA no identificado.', 403, 'AI_SCOPE_REQUIRED');

  const context = currentAiContext();
  const startedAt = clock();
  const log = (fields) => {
    const event = buildUsageEvent({ provider, model, target, context, governanceContext, durationMs: clock() - startedAt, ...fields });
    Promise.resolve()
      .then(() => (usageLog || getAiUsageLog()).record(event))
      .catch((error) => console.error('[AI usage] No se pudo registrar el uso:', error?.message || error));
  };

  try {
    await (governance || getGovernanceService()).assertEgress({
      clientId: governanceContext?.clientId,
      useCase: governanceContext?.useCase,
      provider, model,
      // Conservative label, not automatic content classification or a DLP scanner.
      dataClasses: ['CONFIDENTIAL']
    });
  } catch (error) {
    log({ outcome: 'BLOCKED', errorCode: error?.code || 'AI_GOVERNANCE_BLOCKED' });
    throw error;
  }
  options.signal?.throwIfAborted();

  let response;
  try {
    response = await (fetchImpl || globalThis.fetch)(url, { ...outgoing, redirect: 'error' });
  } catch (error) {
    log({ outcome: 'ERROR', errorCode: error?.name === 'AbortError' ? 'ABORTED' : 'NETWORK' });
    throw error;
  }

  const outcome = response.ok ? 'ALLOWED' : 'ERROR';
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  // A stream is never read here. When the caller promises to report how it ended (`reportsStreamUsage`), the row
  // waits for that report and keeps the tokens of the final event; it is still exactly one row (9 October 2026).
  if (response.ok && body.stream === true && reportsStreamUsage === true) {
    let reported = false;
    response.reportStreamUsage = ({ payload = null, failed = false } = {}) => {
      if (reported) return;
      reported = true;
      log({ outcome: failed ? 'ERROR' : outcome, statusCode: response.status, ...(payload ? { usage: extractUsage(payload) } : {}), errorCode: failed ? 'STREAM_FAILED' : null });
    };
    return response;
  }
  // Tokens come from a clone of JSON answers only.
  if (response.ok && isJson && body.stream !== true) {
    response.clone().json()
      .then((json) => log({ outcome, statusCode: response.status, usage: extractUsage(json) }))
      .catch(() => log({ outcome, statusCode: response.status }));
  } else {
    log({ outcome, statusCode: response.status, errorCode: response.ok ? null : `HTTP_${response.status}` });
  }
  return response;
};

export const governedFetch = createGovernedFetch();
