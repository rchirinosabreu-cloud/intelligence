import express from 'express';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { addAgencyContext, performAdvancedExtraction, getIntelligenceFeed, getClientProfileFromMemory, searchContext, updateAgencyContext, deleteAgencyContext, getMemoryStats, askBrainCore } from '../../services/brainCoreService.js';
import { getRecentEmails, readGoogleSheet, DEFAULT_IMPERSONATED_EMAIL } from '../../services/googleWorkspaceService.js';
import { triageEmailsWithAI, onlyBasecampEmails } from '../../services/emailTriageService.js';
import prisma from '../../lib/prisma.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const restrictAccess = (req, res, next) => {
    const allowedEmails = ['chrodny@gmail.com', 'fvilladigital@gmail.com', 'contacto@brainstudioagencia.com'];
    if (!req.user || !allowedEmails.includes(req.user.email)) {
        return res.status(403).json({ error: 'Acceso restringido.' });
    }
    next();
};

// 1. Context Feed (Dashboard protagonists) - Redesigned for v2.5 Predictive Alerts
router.get('/feed', restrictAccess, async (req, res) => {
    try {
        const { status } = req.query;
        const [feed, stats] = await Promise.all([
            getIntelligenceFeed(status),
            getMemoryStats()
        ]);

        res.json({ feed: feed || [], stats: stats || { count: 0 } });
    } catch (error) {
        console.error('[BrainCoreRoute] Error in /feed:', error);
        res.json({
            feed: [{
                id: 'error',
                type: 'HISTORIAL',
                title: "Cerebro en Mantenimiento",
                content: "El motor de inteligencia está sincronizando. Intenta de nuevo en unos segundos.",
                severity: "info",
                timestamp: new Date()
            }],
            stats: { count: 0 }
        });
    }
});

