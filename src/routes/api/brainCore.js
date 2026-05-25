import express from 'express';
import multer from 'multer';
import { VertexAI } from '@google-cloud/vertexai';
import { addAgencyContext, performAdvancedExtraction, getIntelligenceFeed, getClientProfileFromMemory, searchContext, updateAgencyContext, deleteAgencyContext, getMemoryStats, askBrainCore } from '../../services/brainCoreService.js';
import { getRecentEmails, readGoogleSheet, DEFAULT_IMPERSONATED_EMAIL } from '../../services/googleWorkspaceService.js';
import prisma from '../../lib/prisma.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const restrictAccess = (req, res, next) => {
    const allowedEmails = ['chrodny@gmail.com', 'fvilladigital@gmail.com'];
    if (!req.user || !allowedEmails.includes(req.user.email)) {
        return res.status(403).json({ error: 'Acceso restringido.' });
    }
    next();
};

// 1. Context Feed (Dashboard protagonis)
router.get('/feed', restrictAccess, async (req, res) => {
    try {
        const { status } = req.query;
        const [feed, stats] = await Promise.all([
            getIntelligenceFeed(status),
            getMemoryStats()
        ]);
        res.json({ feed, stats });
    } catch (error) {
        console.error('[BrainCoreRoute] Error in /feed:', error);
        res.json([{
            id: 'error',
            type: 'HISTORIAL',
            title: "Cerebro en Mantenimiento",
            content: "El motor de inteligencia está sincronizando. Intenta de nuevo en unos segundos.",
            severity: "info",
            timestamp: new Date()
        }]);
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

        // Si es una imagen, forzamos estado PENDING para aprobación manual
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
        const emails = await getRecentEmails(15, 'is:unread', DEFAULT_IMPERSONATED_EMAIL);

        // Use Gemini to filter and categorize emails (e.g. Basecamp alerts)
        // For now, return raw to prove connectivity
        res.json({
            emails: emails.map(e => ({
                ...e,
                isBasecamp: e.from.toLowerCase().includes('basecamp') || e.subject.toLowerCase().includes('basecamp')
            }))
        });
    } catch (error) {
        console.error('[BrainCoreRoute] Workspace Insights error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 8. Client Executive Summary (Client Mode - Structured Widgets)
router.get('/client-summary/:clientId', restrictAccess, async (req, res) => {
    try {
        const { clientId } = req.params;

        // 1. Fetch Integrations and Client Data
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

        // 2. Fetch Live Sheet Data
        const sheetSource = integrations.find(i => i.type === 'SHEETS');
        let rawSheetData = [];
        if (sheetSource && sheetSource.externalId) {
            try {
                rawSheetData = await readGoogleSheet(sheetSource.externalId, 'A1:Z100');
            } catch (e) {
                console.error(`[ClientSummary] Sheet fetch failed for ${client.name}:`, e.message);
            }
        }

        // 3. Fetch Gmail Alerts (Filtering for the client using DWD)
        // Query pattern: "{clientName}" OR "Basecamp {clientName}"
        const gmailSearchQuery = `"${client.name}" OR "Basecamp ${client.name}"`;

        let rawEmails = [];
        let gmailError = null;
        try {
            rawEmails = await getRecentEmails(20, gmailSearchQuery, DEFAULT_IMPERSONATED_EMAIL);
        } catch (e) {
            console.error(`[ClientSummary] Gmail fetch failed for ${client.name}:`, e.message);
            gmailError = e.message;
        }

        // 4. Multi-Source Structured Analysis with Gemini
        const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
        const credentials = JSON.parse(credentialsJson);
        const vertexAI = new VertexAI({
            project: credentials.project_id,
            location: 'us-central1',
            googleAuthOptions: { credentials }
        });
        const model = vertexAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-3.1-pro-preview" });

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

        const result = await model.generateContent(prompt);
        const responseText = result.response.candidates[0].content.parts[0].text;

        // Clean JSON response from markdown blocks
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const structuredData = jsonMatch ? JSON.parse(jsonMatch[0]) : {
            criticalTasks: [],
            highPriority: [],
            blockers: ["Error parseando respuesta de IA"],
            aiInsight: "La inteligencia no pudo estructurar los datos."
        };

        res.json({
            ...structuredData,
            alerts: rawEmails.slice(0, 3) // Return top 3 emails for the UI widget too
        });

    } catch (error) {
        console.error('[BrainCoreRoute] Client Summary error:', error);
        res.status(500).json({ error: "Error procesando el resumen estructurado multi-fuente." });
    }
});

export default router;
