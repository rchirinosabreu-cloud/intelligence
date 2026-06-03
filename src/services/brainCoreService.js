import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { readGoogleSheet, getRecentEmails, readGoogleSlides, DEFAULT_IMPERSONATED_EMAIL } from './googleWorkspaceService.js';
import { triageEmailsWithAI } from './emailTriageService.js';

dotenv.config();

const EMBEDDING_MODEL = "gemini-embedding-2";
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

let genAI;
try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
        genAI = new GoogleGenAI({ apiKey });
        console.log("[BrainCoreService] Google Generative AI initialized with API Key.");
    } else {
        console.warn("[BrainCoreService] GEMINI_API_KEY is missing.");
    }
} catch (e) {
    console.error("[BrainCoreService] Failed to initialize Google Generative AI client:", e);
}

/**
 * Generates embeddings for a given text.
 */
export const generateEmbedding = async (text) => {
    if (!genAI) return null;
    try {
        const response = await genAI.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: [{ parts: [{ text }] }],
        });

        const embeddingValues = response?.embedding?.values || response?.embeddings?.[0]?.values;

        if (!embeddingValues) {
            console.error("⚠️ Alerta BrainCore: Estructura de embedding no reconocida:", response);
            return new Array(3072).fill(0);
        }

        return embeddingValues;
    } catch (error) {
        console.error("[BrainCoreService] Embedding generation failed:", error.message);
        return new Array(3072).fill(0);
    }
};

/**
 * Performs OCR and extraction using Gemini.
 */
