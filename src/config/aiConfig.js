/**
 * aiConfig.js - Centralized configuration for AI services.
 */

// Model priority: MODEL_NAME > GEMINI_MODEL > Default
export const FINAL_MODEL_NAME = process.env.MODEL_NAME || process.env.GEMINI_MODEL || "gemini-1.5-flash";

const aiConfig = {
    apiKey: process.env.GEMINI_API_KEY,
    modelName: FINAL_MODEL_NAME,
    isReady: !!process.env.GEMINI_API_KEY
};

export default aiConfig;
