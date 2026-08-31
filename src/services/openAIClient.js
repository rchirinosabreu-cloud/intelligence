const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODELS = Object.freeze({
  chat: 'gpt-5.6-terra',
  fast: 'gpt-5.6-luna',
  vision: 'gpt-5.6-terra',
  embedding: 'text-embedding-3-large'
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

const convertGeminiContents = (contents = []) => {
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

const buildTextFormat = (schema) => {
  if (!schema) return { type: 'json_object' };
  return {
    type: 'json_schema',
    name: 'brainstudio_response',
    strict: false,
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
  models = {}
} = {}) => {
  const selectedModels = { ...DEFAULT_MODELS, ...models };

  const request = async (path, body) => {
    if (!apiKey) throw new OpenAIRequestError('OPENAI_API_KEY no está configurada.', { code: 'OPENAI_NOT_CONFIGURED' });
    if (typeof fetchImpl !== 'function') throw new OpenAIRequestError('No hay un cliente HTTP disponible para OpenAI.');

    const response = await fetchImpl(`${OPENAI_API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'BrainStudioIntelligence/3.0'
      },
      body: JSON.stringify(body)
    });

    const requestId = response.headers?.get?.('x-request-id') || undefined;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const upstreamMessage = payload?.error?.message || `OpenAI respondió HTTP ${response.status}`;
      throw new OpenAIRequestError(upstreamMessage, {
        status: response.status,
        requestId,
        code: payload?.error?.code || payload?.error?.type
      });
    }
    return { payload, requestId };
  };

  const generate = async ({
    prompt,
    input,
    instructions,
    model = selectedModels.chat,
    tools = [],
    responseSchema,
    json = false,
    maxOutputTokens
  }) => {
    const body = {
      model,
      input: input || prompt,
      ...(instructions ? { instructions } : {}),
      ...(/^gpt-5(?:\.|-)/.test(model) ? { reasoning: { effort: 'none' } } : {}),
      ...(tools.length ? { tools: normalizeTools(tools) } : {}),
      ...((responseSchema || json) ? { text: { format: buildTextFormat(responseSchema) } } : {}),
      ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {})
    };

    const { payload, requestId } = await request('/responses', body);
    return {
      id: payload.id,
      model: payload.model || model,
      text: extractResponseText(payload),
      functionCalls: extractFunctionCalls(payload),
      output: payload.output || [],
      requestId,
      raw: payload
    };
  };

  const generateContent = async ({ model, contents = [], config = {} }) => {
    const generationConfig = config.generationConfig || config;
    const result = await generate({
      input: convertGeminiContents(contents),
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

  const embed = async (text, { dimensions = 3072 } = {}) => {
    const { payload } = await request('/embeddings', {
      model: selectedModels.embedding,
      input: text,
      dimensions,
      encoding_format: 'float'
    });
    return payload?.data?.[0]?.embedding || null;
  };

  const generateContentStream = async (payload) => {
    const result = await generateContent(payload);
    async function* stream() {
      if (result.text) yield { text: result.text };
    }
    return { stream: stream(), response: Promise.resolve(result) };
  };

  const embedContent = async ({ contents }) => {
    const text = (contents || []).flatMap((item) => item.parts || []).map((part) => part.text || '').join('\n');
    const embedding = await embed(text);
    return { embedding: { values: embedding }, embeddings: [{ values: embedding }] };
  };

  return {
    models: {
      ...selectedModels,
      generateContent,
      generateContentStream,
      embedContent
    },
    generate,
    embed,
    async healthCheck() {
      const startedAt = Date.now();
      const result = await generate({
        prompt: 'Responde únicamente: OK',
        instructions: 'Esta es una comprobación técnica de disponibilidad.',
        model: selectedModels.fast,
        maxOutputTokens: 16
      });
      return {
        ok: Boolean(result.text),
        provider: 'openai',
        model: result.model,
        requestId: result.requestId,
        latencyMs: Date.now() - startedAt
      };
    },
    generateContent,
    generateContentStream,
    embedContent
  };
};

export { DEFAULT_MODELS, convertGeminiContents, extractResponseText, normalizeTools };
