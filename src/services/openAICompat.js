const RESPONSES_URL = 'https://api.openai.com/v1/responses';
const EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

const normalizeSchema = (value) => {
    if (Array.isArray(value)) return value.map(normalizeSchema);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
        key,
        key === 'type' && typeof child === 'string' ? child.toLowerCase() : normalizeSchema(child)
    ]));
};

export const parseOpenAIResponseText = (response = {}) => {
    if (typeof response.output_text === 'string') return response.output_text;
    const outputText = (response.output || [])
        .flatMap(item => item.content || [])
        .filter(item => item.type === 'output_text' && typeof item.text === 'string')
        .map(item => item.text)
        .join('');
    if (outputText) return outputText;
    return (response.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('');
};

const toInputContent = (parts = []) => parts.flatMap((part) => {
    if (typeof part.text === 'string') return [{ type: 'input_text', text: part.text }];
    if (part.inlineData?.data) {
        return [{
            type: 'input_image',
            image_url: `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`
        }];
    }
    if (part.functionResponse) {
        return [{ type: 'input_text', text: `Resultado de ${part.functionResponse.name}: ${JSON.stringify(part.functionResponse.response)}` }];
    }
    if (part.functionCall) {
        return [{ type: 'input_text', text: `Se solicitó ejecutar ${part.functionCall.name} con ${JSON.stringify(part.functionCall.args || {})}` }];
    }
    return [];
});

const toInput = (contents = []) => contents.map(content => ({
    role: content.role === 'model' ? 'assistant' : content.role,
    content: toInputContent(content.parts)
})).filter(content => content.content.length > 0);

const toTools = (tools = []) => tools.flatMap(group => group.functionDeclarations || []).map(fn => ({
    type: 'function',
    name: fn.name,
    description: fn.description,
    parameters: normalizeSchema(fn.parameters),
    strict: false
}));

const requestJson = async (url, apiKey, body) => {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const details = await response.text().catch(() => '');
        const error = new Error(`OpenAI HTTP ${response.status}: ${details}`);
        error.status = response.status;
        throw error;
    }
    return response.json();
};

export class OpenAICompat {
    constructor({ apiKey } = {}) {
        if (!apiKey) throw new Error('Missing OPENAI_API_KEY in server configuration');
        this.apiKey = apiKey;
        this.models = {
            generateContent: this.generateContent.bind(this),
            generateContentStream: this.generateContentStream.bind(this),
            embedContent: this.embedContent.bind(this)
        };
    }

    async generateContent({ model, contents, config = {} }) {
        const body = {
            model,
            input: toInput(contents),
            ...(config.systemInstruction ? { instructions: config.systemInstruction } : {})
        };
        const functions = toTools(config.tools || []);
        if (functions.length) body.tools = functions;
        if (config.responseMimeType === 'application/json') {
            body.text = config.responseSchema
                ? { format: { type: 'json_schema', name: 'structured_response', schema: normalizeSchema(config.responseSchema), strict: false } }
                : { format: { type: 'json_object' } };
        }
        const response = await requestJson(RESPONSES_URL, this.apiKey, body);
        const rawText = parseOpenAIResponseText(response);
        const text = config.responseMimeType === 'application/json'
            ? rawText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
            : rawText;
        const functionCalls = (response.output || []).filter(item => item.type === 'function_call').map(item => ({
            name: item.name,
            args: typeof item.arguments === 'string' ? JSON.parse(item.arguments || '{}') : (item.arguments || {})
        }));
        return {
            ...response,
            text,
            functionCalls,
            candidates: [{ content: { role: 'model', parts: [
                ...(text ? [{ text }] : []),
                ...functionCalls.map(functionCall => ({ functionCall }))
            ] } }]
        };
    }

    async generateContentStream(args) {
        const response = await this.generateContent(args);
        return {
            stream: (async function* () { if (response.text) yield { text: response.text }; })(),
            response: Promise.resolve(response)
        };
    }

    async embedContent({ model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large', contents }) {
        const input = contents.flatMap(content => content.parts || []).map(part => part.text || '').join('\n');
        const response = await requestJson(EMBEDDINGS_URL, this.apiKey, { model, input, dimensions: 3072 });
        const values = response.data?.[0]?.embedding;
        return { embedding: { values }, embeddings: [{ values }] };
    }
}
