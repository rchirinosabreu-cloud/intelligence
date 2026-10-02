import aiConfig from '../config/aiConfig.js';
import { createOpenAIClient } from './openAIClient.js';

let aiClient = null;
let aiHealth = {
    provider: 'openai',
    model: aiConfig.models.chat,
    status: aiConfig.apiKey ? 'unchecked' : 'unavailable',
    checkedAt: null,
    latencyMs: null,
    requestId: null,
    error: aiConfig.apiKey ? null : 'OPENAI_NOT_CONFIGURED'
};

/**
 * Adaptador estable de Brainstudio sobre OpenAI.
 */
export const BrainstudioAI = {
    isReady: aiConfig.isReady,

    /**
     * Initializes the underlying SDK client.
     */
    async initialize() {
        if (aiClient && aiHealth.status === 'healthy') return aiClient;
        if (!aiConfig.apiKey) {
            console.error("[BrainstudioAI] CRITICAL: OPENAI_API_KEY no está configurada.");
            this.isReady = false;
            aiHealth = { ...aiHealth, status: 'unavailable', checkedAt: new Date().toISOString(), error: 'OPENAI_NOT_CONFIGURED' };
            return null;
        }

        try {
            aiClient = createOpenAIClient({ apiKey: aiConfig.apiKey, models: aiConfig.models });
            console.log(`[BrainstudioAI] Verificando OpenAI con el modelo rápido ${aiConfig.models.fast}...`);
            const health = await aiClient.healthCheck();
            if (!health.ok) throw new Error('OpenAI no devolvió contenido en la comprobación.');

            aiHealth = {
                ...health,
                status: 'healthy',
                checkedAt: new Date().toISOString(),
                error: null
            };
            this.isReady = true;
            return aiClient;
        } catch (e) {
            console.error("[BrainstudioAI] CRITICAL: Falló la comprobación real de OpenAI:", {
                message: e.message,
                code: e.code,
                status: e.status,
                requestId: e.requestId
            });
            this.isReady = false;
            aiHealth = {
                provider: 'openai',
                model: aiConfig.models.fast,
                status: 'degraded',
                checkedAt: new Date().toISOString(),
                latencyMs: null,
                requestId: e.requestId || null,
                error: e.code || `HTTP_${e.status || 'ERROR'}`
            };
            return null;
        }
    },

    /**
     * Safe wrapper to generate content with structured config and error handling.
     */
    async generateStructuredContent(prompt, systemInstruction, schema) {
        if (!this.isReady && !aiClient) {
            const initialized = await this.initialize();
            if (!initialized) throw new Error("IA_DESACTIVADA: Service not ready.");
        }

        try {
            // SDK v2.7.0 Unified Signature - systemInstruction inside config
            const result = await aiClient.models.generateContent({
                model: aiConfig.modelName,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    systemInstruction: systemInstruction,
                    responseMimeType: "application/json",
                    responseSchema: schema
                }
            });
            return result;
        } catch (error) {
            console.error("[BrainstudioAI] Content generation failed:", error.message);
            throw error;
        }
    }
};

// Legacy compatibility exports (mapped to the new adapter)
export const isInitialized = () => BrainstudioAI.isReady;
export const initialize = () => BrainstudioAI.initialize();
export const getAIHealth = () => ({ ...aiHealth });

/**
 * Defensive JSON parser that cleans Markdown code blocks and whitespace.
 */
export const parseJsonResponse = (text) => {
    if (!text || typeof text !== 'string') {
        console.error("[AiService] parseJsonResponse failed: invalid input type", typeof text);
        throw new Error("Empty or invalid text provided to JSON parser");
    }

    try {
        let cleanText = text.trim();
        // Extract content between first { or [ and last } or ]
        const firstBrace = cleanText.search(/[{[]/);
        const lastBrace = Math.max(cleanText.lastIndexOf('}'), cleanText.lastIndexOf(']'));

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
        } else {
            // Fallback: strip markdown code blocks
            cleanText = cleanText.replace(/\`\`\`json|\`\`\`/gi, '').trim();
        }

        try {
            return JSON.parse(cleanText);
        } catch (parseError) {
            // Un proveedor puede agotar su salida mientras emite un decimal muy largo.
            // decimal. Only repair this narrow, deterministic truncation shape; never
            // fabricate missing strings, arrays, keys, or values.
            const withoutFence = text.replace(/```json|```/gi, '').trim();
            if (!/\.\d{8,}$/.test(withoutFence)) throw parseError;

            const roundedTail = withoutFence.replace(
                /(-?\d+\.\d{4})\d*$/,
                (_, precision) => String(Number(Number(precision).toFixed(4)))
            );
            const stack = [];
            let inString = false;
            let escaped = false;
            for (const char of roundedTail) {
                if (inString) {
                    if (escaped) escaped = false;
                    else if (char === '\\') escaped = true;
                    else if (char === '"') inString = false;
                } else if (char === '"') inString = true;
                else if (char === '{' || char === '[') stack.push(char);
                else if (char === '}' || char === ']') stack.pop();
            }
            if (inString || stack.length === 0) throw parseError;
            const repaired = roundedTail + stack.reverse().map(char => char === '{' ? '}' : ']').join('');
            return JSON.parse(repaired);
        }
    } catch (e) {
        console.error("[AiService] JSON Parse Error. Raw text snippet:", text.substring(0, 100));
        throw new Error(`Failed to parse AI response as JSON: ${e.message}`);
    }
};

export const extractModelText = (result) => {
    if (!result) throw new Error("Null result provided to text extractor");

    try {
        // Contrato normalizado: texto directo o función text().
        if (typeof result.text === 'function') {
            const text = result.text();
            if (text && String(text).trim()) return text;
        }

        // Direct property access as fallback
        if (result.text && typeof result.text === 'string' && result.text.trim()) {
            return result.text;
        }

        // Fallback logic for safety across SDK versions
        const directText = typeof result?.response?.text === 'function'
            ? result.response.text()
            : result?.response?.text;

        if (directText && String(directText).trim()) return directText;

        const candidates = result?.response?.candidates || result?.candidates || [];
        const firstCandidate = candidates[0];
        const parts = firstCandidate?.content?.parts || firstCandidate?.parts || [];
        const firstPart = parts[0];

        if (firstPart?.text && String(firstPart.text).trim()) return firstPart.text;
        if (firstPart?.functionCall?.args) return JSON.stringify(firstPart.functionCall.args);

    } catch (e) {
        console.error("[AiService] Model text extraction failed:", e.message);
    }

    throw new Error('Empty or malformed AI response');
};

export const getAIInstance = () => aiClient;
