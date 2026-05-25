import { GoogleGenerativeAI } from '@google/genai';
import dotenv from 'dotenv';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { readGoogleSheet, getRecentEmails, readGoogleSlides, DEFAULT_IMPERSONATED_EMAIL } from './googleWorkspaceService.js';

dotenv.config();

const EMBEDDING_MODEL = "text-embedding-004";
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

let genAI;
try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
        genAI = new GoogleGenerativeAI(apiKey);
        console.log("[BrainCoreService] Google Generative AI initialized with API Key.");
    } else {
        console.warn("[BrainCoreService] GEMINI_API_KEY is missing.");
    }
} catch (e) {
    console.error("[BrainCoreService] Failed to initialize Google Generative AI client:", e);
}

/**
 * Generates embeddings for a given text using text-embedding-004.
 */
export const generateEmbedding = async (text) => {
    if (!genAI) return null;
    try {
        const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error("[BrainCoreService] Embedding generation failed:", error.message);
        return null;
    }
};

/**
 * Performs OCR and extraction using Gemini.
 */
export const performAdvancedExtraction = async (imageBuffer, mimeType) => {
    if (!genAI) return null;
    try {
        const model = genAI.getGenerativeModel({ model: CHAT_MODEL });
        const promptText = `Analiza esta captura de pantalla de WhatsApp u otra imagen de la agencia.
        Detecta el sentimiento, extrae preferencias del cliente, lo que odia, lo que aprueba y cualquier instrucción crítica.
        TU OBJETIVO es generar una propuesta de memoria concisa y accionable.
        Responde en formato JSON:
        { "content": "Resumen ejecutivo de la instrucción (Ej: Alexander prefiere entregas los jueves)", "insights": { "preferences": [], "dislikes": [], "approvals": [], "sentiment": "" } }`;

        const imagePart = { inlineData: { data: imageBuffer.toString('base64'), mimeType } };

        const result = await model.generateContent([promptText, imagePart]);
        const responseText = result.response.text();
        return JSON.parse(responseText.replace(/```json|```/g, ''));
    } catch (error) {
        console.error("[BrainCoreService] Advanced extraction failed:", error);
        return null;
    }
};

/**
 * Saves context with client siloing.
 */
