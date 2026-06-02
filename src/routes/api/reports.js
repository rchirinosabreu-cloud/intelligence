import express from 'express';
import multer from 'multer';
import prisma from '../../lib/prisma.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { uploadClientFile, getSignedUrl } from '../../services/storageService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize AI
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.5-flash";

let genAI;
try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
        genAI = new GoogleGenerativeAI(apiKey);
        console.log("[Reports API] Google Generative AI initialized.");
    } else {
        console.warn("[Reports API] GEMINI_API_KEY is missing.");
    }
} catch (e) {
    console.error("[Reports API] Failed to initialize AI client:", e);
}

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
                    sourcesAudit.push({ name: file.originalname, status: "Cargada (RRSS)", type: "Organic" });
                } else if (file.fieldname === 'ads') {
                    adsImages.push(imageData);
                    sourcesAudit.push({ name: file.originalname, status: "Cargada (ADS)", type: "Ads" });
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

        Tienes a tu disposición una lista de URLs de imágenes cargadas que corresponden a los pantallazos enviados (en el mismo orden):
        ${JSON.stringify(imageUrlMap.map(img => ({ name: img.originalname, url: img.url })))}

        TU MISIÓN:
        1. Identifica qué imagen corresponde a cada sección.
        2. Para cada sección, extrae los datos clave y redacta un análisis ejecutivo con un tono 100% OPTIMISTA, COMERCIAL y VISUAL.
        3. SIEMPRE debes incluir la 'imagen_url' correspondiente de la lista proporcionada.

        REGLAS DE TONO:
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
                responseMimeType: "application/json"
            }
        });

        const responseText = result.response.text();
        const analysis = JSON.parse(responseText);

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
