import express from 'express';
import multer from 'multer';
import prisma from '../../lib/prisma.js';
import { GoogleGenAI } from '@google/genai';
import { uploadClientFile, getSignedUrl, getClientFileStream } from '../../services/storageService.js';
import { parseJsonResponse, extractModelText } from '../../services/aiService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize AI
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.5-flash";

let genAI;
try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
        genAI = new GoogleGenAI({ apiKey });
        console.log("[Reports API] Google Generative AI initialized.");
    } else {
        console.warn("[Reports API] GEMINI_API_KEY is missing.");
    }
} catch (e) {
    console.error("[Reports API] Failed to initialize AI client:", e);
}

router.get('/image-proxy', async (req, res) => {
    try {
        const { path: rawPath } = req.query;
        console.log(`[Reports Proxy] Incoming Path: ${rawPath}`);

        if (!rawPath) return res.status(400).send("Path is required");

        // 1. Full decoding first to handle %2F and other encoded chars correctly
        const decodedPath = decodeURIComponent(rawPath);
        console.log(`[Reports Proxy] Fully Decoded Path: ${decodedPath}`);

        // 2. Strict Security Check on decoded path
        if (decodedPath.includes('..') || decodedPath.startsWith('/') || decodedPath.includes(':')) {
            console.warn(`[Reports Proxy] Blocked potentially malicious path: ${decodedPath}`);
            return res.status(403).send("Invalid path");
        }

        // Use standard service to get stream
        const stream = getClientFileStream(decodedPath);

        // Use extension as fallback or add a metadata helper to storageService if needed.
        // For now, we trust extension or default to jpeg.
        const ext = decodedPath.split('.').pop().toLowerCase();
        const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        // Critical for html2canvas / PDF export from frontend
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

        stream.on('error', (err) => {
            console.error(`[Reports Proxy] Stream Error for ${decodedPath}:`, err.message);
            if (!res.headersSent) res.status(404).send("Image not found");
        });

        stream.pipe(res);
    } catch (error) {
        console.error("[Reports API] Proxy error:", error);
        res.status(500).send("Error loading image");
    }
});