export const performAdvancedExtraction = async (imageBuffer, mimeType) => {
    if (!genAI) return null;
    try {
        const promptText = `Analiza esta captura de pantalla de WhatsApp u otra imagen de la agencia.
        Detecta el sentimiento, extrae preferencias del cliente, lo que odia, lo que aprueba y cualquier instrucción crítica.
        TU OBJETIVO es generar una propuesta de memoria concisa y accionable.
        Responde en formato JSON:
        { "content": "Resumen ejecutivo de la instrucción (Ej: Alexander prefiere entregas los jueves)", "insights": { "preferences": [], "dislikes": [], "approvals": [], "sentiment": "" } }`;

        const imagePart = { inlineData: { data: imageBuffer.toString('base64'), mimeType } };

        const result = await genAI.models.generateContent({
            model: CHAT_MODEL,
            contents: [{ role: 'user', parts: [{ text: promptText }, imagePart] }],
            config: {
                generationConfig: { responseMimeType: 'application/json' }
            }
        });
        console.log("================ DEPURACIÓN IA RAW (Extraction) ================", JSON.stringify(result, null, 2));

        const responseText = result.text;

        if (!responseText) throw new Error("Empty response from AI");

        try {
            return JSON.parse(responseText.replace(/```json|```/g, ''));
        } catch (parseError) {
            console.warn("⚠️ Alerta BrainCore (Extraction): La IA devolvió texto no estructurado. Reintentando limpieza.");
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : { content: responseText, insights: {} };
        }
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

    const context = await prisma.agencyContext.create({
        data: {
            content,
            type,
            clientId,
            metadata,
            status
        }
    });

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
 * Generates the categorized Intelligence Feed with v2.5 Predictive Analysis.
 */
export const getIntelligenceFeed = async (statusFilter = 'APPROVED') => {
    try {
        // 1. Fetch High Impact Data for Prediction
        const now = new Date();
        const fourDaysAgo = new Date(now.getTime() - (4 * 24 * 60 * 60 * 1000));

        const [activeTasks, recentHistory, overdueTasks, recentEmails] = await Promise.all([
            prisma.task.findMany({
                where: { status: { in: ['PENDIENTE', 'EN_CURSO'] } },
                take: 30,
                include: { client: true, assignee: true },
                orderBy: [{ dueDate: 'asc' }, { isSpecial: 'desc' }]
            }),
            prisma.agencyContext.findMany({
                where: { status: statusFilter || 'APPROVED' },
                take: 15,
                orderBy: { createdAt: 'desc' },
                include: { client: true }
            }),
            prisma.task.findMany({
                where: {
                    status: { in: ['PENDIENTE', 'EN_CURSO'] },
                    dueDate: { lt: fourDaysAgo }
                },
                include: { client: true, assignee: true }
            }),
            getRecentEmails(20, 'is:unread newer_than:2d', DEFAULT_IMPERSONATED_EMAIL)
        ]);

        // 2. Perform Triaged Email Analysis
        const triagedEmails = await triageEmailsWithAI(recentEmails, genAI);

        // 3. Predictive Operational Analysis
        const predictions = await generateOperationalPredictions(activeTasks, overdueTasks, triagedEmails);

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

        const tasksWithContext = await Promise.all(activeTasks.map(async (task) => {
            const context = await searchContext(`${task.title} ${task.comments || ''}`, task.clientId, 3);
            const approvedContext = context.filter(c => c.similarity > 0.7 && (c.status === 'APPROVED' || !c.status));
            return { task, context: approvedContext };
        }));

        const meaningfulTasks = tasksWithContext.filter(p => p.context.length > 0);

        const structuredFeed = await generateStructuredFeedWithAI(meaningfulTasks, recentHistory, predictions);

        // Merge triaged emails into the feed if they are relevant (HIGH priority or BASECAMP)
        const emailCards = triagedEmails.filter(e => e.triage.priority === 'HIGH' || e.triage.category === 'BASECAMP').map(e => ({
            id: e.id,
            type: e.triage.category,
            title: e.subject,
            content: e.triage.summary,
            severity: e.triage.priority === 'HIGH' ? 'critical' : 'warning',
            timestamp: e.date,
            metadata: {
                intent: e.triage.intent,
                actionItems: e.triage.actionItems,
                actionLink: e.triage.actionLink,
                friction: e.triage.frictionDetected
            }
        }));

        return [...predictions, ...emailCards, ...structuredFeed].sort((a, b) => {
            const severityMap = { critical: 3, warning: 2, info: 1 };
            return (severityMap[b.severity] || 0) - (severityMap[a.severity] || 0);
        });

    } catch (err) {
        console.error('[BrainCoreService] Error generating feed:', err);
        return [];
    }
};

/**
 * Algorithm to detect bottleneck risks and generate pro-active alerts.
 */
const generateOperationalPredictions = async (activeTasks, overdueTasks, triagedEmails) => {
    if (!genAI) return [];

    const criticalChanges = triagedEmails.filter(e =>
        e.triage.intent?.toLowerCase().includes('cambio') ||
        e.triage.frictionDetected
    );

    if (overdueTasks.length === 0 && criticalChanges.length === 0) return [];

    const promptText = `Analiza los siguientes riesgos operativos de la agencia Brainstudio y genera ALERTAS PREDICTIVAS.

    TAREAS MUY VENCIDAS (+4 días):
    ${JSON.stringify(overdueTasks.map(t => ({ title: t.title, assignee: t.assignee?.name, client: t.client?.name })))}

    CAMBIOS CRÍTICOS SOLICITADOS POR CLIENTE:
    ${JSON.stringify(criticalChanges.map(e => ({ subject: e.subject, summary: e.triage.summary, intent: e.triage.intent })))}

    TU OBJETIVO:
    1. Detectar si un colaborador con tareas vencidas ha recibido un cambio crítico de última hora.
    2. Calcular el riesgo de retraso en la publicación de la Parrilla.
    3. Sugerir una acción correctiva inteligente (ej. reasignación).

    Devuelve un array JSON de objetos:
    { "id": "pred_uuid", "type": "AMENAZA", "title": "Título de riesgo", "content": "Análisis y sugerencia", "severity": "critical", "timestamp": "ISO Date" }`;

    try {
        const result = await genAI.models.generateContent({
            model: CHAT_MODEL,
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
            config: {
                generationConfig: { responseMimeType: 'application/json' }
            }
        });

        return JSON.parse(result.text || "[]");
    } catch (e) {
        console.error("[BrainCoreService] Prediction failed:", e);
        return [];
    }
};

const generateStructuredFeedWithAI = async (meaningfulTasks, recentHistory, predictions) => {
    if (!genAI) return [];

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
    1. Si hay un conflicto o instrucción específica (ej: "Alexander odia el rojo") que aplique a una tarea activa de Alexander, genera una ALERTA (severity: critical).
    2. Si hay patrones en el historial que sugieran una mejor forma de hacer las cosas, genera una RECOMENDACIÓN (severity: warning).
    3. Si es solo información relevante, usa INSIGHT o HISTORIAL (severity: info).

    Devuelve un array JSON de objetos:
    { "id": "uuid", "contextId": "id del AgencyContext original", "type": "ALERTA/INSIGHT/RECOMENDACIÓN/HISTORIAL", "title": "Título corto y directo", "content": "Cuerpo conciso", "severity": "critical/warning/info", "timestamp": "ISO Date" }`;

    try {
        const result = await genAI.models.generateContent({
            model: CHAT_MODEL,
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
            config: {
                generationConfig: { responseMimeType: 'application/json' }
            }
        });

        const responseText = result.text;
        if (!responseText) return [];

        try {
            return JSON.parse(responseText.replace(/```json|```/g, ''));
        } catch (parseError) {
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        }
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

    const sources = await prisma.agencyIntegration.findMany({
        where: { isActive: true, externalId: { not: null } }
    });

    const context = await searchContext(question, clientId, 10);
    const approvedContext = context.filter(c => c.similarity > 0.65);

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
        let result = await genAI.models.generateContent({
            model: CHAT_MODEL,
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
            config: {
                tools: [
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
                ]
            }
        });

        const calls = result.functionCalls;
        if (calls && calls.length > 0) {
            const call = calls[0];
            let toolResult;

            if (call.name === 'read_google_sheet') {
                toolResult = await readGoogleSheet(call.args.spreadsheetId, call.args.range);
            } else if (call.name === 'get_recent_emails') {
                toolResult = await getRecentEmails(call.args.maxResults || 5, call.args.query || 'is:unread', DEFAULT_IMPERSONATED_EMAIL);
            }

            const finalResult = await genAI.models.generateContent({
                model: CHAT_MODEL,
                contents: [
                    { role: 'user', parts: [{ text: promptText }] },
                    { role: 'model', parts: [{ functionCall: call }] },
                    {
                        role: 'user',
                        parts: [{
                            functionResponse: {
                                name: call.name,
                                response: { content: toolResult }
                            }
                        }]
                    }
                ]
            });

            return {
                content: finalResult.text,
                sources: approvedContext.map(c => ({ id: c.id, content: c.content }))
            };
        }

        return {
            content: result.text,
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
    const promptText = `Analiza estas notas de la agencia sobre un cliente específico y construye su 'Ficha Mental'.
    Notas: ${contexts.map(c => c.content).join('\n')}

    Devuelve JSON:
    { "preferences": [], "dislikes": [], "approvals": [], "sentiment": "Evolución del sentimiento" }`;

    try {
        const result = await genAI.models.generateContent({
            model: CHAT_MODEL,
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
            config: {
                generationConfig: { responseMimeType: 'application/json' }
            }
        });

        const responseText = result.text;
        if (!responseText) return null;

        try {
            return JSON.parse(responseText.replace(/```json|```/g, ''));
        } catch (parseError) {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        }
    } catch (e) {
        console.error("[BrainCoreService] Radar generation failed:", e);
        return null;
    }
};
