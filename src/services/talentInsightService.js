const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

export const resolveTalentInsightModel = (env = process.env) =>
    env.OPENAI_MODEL_RADAR || env.OPENAI_MODEL || 'gpt-5';

const extractResponseText = (payload) => {
    if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
        return payload.output_text.trim();
    }

    const text = (payload?.output || [])
        .flatMap(item => item?.content || [])
        .filter(item => item?.type === 'output_text')
        .map(item => item?.text || '')
        .join('')
        .trim();

    if (!text) throw new Error('OpenAI talent insight response content is empty');
    return text;
};

export const generateTalentInsightWithOpenAI = async (prompt, deps = {}) => {
    const env = deps.env || process.env;
    const fetchImpl = deps.fetchImpl || fetch;
    const apiKey = env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
        throw new Error('OPENAI_API_KEY not configured');
    }

    const response = await fetchImpl(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'BrainStudioIntelligence/2.0'
        },
        body: JSON.stringify({
            model: resolveTalentInsightModel(env),
            instructions: 'Eres el Director de Operaciones de Brainstudio. Genera feedback ejecutivo, humano y accionable basado exclusivamente en los datos entregados. Responde en español y en máximo dos párrafos.',
            input: prompt,
            text: { verbosity: 'medium' }
        }),
        signal: AbortSignal.timeout(60000)
    });

    const payloadText = await response.text();
    if (!response.ok) {
        throw new Error(`OpenAI talent insight generation failed (${response.status}): ${payloadText.slice(0, 500)}`);
    }

    return extractResponseText(JSON.parse(payloadText));
};
