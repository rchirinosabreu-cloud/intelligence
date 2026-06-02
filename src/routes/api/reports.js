import express from 'express';
import multer from 'multer';
import prisma from '../../lib/prisma.js';
import { GoogleGenAI } from '@google/genai';
import { uploadClientFile, getSignedUrl, getClientFileStream } from '../../services/storageService.js';

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
        const { path } = req.query;
        if (!path) return res.status(400).send("Path is required");

        // Basic Security: Ensure the path is not a traversal attempt
        if (path.includes('..') || path.startsWith('/') || path.includes(':')) {
            return res.status(403).send("Invalid path");
        }

        const stream = getClientFileStream(path);

        // Determine content type based on extension
        const ext = path.split('.').pop().toLowerCase();
        const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

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

        // 2. Upload images to GCS and get Signed URLs
        const organicImages = [];
        const adsImages = [];
        const sourcesAudit = [];

        for (const file of files) {
            if (file.fieldname === 'logo') continue;

            try {
                const uploadResult = await uploadClientFile(file, client.name);
                const signedUrl = await getSignedUrl(uploadResult.gcsPath, 120); // 2 hours

                const imageData = {
                    originalname: file.originalname,
                    url: signedUrl,
                    mimeType: file.mimetype,
                    buffer: file.buffer
                };

                if (file.fieldname === 'organic') {
                    organicImages.push(imageData);
                    sourcesAudit.push({
                        name: file.originalname,
                        status: "Cargada (RRSS)",
                        type: "Organic",
                        gcsPath: uploadResult.gcsPath
                    });
                } else if (file.fieldname === 'ads') {
                    adsImages.push(imageData);
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

        const transparencyLog = `Análisis multimodal basado en ${organicImages.length + adsImages.length} imágenes procesadas con IA.`;

        // 3. Multimodal AI Analysis
        if (!genAI) {
            return res.status(500).json({ error: 'AI Service not available' });
        }

        // Prepare contents for Gemini
        const imageParts = [];

        // Add Organic images
        organicImages.forEach((img) => {
            imageParts.push({
                inlineData: {
                    data: img.buffer.toString('base64'),
                    mimeType: img.mimeType
                }
            });
        });

        // Add Ads images
        adsImages.forEach((img) => {
            imageParts.push({
                inlineData: {
                    data: img.buffer.toString('base64'),
                    mimeType: img.mimeType
                }
            });
        });

        // Map GCS URLs for the AI to reference them in the JSON
        const imageUrlMap = [
            ...organicImages.map(img => ({ originalname: img.originalname, url: img.url, section: 'organic' })),
            ...adsImages.map(img => ({ originalname: img.originalname, url: img.url, section: 'ads' }))
        ];

        const promptText = `Analiza los siguientes pantallazos de métricas para el cliente ${client.name}.

        IMPORTANTE: Aquí tienes la lista de URLs firmadas de las imágenes que acabas de recibir. DEBES usar EXACTAMENTE estas URLs en tu respuesta JSON para mapear cada análisis con su imagen correspondiente.

        LISTA DE URLs DISPONIBLES:
        ${JSON.stringify(imageUrlMap.map(img => ({ name: img.originalname, url: img.url })))}

        TU MISIÓN:
        1. Identifica visualmente qué imagen corresponde a cada sección (Avance, Radiografía, Resumen, Macro, Micro).
        2. Para cada sección, extrae los datos clave y redacta un análisis ejecutivo con un tono 100% OPTIMISTA, COMERCIAL y VISUAL.
        3. SIEMPRE debes incluir la 'imagen_url' correspondiente de la LISTA DE URLs DISPONIBLES arriba. NO inventes URLs ni uses paths relativos.

        REGLAS DE TONO Y ESTILO:
        - Sé SINTÉTICO y DIRECTO. Los textos narrativos deben ser breves (máximo 3-4 líneas por sección) para asegurar la eficiencia del reporte.
        - Prohibido usar palabras como "caída", "pérdida", "mal rendimiento".
        - Si algo bajó, es una "estabilización" o "ventana de oportunidad estratégica".
        - Todo debe transmitir progreso y dirección.

        SECCIONES REQUERIDAS (Si hay imágenes de RRSS):
        - organic.avance: Métricas generales (alcance, interacciones, seguidores).
        - organic.radiografia: Datos de público (edades, ubicaciones).
        - organic.resumen: Mejores posts y formatos.

        SECCIONES REQUERIDAS (Si hay imágenes de ADS):
        - performance.macro: Resultados generales de campaña, gasto, impresiones, CPC.
        - performance.micro: Desglose por anuncios específicos y su rendimiento.

        HOJA DE RUTA: 3 pasos estratégicos a seguir.

        Devuelve un JSON con esta estructura exacta:
        {
          "organic": {
             "avance": { "imagen_url": "URL_DE_LA_LISTA", "texto_analisis": "..." },
             "radiografia": { "imagen_url": "URL_DE_LA_LISTA", "texto_analisis": "..." },
             "resumen": { "imagen_url": "URL_DE_LA_LISTA", "texto_analisis": "..." }
          },
          "performance": {
             "macro": { "imagen_url": "URL_DE_LA_LISTA", "texto_analisis": "..." },
             "micro": { "imagen_url": "URL_DE_LA_LISTA", "texto_analisis": "..." }
          },
          "hoja_de_ruta": [
             { "step": 1, "title": "...", "description": "..." },
             { "step": 2, "title": "...", "description": "..." },
             { "step": 3, "title": "...", "description": "..." }
          ]
        }`;

        const result = await genAI.models.generateContent({
            model: MODEL_NAME,
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

        if (!result || !result.text) {
            console.error("[Reports API] Raw AI Result Error:", JSON.stringify(result, null, 2));
            throw new Error("La IA no devolvió un formato de texto válido.");
        }

        const responseText = result.text;
        let analysis;
        try {
            analysis = JSON.parse(responseText);
        } catch (parseError) {
            console.error("[Reports API] JSON Parse Error. Raw Text:", responseText);
            // Fallback: try to find JSON block if AI added markdown wrappers despite the config
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                analysis = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("No se pudo parsear el JSON de la IA.");
            }
        }

        // Transform Signed URLs to local Proxy URLs in the final analysis JSON
        const transformToProxy = (url) => {
            const match = imageUrlMap.find(m => m.url === url);
            if (match) {
                const pathMatch = sourcesAudit.find(s => s.name === match.originalname);
                if (pathMatch?.gcsPath) {
                    return `/api/reports/image-proxy?path=${encodeURIComponent(pathMatch.gcsPath)}`;
                }
            }
            return url;
        };

        if (analysis.organic) {
            if (analysis.organic.avance) analysis.organic.avance.imagen_url = transformToProxy(analysis.organic.avance.imagen_url);
            if (analysis.organic.radiografia) analysis.organic.radiografia.imagen_url = transformToProxy(analysis.organic.radiografia.imagen_url);
            if (analysis.organic.resumen) analysis.organic.resumen.imagen_url = transformToProxy(analysis.organic.resumen.imagen_url);
        }
        if (analysis.performance) {
            if (analysis.performance.macro) analysis.performance.macro.imagen_url = transformToProxy(analysis.performance.macro.imagen_url);
            if (analysis.performance.micro) analysis.performance.micro.imagen_url = transformToProxy(analysis.performance.micro.imagen_url);
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
