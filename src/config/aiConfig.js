
/**
 * aiConfig.js - Centralized configuration for AI services.
 */
const aiConfig = {
    apiKey: process.env.GEMINI_API_KEY,
    modelName: process.env.MODEL_NAME || process.env.GEMINI_MODEL || "gemini-1.5-flash",
    isReady: !!process.env.GEMINI_API_KEY
};

export default aiConfig;