// 2. Add Context (Text or Image with Advanced Extraction)
router.post('/context', restrictAccess, upload.single('image'), async (req, res) => {
    try {
        let { content, clientId, metadata } = req.body;
        if (metadata && typeof metadata === 'string') metadata = JSON.parse(metadata);
        if (clientId === 'null' || !clientId) clientId = null;

        if (req.file) {
            const extraction = await performAdvancedExtraction(req.file.buffer, req.file.mimetype);
            if (extraction) {
                content = extraction.content;
                metadata = { ...metadata, insights: extraction.insights };
            }
        }

        if (!content) return res.status(400).json({ error: 'Contenido vacío.' });

        const status = req.file ? 'PENDING' : 'APPROVED';

        const record = await addAgencyContext(content, req.file ? 'IMAGE' : 'TEXT', clientId, metadata, status);
        res.status(201).json(record);
    } catch (error) {
        console.error('[BrainCoreRoute] Error in /context:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Update Memory
router.patch('/context/:id', restrictAccess, async (req, res) => {
    try {
        const { content, status } = req.body;
        if (content) await updateAgencyContext(req.params.id, content);
        if (status) {
            await prisma.agencyContext.update({
                where: { id: req.params.id },
                data: { status }
            });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Delete Memory
router.delete('/context/:id', restrictAccess, async (req, res) => {
    try {
        await deleteAgencyContext(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Ask Brain Core (Semantic Search)
router.get('/ask', restrictAccess, async (req, res) => {
    try {
        const { q, clientId } = req.query;
        if (!q) return res.status(400).json({ error: 'Falta la pregunta.' });
        const answer = await askBrainCore(q, clientId === 'null' ? null : clientId);
        res.json(answer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 6. Knowledge Radar (Client Profile)
router.get('/radar/:clientId', restrictAccess, async (req, res) => {
    try {
        const profile = await getClientProfileFromMemory(req.params.clientId);
        if (!profile) return res.status(404).json({ error: 'Sin conocimiento previo.' });
        res.json(profile);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. Executive Workspace (Gmail/Basecamp Insights)
router.get('/workspace/insights', restrictAccess, async (req, res) => {
    try {
        const emails = await getRecentEmails(25, 'is:unread newer_than:7d', DEFAULT_IMPERSONATED_EMAIL);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY is missing.');
        const genAI = new GoogleGenAI({ apiKey });

        const triagedEmails = await triageEmailsWithAI(emails, genAI);
        const basecampEmails = onlyBasecampEmails(triagedEmails);

        res.json({
            emails: triagedEmails.map(e => ({
                id: e.id,
                from: e.from,
                subject: e.subject,
                date: e.date,
                summary: e.triage.summary,
                priority: e.triage.priority,
                intent: e.triage.intent,
                friction: e.triage.frictionDetected
            })),
            basecampEmails: basecampEmails.map((e) => ({
                id: e.id,
                subject: e.subject,
                summary: e.triage.summary,
                priority: e.triage.priority,
                from: e.from,
                date: e.date,
                intent: e.triage.intent,
                actionItems: e.triage.actionItems || [],
                actionLink: e.triage.actionLink || null,
                friction: e.triage.frictionDetected
            }))
        });
    } catch (error) {
        console.error('[BrainCoreRoute] Workspace Insights error:', error);
        return res.status(200).json({
            emails: [],
            basecampEmails: [],
            diagnostic: { error: error.message }
        });
    }
});

// 8. Client Executive Summary (Client Mode - Structured Widgets)
router.get('/client-summary/:clientId', restrictAccess, async (req, res) => {
    try {
        const { clientId } = req.params;

        const client = await prisma.client.findUnique({
            where: { id: clientId },
            include: {
                integrationsV2: {
                    where: { isActive: true }
                }
            }
        });

        if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

        const integrations = client.integrationsV2 || [];

        const sheetSource = integrations.find(i => i.type === 'SHEETS');
        let rawSheetData = [];
        if (sheetSource && sheetSource.externalId) {
            try {
                rawSheetData = await readGoogleSheet(sheetSource.externalId, 'A1:Z100');
            } catch (e) {
                console.error(`[ClientSummary] Sheet fetch failed for ${client.name}:`, e.message);
            }
        }

        const gmailSearchQuery = `"${client.name}" OR "Basecamp ${client.name}"`;

        let rawEmails = [];
        let gmailError = null;
        try {
            rawEmails = await getRecentEmails(20, gmailSearchQuery, DEFAULT_IMPERSONATED_EMAIL);
        } catch (e) {
            console.error(`[ClientSummary] Gmail fetch failed for ${client.name}:`, e.message);
            gmailError = e.message;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is missing.");
        const genAI = new GoogleGenAI({ apiKey });
        const modelName = process.env.GEMINI_MODEL || "gemini-3.5-flash";

        const prompt = `Analiza los siguientes datos operativos para el cliente "${client.name}".
        TU OBJETIVO es sintetizar un dashboard ejecutivo de Project Management cruzando información de un Google Sheet y correos de Gmail (notificaciones de Basecamp/Alertas).

        DATOS DEL EXCEL (Hojas de Seguimiento):
        ${rawSheetData.length > 0 ? JSON.stringify(rawSheetData) : "No hay datos de Excel disponibles."}

        CORREOS RECIENTES (Contexto de conversaciones y alertas de Basecamp):
        ${rawEmails.length > 0 ? JSON.stringify(rawEmails.map(e => ({ from: e.from, subject: e.subject, snippet: e.snippet }))) : (gmailError ? `Error al leer Gmail: ${gmailError}` : "No hay correos recientes disponibles.")}

        Responde ÚNICAMENTE en formato JSON con la siguiente estructura:
        {
          "criticalTasks": ["Tarea 1", "Tarea 2"],
          "highPriority": [
            { "task": "Nombre de tarea", "deadline": "Hoy/Fecha" }
          ],
          "blockers": ["Punto de bloqueo 1", "Alerta detectada en correo"],
          "aiInsight": "Resumen estratégico corto y proactivo"
        }

        REGLAS DE CATEGORIZACIÓN:
        1. criticalTasks: Tareas del Excel marcadas como "En progreso", "Urgente" o con fecha de entrega hoy/mañana.
        2. highPriority: Entregas importantes o hitos de esta semana según el Excel.
        3. blockers:
           - Si en el Excel algo dice "Bloqueado", "Falta info", o celdas críticas vacías.
           - Si en los CORREOS detectas que el cliente está pidiendo cambios urgentes, hay quejas, o hay notificaciones de Basecamp sobre retrasos o preguntas sin responder.
        4. aiInsight: Una frase que conecte los puntos. Ej: "El cliente está esperando el carrusel para mañana (visto en Excel), pero envió un correo pidiendo ajustar el logo primero".

        IMPORTANTE: Si no hay datos suficientes para una categoría, devuelve un array vacío []. NO inventes datos.`;

        const result = await genAI.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
        });

        const responseText = result.text;

        let structuredData = {
            criticalTasks: [],
            highPriority: [],
            blockers: ["Error parseando respuesta de IA"],
            aiInsight: "La inteligencia no pudo estructurar los datos."
        };

        if (responseText) {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    structuredData = JSON.parse(jsonMatch[0]);
                } catch (parseErr) {
                    structuredData.aiInsight = responseText;
                }
            } else {
                structuredData.aiInsight = responseText;
            }
        }

        const triaged = await triageEmailsWithAI(rawEmails, genAI);
        const safeAlerts = onlyBasecampEmails(triaged).slice(0, 3);

        res.json({
            ...structuredData,
            alerts: safeAlerts.map(e => ({
                id: e.id,
                subject: e.subject,
                summary: e.triage.summary,
                priority: e.triage.priority,
                intent: e.triage.intent,
                actionLink: e.triage.actionLink,
                friction: e.triage.frictionDetected
            }))
        });

    } catch (error) {
        console.error('[BrainCoreRoute] Client Summary error:', error);
        res.status(200).json({
            criticalTasks: [],
            highPriority: [],
            blockers: ['No fue posible completar el análisis automático.'],
            aiInsight: 'No se pudo procesar el resumen estructurado con IA en este momento.',
            alerts: []
        });
    }
});

export default router;
