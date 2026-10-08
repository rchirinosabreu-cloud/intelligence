import { createHash } from 'node:crypto';
import { knowledgeError } from '../lib/briaKnowledge.js';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Configuration belongs to chat only: editorial reviews keep their evaluated model.
export const createBriaModelRuntime = ({ ai, user, env = process.env }) => {
  const deadline = AbortSignal.timeout(180000);
  return {
    async generate(request) {
      const configured = env.BRIA_CHAT_MODEL;
      const model = configured || request.model;
      const effort = env.BRIA_CHAT_REASONING_EFFORT || (model?.startsWith('gpt-6') ? 'low' : undefined);
      if (effort && !['none','low','medium','high','xhigh','max','ultra'].includes(effort)) throw knowledgeError('Revisa la configuración del modelo de Bria.', 503);
      const signal = request.signal ? AbortSignal.any([deadline, request.signal]) : deadline;
      const params = { ...request, ...(model ? { model } : {}), ...(effort ? { reasoningEffort: effort } : {}),
        maxOutputTokens: model?.startsWith('gpt-6') ? Math.max(request.maxOutputTokens || 0, 4800) : request.maxOutputTokens,
        promptCacheKey: `bria:v1:${hash({ id: user?.userId || user?.id, role: user?.role, permissions: Object.entries(user?.modulePermissions || {}).sort() })}`,
        safetyIdentifier: hash({ id: user?.userId || user?.id }), signal };
      for (let attempt = 0; attempt < 2; attempt++) {
        signal.throwIfAborted();
        try {
          const result = await ai.generate(params);
          if (result?.raw?.status === 'incomplete') throw knowledgeError('La respuesta quedó incompleta. Divide la consulta en partes.', 503, 'BRIA_INCOMPLETE');
          return result;
        } catch (failure) {
          if (attempt || signal.aborted || failure.code === 'BRIA_INCOMPLETE' || !(failure.status === 429 || failure.status >= 500 || failure.code === 'OPENAI_TIMEOUT')) throw failure;
          // Retry generation only. Tools run once outside this adapter, after a complete response.
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    }
  };
};
