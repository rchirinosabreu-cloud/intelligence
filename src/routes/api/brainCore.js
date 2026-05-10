import express from 'express';
import multer from 'multer';
import { addAgencyContext, performOCR, searchContext, getProactiveFeed, generateEmbedding } from '../../services/brainCoreService.js';
import prisma from '../../lib/prisma.js';
import { VertexAI } from '@google-cloud/vertexai';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware for restricted access
const restrictAccess = (req, res, next) => {
    const allowedEmails = ['chrodny@gmail.com', 'fvilladigital@gmail.com'];
    if (!req.user || !allowedEmails.includes(req.user.email)) {
        return res.status(403).json({ error: 'Acceso restringido a Brain Core.' });
    }
    next();
};

// 1. Context Inbox - Add text/image context
router.post('/context', restrictAccess, upload.single('image'), async (req, res) => {
    try {
        let { content, type, metadata } = req.body;
        if (metadata && typeof metadata === 'string') metadata = JSON.parse(metadata);

        if (req.file) {
            // OCR for images
            const extractedText = await performOCR(req.file.buffer, req.file.mimetype);
            content = extractedText;
            type = 'IMAGE';
            metadata = { ...metadata, originalFileName: req.file.originalname };
        }

        if (!content) {
            return res.status(400).json({ error: 'El contenido o una imagen es requerida.' });
        }

        const record = await addAgencyContext(content, type || 'TEXT', metadata || {});
        res.status(201).json(record);
    } catch (error) {
        console.error('[BrainCoreRoute] Error in /context:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Proactive Feed
router.get('/feed', restrictAccess, async (req, res) => {
    try {
        const feed = await getProactiveFeed();
        res.json(feed);
    } catch (error) {
        console.error('[BrainCoreRoute] Error in /feed:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Brain Core Query (Semantic Search + AI Response)
router.post('/query', restrictAccess, async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: 'Consulta vacía.' });

        // Search relevant context
        const contextItems = await searchContext(query, 5);
        const contextText = contextItems.map(c => `- [${c.type}] ${c.content}`).join('\n');

        // Generate AI response
        const project = process.env.GOOGLE_CLOUD_PROJECT || 'brainstudio-intelligence';
        const location = 'us-central1';
        const vertexAI = new VertexAI({ project, location });
        const model = vertexAI.getGenerativeModel({ model: "gemini-2.5-pro" });

        const prompt = `
            Eres el Brain Core de Brainstudio. Tienes acceso a la memoria histórica de la agencia.
            Responde a la consulta del usuario basándote en el contexto proporcionado.
            Si no hay información relevante en el contexto, indícalo, pero intenta ser útil con tu conocimiento general de agencia.

            Consulta: ${query}

            Contexto Histórico Relevante:
            ${contextText}

            Responde de forma estratégica, profesional y proactiva.
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.candidates[0].content.parts[0].text;

        res.json({
            answer: responseText,
            sources: contextItems.map(c => ({ id: c.id, type: c.type, similarity: c.similarity }))
        });
    } catch (error) {
        console.error('[BrainCoreRoute] Error in /query:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
