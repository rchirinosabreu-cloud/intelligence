import { createGovernedFetch } from './aiEgress.js';

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODELS = Object.freeze({
  chat: 'gpt-5.6-terra',
  fast: 'gpt-5.6-luna',
  vision: 'gpt-5.6-terra',
  embedding: 'text-embedding-3-large',
  memoryEmbedding: 'text-embedding-3-small',
  transcription: 'gpt-4o-mini-transcribe'
});

const normalizeSchema = (value) => {
  if (Array.isArray(value)) return value.map(normalizeSchema);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (key === 'type' && typeof child === 'string') return [key, child.toLowerCase()];
    return [key, normalizeSchema(child)];
  }));
};

const parseToolArguments = (rawArguments) => {
  if (!rawArguments) return {};
  if (typeof rawArguments === 'object') return rawArguments;
  try {
    return JSON.parse(rawArguments);
  } catch {
    return {};
  }
};

const extractResponseText = (response) => {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }

  const outputText = (response?.output || [])
    .filter((item) => item?.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
  if (outputText) return outputText;

  // Compatibilidad defensiva con fixtures y respuestas normalizadas históricas.
  return (response?.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || '')
    .join('');
};

const extractFunctionCalls = (response) => (response?.output || [])
  .filter((item) => item?.type === 'function_call')
  .map((item) => ({
    id: item.call_id || item.id,
    name: item.name,
    args: parseToolArguments(item.arguments)
  }));

const normalizeTools = (tools = []) => {
  const declarations = tools.flatMap((tool) => tool?.functionDeclarations || tool || []);
  return declarations
    .filter((tool) => tool?.name)
    .map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description || '',
      parameters: normalizeSchema(tool.parameters || { type: 'object', properties: {} }),
      strict: false
    }));
};

const toMessageContent = (parts = []) => {
  const content = [];
  for (const part of parts) {
    if (typeof part?.text === 'string') {
      content.push({ type: 'input_text', text: part.text });
    }
    if (part?.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || 'image/png';
      content.push({
        type: 'input_image',
        image_url: `data:${mimeType};base64,${part.inlineData.data}`,
        detail: 'high'
      });
    }
  }
  return content;
};

// Traduce el formato de mensajes por partes ({ role, parts }) que usan los llamadores
// de generateContent a la entrada de la Responses API de OpenAI.
const toResponsesInput = (contents = []) => {
  const input = [];
  const callIdsByName = new Map();

  for (const item of contents) {
    if (Array.isArray(item?._openaiOutputItems)) {
      input.push(...item._openaiOutputItems);
      for (const outputItem of item._openaiOutputItems) {
        if (outputItem?.type === 'function_call') {
          callIdsByName.set(outputItem.name, outputItem.call_id || outputItem.id);
        }
      }
      continue;
    }

    const parts = item?.parts || [];
    const messageContent = toMessageContent(parts);
    if (messageContent.length > 0) {
      input.push({
        role: item.role === 'model' ? 'assistant' : 'user',
        content: messageContent
      });
    }

    for (const part of parts) {
      if (part?.functionCall?.name) {
        const callId = part.functionCall.id || `call_${part.functionCall.name}`;
        callIdsByName.set(part.functionCall.name, callId);
        input.push({
          type: 'function_call',
          call_id: callId,
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args || {})
        });
      }
      if (part?.functionResponse?.name) {
        input.push({
          type: 'function_call_output',
          call_id: part.functionResponse.id || callIdsByName.get(part.functionResponse.name) || `call_${part.functionResponse.name}`,
          output: JSON.stringify(part.functionResponse.response?.content ?? part.functionResponse.response ?? null)
        });
      }
    }
  }

  return input;
};

const buildTextFormat = (schema, strict = false) => {
  if (!schema) return { type: 'json_object' };
  return {
    type: 'json_schema',
    name: 'brainstudio_response',
    strict,
    schema: normalizeSchema(schema)
  };
};

