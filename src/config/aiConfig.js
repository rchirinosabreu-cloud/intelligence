/**
 * aiConfig.js - Centralized configuration for AI services.
 */

// Gemini-era MODEL_NAME is intentionally ignored to prevent cross-provider model leakage.
export const FINAL_MODEL_NAME = process.env.OPENAI_MODEL || "gpt-5";

const aiConfig = {
    apiKey: process.env.OPENAI_API_KEY,
    modelName: FINAL_MODEL_NAME,
    isReady: !!process.env.OPENAI_API_KEY
};

export default aiConfig;
