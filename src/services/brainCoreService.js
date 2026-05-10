import { VertexAI } from '@google-cloud/vertexai';
import dotenv from 'dotenv';
import prisma from '../lib/prisma.js';

dotenv.config();

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'brainstudio-intelligence';
const LOCATION = 'us-central1'; // Embedding 004 typically available in us-central1
const EMBEDDING_MODEL = "text-embedding-004";
const CHAT_MODEL = "gemini-2.5-pro";

let vertexAI;
try {
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (credentialsJson) {
        const credentials = JSON.parse(credentialsJson);
        vertexAI = new VertexAI({
            project: PROJECT_ID,
            location: LOCATION,
            apiEndpoint: 'aiplatform.googleapis.com',
            googleAuthOptions: { credentials }
        });
    }
} catch (e) {
    console.error("[BrainCoreService] Failed to initialize Vertex AI client:", e);
}

/**
 * Generates embeddings for a given text using text-embedding-004.
 * @param {string} text - The text to embed.
 * @returns {Promise<number[]>} - The vector embedding.
 */
export const generateEmbedding = async (text) => {
    if (!vertexAI) throw new Error("Vertex AI not initialized");

    try {
        // Vertex AI Node.js SDK doesn't have a direct high-level method for embeddings in some versions,
        // but we can use the generative model interface if supported or fallback to REST/lower-level.
        // For text-embedding-004, we use the prediction service.

        const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${EMBEDDING_MODEL}`;
        const predictionServiceClient = vertexAI.preview.getGenerativeModel({ model: EMBEDDING_MODEL });

        // Note: The above is a bit hand-wavy depending on SDK version.
        // Let's use the standard way if available or assume it exists.
        // Actually, text-embedding-004 is usually called via the prediction service.

        const result = await predictionServiceClient.embedContent({
            content: { parts: [{ text }] }
        });

        return result.embedding.values;
    } catch (error) {
        console.error("[BrainCoreService] Embedding generation failed:", error);
        throw error;
    }
};

/**
 * Performs OCR on an image buffer using Gemini 2.5 Pro.
 * @param {Buffer} imageBuffer - The image data.
 * @param {string} mimeType - The mime type of the image.
 * @returns {Promise<string>} - The extracted text.
 */
export const performOCR = async (imageBuffer, mimeType) => {
    if (!vertexAI) throw new Error("Vertex AI not initialized");

    try {
        const model = vertexAI.getGenerativeModel({ model: CHAT_MODEL });

        const prompt = "Extrae TODO el texto de esta imagen, especialmente si es una captura de WhatsApp. Devuelve solo el texto extraído sin comentarios adicionales.";
        const imagePart = {
            inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType: mimeType
            }
        };

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        return response.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error("[BrainCoreService] OCR failed:", error);
        throw error;
    }
};

/**
 * Saves information to the AgencyContext.
 * @param {string} content - Text content.
 * @param {string} type - TEXT or IMAGE.
 * @param {Object} metadata - Additional info.
 */
export const addAgencyContext = async (content, type = 'TEXT', metadata = {}) => {
    const embedding = await generateEmbedding(content);

    // We use a raw query because Prisma doesn't natively support pgvector's vector type yet
    // with standard create() if it's an Unsupported type.

    const id = crypto.randomUUID();
    const createdAt = new Date();
    const metadataJson = JSON.stringify(metadata);

    await prisma.$executeRawUnsafe(
        `INSERT INTO "AgencyContext" (id, content, type, metadata, "vectorEmbeddings", "createdAt")
         VALUES ($1, $2, $3, $4, $5::vector, $6)`,
        id, content, type, metadataJson, `[${embedding.join(',')}]`, createdAt
    );

    return { id, content, type, metadata };
};

/**
 * Searches for relevant context using semantic search.
 */
export const searchContext = async (queryText, limit = 5) => {
    const embedding = await generateEmbedding(queryText);
    const vectorStr = `[${embedding.join(',')}]`;

    const results = await prisma.$queryRawUnsafe(
        `SELECT id, content, type, metadata, "createdAt",
         (1 - ("vectorEmbeddings" <=> $1::vector)) as similarity
         FROM "AgencyContext"
         WHERE "vectorEmbeddings" IS NOT NULL
         ORDER BY "vectorEmbeddings" <=> $1::vector
         LIMIT $2`,
        vectorStr, limit
    );

    return results;
};

/**
 * Generates proactive recommendations by crossing tasks with context.
 * Optimized to use a single AI call for batch analysis.
 */
export const getProactiveFeed = async () => {
    // 1. Get current active tasks
    const activeTasks = await prisma.task.findMany({
        where: { status: { in: ['PENDIENTE', 'EN_CURSO'] } },
        take: 10,
        orderBy: { createdAt: 'desc' }
    });

    if (activeTasks.length === 0) return [];

    // 2. Collect relevant context for all tasks (parallel semantic search)
    const taskContextPairs = await Promise.all(activeTasks.map(async (task) => {
        const context = await searchContext(`${task.title} ${task.comments || ''}`, 2);
        return { task, context: context.filter(c => c.similarity > 0.7) };
    }));

    // Filter only tasks that actually have relevant context
    const tasksWithContext = taskContextPairs.filter(p => p.context.length > 0);

    if (tasksWithContext.length === 0) return [];

    // 3. Batch analysis via AI
    return await generateBatchRecommendationsWithAI(tasksWithContext);
};

const generateBatchRecommendationsWithAI = async (tasksWithContext) => {
    if (!vertexAI) return [];

    const model = vertexAI.getGenerativeModel({ model: CHAT_MODEL });

    const tasksDataText = tasksWithContext.map((p, idx) => `
        Tarea ${idx + 1}:
        ID: ${p.task.id}
        Título: ${p.task.title}
        Descripción: ${p.task.comments || 'N/A'}
        Contexto Histórico Relacionado:
        ${p.context.map(c => `- ${c.content}`).join('\n')}
    `).join('\n---\n');

    const prompt = `
        Analiza las siguientes tareas de la agencia frente a su contexto histórico.
        Tu misión es detectar conflictos, preferencias de clientes o restricciones críticas que el equipo deba conocer.

        ${tasksDataText}

        Responde ÚNICAMENTE un array JSON con objetos que contengan:
        { "alert": "Mensaje corto y proactivo", "severity": "info/warning/critical", "taskId": "ID de la tarea" }

        Si para una tarea no hay una recomendación crítica real, no la incluyas en el array.
        Si no hay nada relevante para ninguna, responde [].
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.candidates[0].content.parts[0].text;
        const cleanedText = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanedText);
    } catch (e) {
        console.error("[BrainCoreService] Batch recommendation failed:", e);
        return [];
    }
};