router.post('/generate', upload.any(), async (req, res) => {
    try {
        const { clientId } = req.body;
        if (!clientId) {
            return res.status(400).json({ error: 'Client ID is required' });
        }

        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const files = req.files || [];

        // 1. Handle Logo Upload
        let updatedLogoUrl = client.logoUrl;
        const logoFile = files.find(f => f.fieldname === 'logo');

        if (logoFile) {
            try {
                const uploadResult = await uploadClientFile(logoFile, client.name);
                updatedLogoUrl = `${process.env.API_BASE_URL || ''}/api/clients/${client.id}/logo-image?gcsPath=${encodeURIComponent(uploadResult.gcsPath)}`;

                await prisma.client.update({
                    where: { id: clientId },
                    data: { logoUrl: updatedLogoUrl }
                });
            } catch (uploadError) {
                console.error('[Reports API] Logo upload failed:', uploadError);
            }
        }

        // 2. Upload images to GCS and collect paths in sequence
        const organicData = [];
        const adsData = [];
        const sourcesAudit = [];

        // Important: req.files contains files in the order they were sent
        for (const file of files) {
            if (file.fieldname === 'logo') continue;

            try {
                const uploadResult = await uploadClientFile(file, client.name);

                const imageData = {
                    originalname: file.originalname,
                    gcsPath: uploadResult.gcsPath,
                    mimeType: file.mimetype,
                    buffer: file.buffer
                };

                if (file.fieldname === 'organic') {
                    organicData.push(imageData);
                    sourcesAudit.push({
                        name: file.originalname,
                        status: "Cargada (RRSS)",
                        type: "Organic",
                        gcsPath: uploadResult.gcsPath
                    });
                } else if (file.fieldname === 'ads') {
                    adsData.push(imageData);
                    sourcesAudit.push({
                        name: file.originalname,
                        status: "Cargada (ADS)",
                        type: "Ads",
                        gcsPath: uploadResult.gcsPath
                    });
                }
            } catch (uploadError) {
                console.error(`[Reports API] File upload failed for ${file.originalname}:`, uploadError);
                sourcesAudit.push({ name: file.originalname, status: "Error de carga", type: "Desconocido" });
            }
        }

        const transparencyLog = `Análisis multimodal basado en ${organicData.length + adsData.length} imágenes procesadas con IA.`;

        // 3. Multimodal AI Analysis
        if (!genAI) {
            return res.status(500).json({ error: 'AI Service not available' });
        }

        // Prepare prompt and image parts
        // We send all images in sequence: first all Organic, then all Ads.
        const imageParts = [];
        organicData.forEach(img => imageParts.push({ inlineData: { data: img.buffer.toString('base64'), mimeType: img.mimeType } }));
        adsData.forEach(img => imageParts.push({ inlineData: { data: img.buffer.toString('base64'), mimeType: img.mimeType } }));

        const promptText = `Analiza los siguientes pantallazos de métricas para el cliente ${client.name}.

        INSTRUCCIONES DE PROCESAMIENTO:
        1. Recibirás una serie de imágenes en este orden:
           - Primero: ${organicData.length} imágenes de Redes Sociales (Orgánico).
           - Segundo: ${adsData.length} imágenes de Meta Ads (Pauta).

        2. TU OBJETIVO:
           - Por cada imagen de Redes Sociales, genera un bloque de análisis detallado. Identifica si es Avance General, Radiografía del Público o Resumen de Contenido.
           - Por cada imagen de Meta Ads, genera un bloque de análisis detallado. Identifica si es Rendimiento Macro o Desglose Micro.

           REGLA DE TONO OBLIGATORIA (OPTIMISMO RADICAL):
           - Está ESTRICTAMENTE PROHIBIDO usar palabras negativas o alarmistas: "caída", "pérdida", "mal rendimiento", "bajo", "negativo", "disminución", "problema".
           - Si una métrica bajó, redáctalo como una "estabilización necesaria para el siguiente salto", "fase de consolidación" o una "ventana de oportunidad estratégica para optimizar".
           - El informe siempre debe transmitir progreso, dirección y confianza comercial.
           - Los textos deben ser breves y directos (máximo 4 líneas).

        3. ESTRUCTURA DE RESPUESTA:
           - Devuelve un array 'organic_analysis' con exactamente ${organicData.length} objetos.
           - Devuelve un array 'performance_analysis' con exactamente ${adsData.length} objetos.
           - Devuelve un array 'hoja_de_ruta' con 3 pasos estratégicos finales.

        IMPORTANTE: NO intentes generar URLs de imágenes. El backend se encargará de eso basándose en el orden de tus arrays.

        Devuelve este JSON exacto:
        {
          "organic_analysis": [
             { "tipo": "AVANCE/RADIOGRAFIA/RESUMEN", "texto_analisis": "..." }
          ],
          "performance_analysis": [
             { "tipo": "MACRO/MICRO", "texto_analisis": "..." }
          ],
          "hoja_de_ruta": [
             { "step": 1, "title": "...", "description": "..." }
          ]
        }`;

        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const result = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    { text: promptText },
                    ...imageParts
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                maxOutputTokens: 8192,
                temperature: 0.1
            }
        });

        const rawText = extractModelText(result);
        const analysis = parseJsonResponse(rawText);

        // 4. Manual Assembly: Stitch GCS Paths to AI Text by Index
        const buildProxyUrl = (gcsPath) => `/api/reports/image-proxy?path=${encodeURIComponent(gcsPath)}`;

        if (Array.isArray(analysis.organic_analysis)) {
            analysis.organic_analysis.forEach((block, idx) => {
                if (organicData[idx]) {
                    block.imagen_url = buildProxyUrl(organicData[idx].gcsPath);
                }
            });
        }

        if (Array.isArray(analysis.performance_analysis)) {
            analysis.performance_analysis.forEach((block, idx) => {
                if (adsData[idx]) {
                    block.imagen_url = buildProxyUrl(adsData[idx].gcsPath);
                }
            });
        }

        res.json({
            client: {
                name: client.name,
                logoUrl: updatedLogoUrl
            },
            transparencyLog,
            sourcesAudit,
            analysis
        });

    } catch (error) {
        console.error('[Reports API] Fatal Error:', error);
        res.status(500).json({ error: 'Internal Server Error during analysis' });
    }
});

export default router;
