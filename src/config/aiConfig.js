/**
 * Configuración central de IA. OpenAI es el único proveedor de ejecución.
 * Cada modelo conserva un rol separado para controlar costo y latencia.
 */
export const AI_PROVIDER = 'openai';

export const AI_MODELS = Object.freeze({
    chat: process.env.OPENAI_MODEL_CHAT || process.env.OPENAI_MODEL || 'gpt-5.6-terra',
    fast: process.env.OPENAI_MODEL_FAST || process.env.OPENAI_MODEL || 'gpt-5.6-luna',
    vision: process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL || 'gpt-5.6-terra',
    embedding: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large'
});

export const FINAL_MODEL_NAME = AI_MODELS.chat;

const aiConfig = {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    modelName: FINAL_MODEL_NAME,
    models: AI_MODELS,
    isReady: Boolean(process.env.OPENAI_API_KEY)
};

export default aiConfig;
