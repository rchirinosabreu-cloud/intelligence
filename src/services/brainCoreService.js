import { VertexAI } from '@google-cloud/vertexai';
import dotenv from 'dotenv';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';

dotenv.config();

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'brainstudio-intelligence';
const LOCATION = 'us-central1';
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
 * Generates embeddings for a given text.
 */
export const generateEmbedding = async (text) => {
    if (!vertexAI) return null;
    try {
        const model = vertexAI.getGenerativeModel({ model: EMBEDDING_MODEL });
        const result = await model.embedContent({
            content: { parts: [{ text }] }
        });
        return result.embedding.values;
    } catch (error) {
        console.error("[BrainCoreService] Embedding generation failed (Cerebro en mantenimiento):", error.message);
        return null;
    }
};

/**
 * Performs OCR and extraction using Gemini 2.5 Pro.
 */
export const performAdvancedExtraction = async (imageBuffer, mimeType) => {
    if (!vertexAI) return null;
    try {
        const model = vertexAI.getGenerativeModel({ model: CHAT_MODEL });
        const prompt = `Analiza esta captura de pantalla de WhatsApp u otra imagen de la agencia.
        Detecta el sentimiento, extrae preferencias del cliente, lo que odia, lo que aprueba y cualquier instrucción crítica.
        Responde en formato JSON:
        { "content": "Texto completo extraído", "insights": { "preferences": [], "dislikes": [], "approvals": [], "sentiment": "" } }`;

        const imagePart = { inlineData: { data: imageBuffer.toString('base64'), mimeType } };
        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.candidates[0].content.parts[0].text;
        return JSON.parse(responseText.replace(/```json|```/g, ''));
    } catch (error) {
        console.error("[BrainCoreService] Advanced extraction failed:", error);
        return null;
    }
};

/**
 * Saves context with client siloing.
 */
export const addAgencyContext = async (content, type = 'TEXT', clientId = null, metadata = {}) => {
    const embedding = await generateEmbedding(content);
    if (!embedding) throw new Error("Cerebro en mantenimiento: Error de embeddings.");

    const id = crypto.randomUUID();
    const createdAt = new Date();

    await prisma.$executeRawUnsafe(
        `INSERT INTO "AgencyContext" (id, content, type, "clientId", metadata, "vectorEmbeddings", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6::vector, $7)`,
        id, content, type, clientId, JSON.stringify(metadata), `[${embedding.join(',')}]`, createdAt
    );

    return { id, content, type, clientId, metadata };
};

/**
 * Semantic search within client silo if specified.
 */
export const searchContext = async (queryText, clientId = null, limit = 5) => {
    const embedding = await generateEmbedding(queryText);
    if (!embedding) return [];

    let query = `SELECT id, content, type, "clientId", metadata, "createdAt",
                 (1 - ("vectorEmbeddings" <=> $1::vector)) as similarity
                 FROM "AgencyContext" WHERE "vectorEmbeddings" IS NOT NULL`;
    const params = [`[${embedding.join(',')}]` ];

    if (clientId) {
        query += ` AND "clientId" = $2`;
        params.push(clientId);
    }

    query += ` ORDER BY "vectorEmbeddings" <=> $1::vector LIMIT ${clientId ? '$3' : '$2'}`;
    if (clientId) params.push(limit); else params.push(limit);

    return await prisma.$queryRawUnsafe(query, ...params);
};

/**
 * Generates the categorized Intelligence Feed.
 */
export const getIntelligenceFeed = async () => {
    const activeTasks = await prisma.task.findMany({
        where: { status: { in: ['PENDIENTE', 'EN_CURSO'] } },
        take: 15,
        include: { client: true },
        orderBy: { createdAt: 'desc' }
    });

    if (activeTasks.length === 0) return [];

    // Parallel context search for tasks
    const tasksWithContext = await Promise.all(activeTasks.map(async (task) => {
        const context = await searchContext(`${task.title} ${task.comments || ''}`, task.clientId, 3);
        return { task, context: context.filter(c => c.similarity > 0.75) };
    }));

    const meaningfulTasks = tasksWithContext.filter(p => p.context.length > 0);

    // Recent context history
    const recentHistory = await prisma.agencyContext.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { client: true }
    });

    if (meaningfulTasks.length === 0) {
        return recentHistory.map(h => ({
            id: h.id,
            type: 'HISTORIAL',
            title: `Memoria de ${h.client?.name || 'Agencia'}`,
            content: h.content,
            severity: 'info',
            timestamp: h.createdAt
        }));
    }

    return await generateStructuredFeedWithAI(meaningfulTasks, recentHistory);
};

const generateStructuredFeedWithAI = async (meaningfulTasks, recentHistory) => {
    if (!vertexAI) return [];
    const model = vertexAI.getGenerativeModel({ model: CHAT_MODEL });

    const prompt = `Analiza las tareas y el historial reciente de la agencia. Genera un feed de tarjetas inteligentes.
    Tareas y Contexto: ${JSON.stringify(meaningfulTasks.map(t => ({ title: t.task.title, context: t.context.map(c => c.content) })))}
    Historial Reciente: ${JSON.stringify(recentHistory.map(h => h.content))}

    Devuelve un array JSON de objetos:
    { "id": "uuid", "type": "ALERTA/INSIGHT/RECOMENDACIÓN/HISTORIAL", "title": "Título corto", "content": "Cuerpo conciso", "severity": "critical/warning/info", "timestamp": "ISO Date" }`;

    try {
        const result = await model.generateContent(prompt);
        return JSON.parse(result.response.candidates[0].content.parts[0].text.replace(/```json|```/g, ''));
    } catch (e) {
        return [];
    }
};

/**
 * Gets the "Knowledge Radar" (Client Profile) from memory.
 */
export const getClientProfileFromMemory = async (clientId) => {
    const contexts = await prisma.agencyContext.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
        take: 50
    });

    if (contexts.length === 0) return null;

    const model = vertexAI.getGenerativeModel({ model: CHAT_MODEL });
    const prompt = `Analiza estas notas de la agencia sobre un cliente específico y construye su 'Ficha Mental'.
    Notas: ${contexts.map(c => c.content).join('\n')}

    Devuelve JSON:
    { "preferences": [], "dislikes": [], "approvals": [], "sentiment": "Evolución del sentimiento" }`;

    try {
        const result = await model.generateContent(prompt);
        return JSON.parse(result.response.candidates[0].content.parts[0].text.replace(/```json|```/g, ''));
    } catch (e) {
        return null;
    }
};
