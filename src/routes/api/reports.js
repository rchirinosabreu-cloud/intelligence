import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import prisma from '../../lib/prisma.js';
import { VertexAI } from '@google-cloud/vertexai';
import { uploadClientFile } from '../../services/storageService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Vertex AI
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'brainstudio-intelligence';
const LOCATION = 'global';
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-pro";

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
    console.error("[Reports API] Failed to initialize Vertex AI client:", e);
}

router.post('/generate', upload.fields([
    { name: 'organic', maxCount: 10 },
    { name: 'ads', maxCount: 10 },
    { name: 'logo', maxCount: 1 }
]), async (req, res) => {
    try {
        const { clientId } = req.body;
        if (!clientId) {
            return res.status(400).json({ error: 'Client ID is required' });
        }

        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        // 1. Handle Logo Upload
        let updatedLogoUrl = client.logoUrl;
        if (req.files['logo']) {
            const logoFile = req.files['logo'][0];
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

        // 2. Parse and Consolidate Multiple Files
        const parseFiles = (files) => {
            if (!files || files.length === 0) return [];
            return files.flatMap(file => {
                const workbook = XLSX.read(file.buffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                return XLSX.utils.sheet_to_json(worksheet);
            });
        };

        const organicRawData = parseFiles(req.files['organic']);
        const adsRawData = parseFiles(req.files['ads']);

        // Pre-processing totals for the widgets
        const summary = {
            organic: {
                impressions: organicRawData.reduce((acc, row) => acc + (Number(row.Impresiones || row.Impressions || 0)), 0),
                interactions: organicRawData.reduce((acc, row) => acc + (Number(row.Interacciones || row.Engagement || row.Interactions || 0)), 0),
                followersGrowth: organicRawData.reduce((acc, row) => acc + (Number(row.Seguidores || row.Followers || 0)), 0),
                totalReach: organicRawData.reduce((acc, row) => acc + (Number(row.Alcance || row.Reach || 0)), 0)
            },
            ads: {
                investment: adsRawData.reduce((acc, row) => acc + (Number(row.Spend || row.Inversión || row.Amount || 0)), 0),
                conversions: adsRawData.reduce((acc, row) => acc + (Number(row.Results || row.Resultados || row.Conversions || 0)), 0),
                impressions: adsRawData.reduce((acc, row) => acc + (Number(row.Impressions || row.Impresiones || 0)), 0),
                totalReach: adsRawData.reduce((acc, row) => acc + (Number(row.Reach || row.Alcance || 0)), 0)
            }
        };

        // 3. AI Analysis with Gemini 2.5 Pro
        if (!vertexAI) {
            return res.status(500).json({ error: 'AI Service not available' });
        }

        const model = vertexAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: {
                role: "system",
                parts: [{ text: `Eres el Director Estratégico de Brainstudio. Genera un "Reporte de desempeño digital" estable y profesional.

REGLAS DE ESTABILIDAD Y CONTENIDO:
1. Títulos RAE: Solo mayúscula inicial. Sin negritas ni cursivas en encabezados.
2. Contenido top: Analiza exactamente 5 piezas con métricas y un comentario estratégico de 2-3 líneas cada una.
3. Hoja de ruta: Genera un plan de 3 pasos equilibrado y obligatorio.
4. Respuesta: Devuelve SIEMPRE un JSON válido. Si faltan datos, inventa cifras coherentes basadas en el resumen para no dejar widgets vacíos.

ESTRUCTURA JSON:
{
  "organic": {
    "widgets": [
      { "label": "Impresiones", "value": "..." },
      { "label": "Interacciones", "value": "..." },
      { "label": "Nuevos seguidores", "value": "..." },
      { "label": "Alcance total", "value": "..." }
    ],
    "analysis": "Párrafos concisos...",
    "topContent": [
      { "title": "...", "type": "...", "reach": "...", "engagement": "...", "aiComment": "..." }
    ],
    "charts": {
      "engagementDonut": [{ "name": "Reels", "value": 0 }, { "name": "Imágenes", "value": 0 }],
      "platformBar": [{ "name": "Instagram", "value": 0 }, { "name": "Facebook", "value": 0 }]
    }
  },
  "performance": {
    "widgets": [
      { "label": "Inversión", "value": "..." },
      { "label": "Conversiones", "value": "..." },
      { "label": "Impresiones", "value": "..." },
      { "label": "Alcance", "value": "..." }
    ],
    "analysis": "Análisis de rendimiento...",
    "charts": {
      "accumulatedArea": [{ "date": "...", "reach": 0, "impressions": 0 }]
    }
  },
  "hoja_de_ruta": [
    { "step": "1", "title": "...", "description": "..." },
    { "step": "2", "title": "...", "description": "..." },
    { "step": "3", "title": "...", "description": "..." }
  ]
}` }]
            },
            generationConfig: {
                responseMimeType: "application/json"
            }
        });

        const prompt = `Analiza para ${client.name}:
        Orgánico: ${JSON.stringify(summary.organic)}
        Ads: ${JSON.stringify(summary.ads)}
        Sample: ${JSON.stringify(organicRawData.slice(0, 30))}
        Asegura que el campo 'hoja_de_ruta' contenga exactamente 3 pasos.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const analysis = JSON.parse(response.candidates[0].content.parts[0].text);

        res.json({
            client: {
                name: client.name,
                logoUrl: updatedLogoUrl
            },
            analysis
        });

    } catch (error) {
        console.error('[Reports API] Fatal Error:', error);
        res.status(500).json({ error: 'Internal Server Error during analysis' });
    }
});

export default router;