export const addAgencyContext = async (content, type = 'TEXT', clientId = null, metadata = {}, status = 'APPROVED') => {
    const embedding = await generateEmbedding(content);
    if (!embedding) throw new Error("Brain Core en mantenimiento: Error de sincronización.");

    // Usamos prisma para crear el registro básico (maneja JSON metadata correctamente)
    const context = await prisma.agencyContext.create({
        data: {
            content,
            type,
            clientId,
            metadata,
            status
        }
    });

    // Luego actualizamos el vector usando SQL Raw para pgvector
    await prisma.$executeRawUnsafe(
        `UPDATE "AgencyContext" SET "vectorEmbeddings" = $1::vector WHERE id = $2`,
        `[${embedding.join(',')}]`,
        context.id
    );

    return context;
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
export const getIntelligenceFeed = async (statusFilter = 'APPROVED') => {
    // Prioritize tasks: 1. Deadlines, 2. VIP (Special), 3. Priority
    const activeTasks = await prisma.task.findMany({
        where: { status: { in: ['PENDIENTE', 'EN_CURSO'] } },
        take: 30,
        include: { client: true },
        orderBy: [
            { dueDate: 'asc' },
            { isSpecial: 'desc' },
            { isPriority: 'desc' }
        ]
    });

    // Recent context history
    const recentHistory = await prisma.agencyContext.findMany({
        where: { status: statusFilter || 'APPROVED' },
        take: 15,
        orderBy: { createdAt: 'desc' },
        include: { client: true }
    });

    // If viewing proposals, just return them as historical cards for the UI to handle
    if (statusFilter === 'PENDING') {
        return recentHistory.map(h => ({
            id: h.id,
            contextId: h.id,
            type: 'PROPUESTA',
            title: `Propuesta de ${h.client?.name || 'Agencia'}`,
            content: h.content,
            severity: 'warning',
            timestamp: h.createdAt,
            metadata: h.metadata
        }));
    }

    if (activeTasks.length === 0) {
        return recentHistory.map(h => ({
            id: h.id,
            contextId: h.id,
            type: 'HISTORIAL',
            title: `Memoria de ${h.client?.name || 'Agencia'}`,
            content: h.content,
            severity: 'info',
            timestamp: h.createdAt
        }));
    }

    // Parallel context search for tasks (only approved context)
    const tasksWithContext = await Promise.all(activeTasks.map(async (task) => {
        const context = await searchContext(`${task.title} ${task.comments || ''}`, task.clientId, 3);
        // Ensure we only cross-ref with APPROVED context
        const approvedContext = context.filter(c => c.similarity > 0.7 && (c.status === 'APPROVED' || !c.status));
        return { task, context: approvedContext };
    }));

    const meaningfulTasks = tasksWithContext.filter(p => p.context.length > 0);

    return await generateStructuredFeedWithAI(meaningfulTasks, recentHistory);
};

const generateStructuredFeedWithAI = async (meaningfulTasks, recentHistory) => {
    if (!genAI) return [];
    const model = genAI.getGenerativeModel({ model: CHAT_MODEL });

    const promptText = `Eres el Brain Core de Brainstudio. Tu misión es cruzar tareas activas con la memoria de la agencia.

    TAREAS CRÍTICAS Y SU CONTEXTO SEMÁNTICO:
    ${JSON.stringify(meaningfulTasks.map(t => ({
        title: t.task.title,
        client: t.task.client?.name,
        isPriority: t.task.isPriority,
        isSpecial: t.task.isSpecial,
        context: t.context.map(c => ({ id: c.id, content: c.content }))
    })))}

    HISTORIAL RECIENTE DE MEMORIA:
    ${JSON.stringify(recentHistory.map(h => ({ id: h.id, content: h.content, client: h.client?.name })))}

    REGLAS DE GENERACIÓN:
    1. Si hay un conflicto o instrucción específica (ej: "Alexander odia el rojo") que aplique a una tarea activa de Alexander, genera una ALERTA (severity: critical). Estas deben ir primero.
    2. Si hay patrones en el historial que sugieran una mejor forma de hacer las cosas, genera una RECOMENDACIÓN (severity: warning).
    3. Si es solo información relevante, usa INSIGHT o HISTORIAL (severity: info).

    Devuelve un array JSON de objetos:
    { "id": "uuid", "contextId": "id del AgencyContext original", "type": "ALERTA/INSIGHT/RECOMENDACIÓN/HISTORIAL", "title": "Título corto y directo", "content": "Cuerpo conciso", "severity": "critical/warning/info", "timestamp": "ISO Date" }`;

    try {
        const result = await model.generateContent(promptText);
        const responseText = result.response.text();
        return JSON.parse(responseText.replace(/```json|```/g, ''));
    } catch (e) {
        console.error("[BrainCoreService] Feed generation failed:", e);
        return [];
    }
};

/**
 * Updates memory entry.
 */
export const updateAgencyContext = async (id, content) => {
    const embedding = await generateEmbedding(content);
    if (!embedding) throw new Error("Error recalculando vectores.");

    await prisma.agencyContext.update({
        where: { id },
        data: { content }
    });

    await prisma.$executeRawUnsafe(
        `UPDATE "AgencyContext" SET "vectorEmbeddings" = $1::vector WHERE id = $2`,
        `[${embedding.join(',')}]`,
        id
    );
};

/**
 * Deletes memory entry.
 */
export const deleteAgencyContext = async (id) => {
    return await prisma.agencyContext.delete({ where: { id } });
};

/**
 * Gets total data points count.
 */
export const getMemoryStats = async () => {
    const count = await prisma.agencyContext.count();
    return { count };
};

/**
 * Synthesizes a response to a natural language question using available memory and Google Workspace tools.
 */
export const askBrainCore = async (question, clientId = null) => {
    if (!genAI) return { content: "Brain Core fuera de línea." };

    // Define Workspace Tools
    const tools = [
        {
            functionDeclarations: [
                {
                    name: "read_google_sheet",
                    description: "Lee datos en tiempo real de una hoja de cálculo de Google. Úsalo cuando el usuario pregunte por métricas, inventarios o datos estructurados que no están en la memoria vectorial.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            spreadsheetId: { type: "STRING", description: "El ID del Google Sheet" },
                            range: { type: "STRING", description: "Rango opcional (Ej: 'Sheet1!A1:Z50')" }
                        },
                        required: ["spreadsheetId"]
                    }
                },
                {
                    name: "get_recent_emails",
                    description: "Busca correos electrónicos recientes para obtener contexto sobre acuerdos o feedback de clientes.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            maxResults: { type: "NUMBER", description: "Número de correos a traer" },
                            query: { type: "STRING", description: "Query de búsqueda opcional" }
                        }
                    }
                }
            ]
        }
    ];

    // Fetch available Google Workspace sources
    const sources = await prisma.agencyIntegration.findMany({
        where: { isActive: true, externalId: { not: null } }
    });

    // Search semantic context (Vector Memory)
    const context = await searchContext(question, clientId, 10);
    const approvedContext = context.filter(c => c.similarity > 0.65);

    const model = genAI.getGenerativeModel({
        model: CHAT_MODEL,
        tools
    });

    const chat = model.startChat();
    const promptText = `Pregunta del Usuario: "${question}"

    FUENTES DE DATOS DISPONIBLES (Google Workspace):
    ${sources.map(s => `- [${s.type}] ${s.alias} (ID: ${s.externalId})`).join('\n')}

    Contexto recuperado de la memoria vectorial:
    ${approvedContext.map(c => `- ${c.content}`).join('\n')}

    Instrucciones:
    1. Si necesitas datos frescos de Sheets o Gmail para responder con precisión, usa las herramientas disponibles.
    2. Si el contexto ya tiene la respuesta, úsalo.
    3. Responde de forma ejecutiva y profesional.`;

    try {
        let result = await chat.sendMessage(promptText);
        let response = result.response;

        // Handle Function Calling
        const calls = response.functionCalls();
        if (calls && calls.length > 0) {
            const call = calls[0];
            let toolResult;

            if (call.name === 'read_google_sheet') {
                toolResult = await readGoogleSheet(call.args.spreadsheetId, call.args.range);
            } else if (call.name === 'get_recent_emails') {
                toolResult = await getRecentEmails(call.args.maxResults || 5, call.args.query || 'is:unread', DEFAULT_IMPERSONATED_EMAIL);
            }

            // Send tool result back to model
            const finalResult = await chat.sendMessage([{
                functionResponse: {
                    name: call.name,
                    response: { content: toolResult }
                }
            }]);

            return {
                content: finalResult.response.text(),
                sources: approvedContext.map(c => ({ id: c.id, content: c.content }))
            };
        }

        return {
            content: response.text(),
            sources: approvedContext.map(c => ({ id: c.id, content: c.content }))
        };
    } catch (e) {
        console.error("[BrainCoreService] Question failed:", e);
        return { content: "Error procesando la consulta semántica o de Workspace." };
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

    if (!genAI) return null;
    const model = genAI.getGenerativeModel({ model: CHAT_MODEL });
    const promptText = `Analiza estas notas de la agencia sobre un cliente específico y construye su 'Ficha Mental'.
    Notas: ${contexts.map(c => c.content).join('\n')}

    Devuelve JSON:
    { "preferences": [], "dislikes": [], "approvals": [], "sentiment": "Evolución del sentimiento" }`;

    try {
        const result = await model.generateContent(promptText);
        const responseText = result.response.text();
        return JSON.parse(responseText.replace(/```json|```/g, ''));
    } catch (e) {
        console.error("[BrainCoreService] Radar generation failed:", e);
        return null;
    }
};