export class OpenAIRequestError extends Error {
  constructor(message, { status, requestId, code } = {}) {
    super(message);
    this.name = 'OpenAIRequestError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export const createOpenAIClient = ({
  apiKey = process.env.OPENAI_API_KEY,
  fetchImpl = globalThis.fetch,
  governance,
  usageLog,
  models = {},
  requestTimeoutMs = 90000
} = {}) => {
  const selectedModels = { ...DEFAULT_MODELS, ...models };
  const send = createGovernedFetch({ fetchImpl, governance, usageLog });

  const request = async (path, body, signal, governanceContext, technicalProbe = false) => {
    if (!apiKey) throw new OpenAIRequestError('OPENAI_API_KEY no está configurada.', { code: 'OPENAI_NOT_CONFIGURED' });
    if (typeof fetchImpl !== 'function') throw new OpenAIRequestError('No hay un cliente HTTP disponible para OpenAI.');

    const timeout = new AbortController();
    const requestSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    const timer = setTimeout(() => timeout.abort(), requestTimeoutMs);
    try {
      const response = await (technicalProbe ? fetchImpl : send)(`${OPENAI_API_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          ...(!(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'BrainStudioIntelligence/3.0'
        },
        body: body instanceof FormData ? body : JSON.stringify(body),
        signal: requestSignal,
        redirect: 'error',
        ...(!technicalProbe ? { governanceContext } : {})
      });

      const requestId = response.headers?.get?.('x-request-id') || undefined;
      const payload = await response.json().catch(() => ({}));
      requestSignal.throwIfAborted();
      if (!response.ok) {
        const upstreamMessage = payload?.error?.message || `OpenAI respondió HTTP ${response.status}`;
        throw new OpenAIRequestError(upstreamMessage, {
          status: response.status,
          requestId,
          code: payload?.error?.code || payload?.error?.type
        });
      }
      return { payload, requestId };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (timeout.signal.aborted) throw new OpenAIRequestError('OpenAI superó el tiempo máximo de respuesta.', { code: 'OPENAI_TIMEOUT', status: 504 });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  // Respuesta por partes (Responses API con `stream: true`). Entrega cada trozo de texto a `onTextDelta` y devuelve
  // la respuesta final completa, la misma que daría la petición normal. El reloj de espera cubre toda la lectura y
  // el registro de uso se escribe al final, con los tokens del evento `response.completed`.
  const requestStream = async (path, body, signal, governanceContext, onTextDelta) => {
    if (!apiKey) throw new OpenAIRequestError('OPENAI_API_KEY no está configurada.', { code: 'OPENAI_NOT_CONFIGURED' });
    const timeout = new AbortController();
    const requestSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    const timer = setTimeout(() => timeout.abort(), requestTimeoutMs);
    let response;
    let finalPayload = null;
    try {
      response = await send(`${OPENAI_API_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${apiKey}`, 'User-Agent': 'BrainStudioIntelligence/3.0' },
        body: JSON.stringify({ ...body, stream: true }),
        signal: requestSignal,
        redirect: 'error',
        governanceContext,
        reportsStreamUsage: true
      });
      const requestId = response.headers?.get?.('x-request-id') || undefined;
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new OpenAIRequestError(payload?.error?.message || `OpenAI respondió HTTP ${response.status}`, { status: response.status, requestId, code: payload?.error?.code || payload?.error?.type });
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const handle = (block) => {
        const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (!data || data === '[DONE]') return;
        let event;
        try { event = JSON.parse(data); } catch { return; }
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') onTextDelta(event.delta);
        else if (event.type === 'response.completed' || event.type === 'response.incomplete') finalPayload = event.response;
        else if (event.type === 'response.failed' || event.type === 'error') {
          const failure = event.response?.error || event.error || event;
          throw new OpenAIRequestError(failure?.message || 'OpenAI no pudo completar la respuesta.', { status: 502, requestId, code: failure?.code || 'OPENAI_STREAM_FAILED' });
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf('\n\n')) >= 0) { handle(buffer.slice(0, cut)); buffer = buffer.slice(cut + 2); }
      }
      if (buffer.trim()) handle(buffer);
      requestSignal.throwIfAborted();
      if (!finalPayload) throw new OpenAIRequestError('La respuesta de OpenAI se cortó antes de terminar.', { status: 502, requestId, code: 'OPENAI_STREAM_INCOMPLETE' });
      response.reportStreamUsage?.({ payload: finalPayload });
      return { payload: finalPayload, requestId };
    } catch (error) {
      response?.reportStreamUsage?.({ payload: finalPayload, failed: true });
      if (signal?.aborted) throw signal.reason;
      if (timeout.signal.aborted) throw new OpenAIRequestError('OpenAI superó el tiempo máximo de respuesta.', { code: 'OPENAI_TIMEOUT', status: 504 });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  const generate = async ({
    prompt,
    input,
    instructions,
    model = selectedModels.chat,
    tools = [],
    responseSchema,
    strictSchema = false,
    reasoningEffort,
    promptCacheKey,
    safetyIdentifier,
    json = false,
    maxOutputTokens,
    signal,
    governanceContext,
    onTextDelta
  }) => {
    const body = {
      model,
      store: false,
      ...(/^gpt-[56](?:\.|-)/.test(model) ? { include: ['reasoning.encrypted_content'] } : {}),
      input: input || prompt,
      ...(instructions ? { instructions } : {}),
      ...(/^gpt-[56](?:\.|-)/.test(model) ? { reasoning: { effort: reasoningEffort || (model.startsWith('gpt-6') ? 'low' : 'none') } } : {}),
      ...(promptCacheKey ? { prompt_cache_key: promptCacheKey } : {}),
      ...(safetyIdentifier ? { safety_identifier: safetyIdentifier } : {}),
      ...(tools.length ? { tools: normalizeTools(tools) } : {}),
      ...((responseSchema || json) ? { text: { format: buildTextFormat(responseSchema, strictSchema) } } : {}),
      ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {})
    };

    const { payload, requestId } = typeof onTextDelta === 'function'
      ? await requestStream('/responses', body, signal, governanceContext, onTextDelta)
      : await request('/responses', body, signal, governanceContext);
    return {
      id: payload.id,
      model: payload.model || model,
      text: extractResponseText(payload),
      functionCalls: extractFunctionCalls(payload),
      output: payload.output || [],
      requestId,
      usage: payload.usage ?? null,
      raw: payload
    };
  };

  const generateContent = async ({ model, contents = [], config = {}, governanceContext }) => {
    const generationConfig = config.generationConfig || config;
    const result = await generate({
      input: toResponsesInput(contents),
      governanceContext,
      instructions: config.systemInstruction,
      model: model || selectedModels.chat,
      tools: config.tools || [],
      responseSchema: generationConfig.responseSchema,
      json: generationConfig.responseMimeType === 'application/json'
        || config.responseMimeType === 'application/json'
    });

    const parts = [
      ...(result.text ? [{ text: result.text }] : []),
      ...result.functionCalls.map((call) => ({ functionCall: { id: call.id, name: call.name, args: call.args } }))
    ];
    const content = { role: 'model', parts, _openaiOutputItems: result.output };
    return {
      text: result.text,
      functionCalls: result.functionCalls,
      candidates: [{ content }],
      response: { text: result.text, candidates: [{ content }] },
      requestId: result.requestId,
      model: result.model
    };
  };

  const embed = async (text, { dimensions = 3072, model = selectedModels.embedding, governanceContext } = {}) => {
    const { payload } = await request('/embeddings', {
      model,
      input: text,
      dimensions,
      encoding_format: 'float'
    }, undefined, governanceContext);
    return payload?.data?.[0]?.embedding || null;
  };

  return {
    models: {
      ...selectedModels,
      generateContent
    },
    generate,
    embed,
    async transcribe({ buffer, mime = 'audio/webm', name = 'dictado.webm', signal }) {
      const form = new FormData();
      form.set('model', selectedModels.transcription);
      form.set('language', 'es');
      form.set('response_format', 'json');
      form.set('file', new Blob([buffer], { type: mime }), name);
      const { payload } = await request('/audio/transcriptions', form, signal, { useCase: 'bria.dictation' });
      if (typeof payload.text !== 'string' || !payload.text.trim()) throw new OpenAIRequestError('No se detectó voz. Intenta grabar de nuevo.', { status: 422, code: 'NO_SPEECH' });
      return payload.text.trim();
    },
    async healthCheck() {
      const startedAt = Date.now();
      // The only ungoverned probe has fixed content, with no caller-controlled input.
      const { payload, requestId } = await request('/responses', {
        input: 'Responde únicamente: OK',
        instructions: 'Esta es una comprobación técnica de disponibilidad.',
        model: selectedModels.fast,
        max_output_tokens: 16
      }, undefined, undefined, true);
      return {
        ok: Boolean(payload.id),
        provider: 'openai',
        model: payload.model || selectedModels.fast,
        requestId,
        latencyMs: Date.now() - startedAt
      };
    },
    generateContent
  };
};

export { DEFAULT_MODELS, toResponsesInput, extractResponseText, normalizeTools };
