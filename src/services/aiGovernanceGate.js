import { AI_MODELS } from '../config/aiConfig.js';
import { governanceError } from '../lib/aiGovernance.js';

// Scoped review adapter. No historical embeddings are requested for governed reviews.
export async function prepareGovernedReview({ ai, clientId, governance }) {
  if (!governance) return { ai, useHistoricalMemory: true };
  const initiallyEnabled = (await governance.policy(clientId)).enabled;
  const context = model => ({ clientId, provider: 'openai', model, useCase: 'parrillas.review', dataClasses: ['CONFIDENTIAL'] });
  if (initiallyEnabled) await governance.assertUse(context(AI_MODELS.fast));
  return {
    useHistoricalMemory: !initiallyEnabled,
    ai: {
      ...ai,
      async generate(request) {
        if (!initiallyEnabled && (await governance.policy(clientId)).enabled) {
          throw governanceError('El control de IA cambió durante la revisión. Inicia una nueva revisión.', 409, 'AI_GOVERNANCE_CHANGED');
        }
        const decision = await governance.assertUse(context(request.model || AI_MODELS.fast));
        if (!initiallyEnabled && decision.enforced) {
          throw governanceError('El control de IA cambió durante la revisión. Inicia una nueva revisión.', 409, 'AI_GOVERNANCE_CHANGED');
        }
        return ai.generate({ ...request, governanceContext: { clientId, useCase: 'parrillas.review' } });
      }
    }
  };
}
