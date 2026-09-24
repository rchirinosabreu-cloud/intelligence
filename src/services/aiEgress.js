import { getGovernanceService } from './aiGovernanceService.js';
import { governanceError } from '../lib/aiGovernance.js';

// Server-only transport. Scope must come from an authorized, persisted resource,
// never from an arbitrary clientId supplied in a proxy request.
export const createGovernedFetch = ({ fetchImpl, governance } = {}) => async (url, options = {}) => {
  const target = new URL(url);
  const { governanceContext, ...outgoing } = options;
  let provider, model;
  const body = JSON.parse(options.body || '{}');
  if (target.origin === 'https://api.openai.com' && ['/v1/responses', '/v1/embeddings', '/v1/chat/completions'].includes(target.pathname)) {
    provider = 'openai'; model = body.model;
  } else if (target.origin === 'https://api.fireflies.ai' && target.pathname === '/graphql') {
    provider = 'fireflies'; model = 'graphql';
  } else if (target.origin === 'https://generativelanguage.googleapis.com' && /^\/v1beta\/models\/[^/]+:streamGenerateContent$/.test(target.pathname)) {
    provider = 'google'; model = target.pathname.split('/').pop().split(':')[0];
  } else {
    throw governanceError('Destino de IA no inventariado.', 403, 'AI_DESTINATION_INVALID');
  }
  if (typeof model !== 'string' || !model.trim()) throw governanceError('Modelo de IA no identificado.', 403, 'AI_SCOPE_REQUIRED');
  await (governance || getGovernanceService()).assertEgress({
    clientId: governanceContext?.clientId,
    useCase: governanceContext?.useCase,
    provider, model,
    // Conservative label, not automatic content classification or a DLP scanner.
    dataClasses: ['CONFIDENTIAL']
  });
  options.signal?.throwIfAborted();
  return (fetchImpl || globalThis.fetch)(url, { ...outgoing, redirect: 'error' });
};

export const governedFetch = createGovernedFetch();
