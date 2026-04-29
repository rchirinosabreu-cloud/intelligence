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
                // Use a proper URL format that the frontend can resolve
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

        if (organicRawData.length === 0 && adsRawData.length === 0) {
            return res.status(400).json({ error: 'At least one data file is required' });
        }

        // Pre-processing for AI: Summarize key numbers to help Gemini be precise
        const summary = {
            organic: {
                totalReach: organicRawData.reduce((acc, row) => acc + (Number(row.Alcance || row.Reach || row.Impressions || 0)), 0),
                avgEngagement: (organicRawData.reduce((acc, row) => acc + (Number(row.Engagement || row.Interacciones || 0)), 0) / (organicRawData.length || 1)).toFixed(2),
                rowsCount: organicRawData.length
            },
            ads: {
                totalSpend: adsRawData.reduce((acc, row) => acc + (Number(row.Spend || row.Inversión || row.Amount || 0)), 0),
                totalResults: adsRawData.reduce((acc, row) => acc + (Number(row.Results || row.Resultados || row.Conversions || 0)), 0),
                rowsCount: adsRawData.length
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
                parts: [{ text: `Eres el Director de Estrategia Senior de Brainstudio. Tu misión es realizar una "Auditoría Estratégica" multifuente.
No te limites a resumir; debes diagnosticar éxitos y proponer una hoja de ruta ganadora.

Reglas de Análisis:
1. Resalta cifras globales imponentes (Alcance Total, Inversión Total).
2. "Top Content": Identifica las 3-5 mejores publicaciones basándote en la data.
3. Tono: Profesional, optimista y visionario. Transforma debilidades en "oportunidades de optimización".
4. Diagnóstico: Explica por qué el contenido ganador funcionó (gancho, formato, timing).

ESTRUCTURA JSON OBLIGATORIA:
{
  "narrative": "Análisis profundo y estratégico...",
  "kpis": {
    "organic": [
      { "label": "Alcance Total", "value": "120,450", "trend": "+15%" },
      { "label": "Engagement Promedio", "value": "4.2%", "trend": "+0.5%" },
      { "label": "Nuevos Seguidores", "value": "850", "trend": "+12%" }
    ],
    "ads": [
      { "label": "Inversión Total", "value": "$1,200", "trend": "Estable" },
      { "label": "Costo por Resultado", "value": "$0.45", "trend": "-10%" },
      { "label": "ROAS Estimado", "value": "4.5x", "trend": "+0.8x" }
    ]
  },
  "topContent": [
    { "title": "Reel: Beneficios de X", "metrics": "15k Views / 1.2k Likes", "whyItWorked": "El gancho inicial resolvió un problema común de la audiencia.", "link": "#" }
  ],
  "comparison": "Comparativa entre canales y campañas...",
  "roadmap": [
    { "step": "1", "action": "Acción estratégica A", "reason": "Basado en hallazgo X" },
    { "step": "2", "action": "Acción estratégica B", "reason": "Basado en hallazgo Y" },
    { "step": "3", "action": "Acción estratégica C", "reason": "Basado en hallazgo Z" }
  ],
  "charts": {
    "organicTrend": [{ "date": "...", "value": 0 }],
    "adsDistribution": [{ "name": "...", "value": 0 }]
  }
}` }]
            },
            generationConfig: {
                responseMimeType: "application/json"
            }
        });

        const prompt = `Realiza la Auditoría Estratégica para ${client.name}.

        RESUMEN MATEMÁTICO PREVIO:
        Orgánico: Alcance Total de ${summary.organic.totalReach}, Engagement Promedio de ${summary.organic.avgEngagement}.
        Pauta: Inversión Total de ${summary.ads.totalSpend}, Resultados Totales de ${summary.ads.totalResults}.

        DATOS CRUDOS PARA PROFUNDIZAR (MÉTODOS, GANCHOS, LINKS):
        ${JSON.stringify({ organic: organicRawData.slice(0, 50), ads: adsRawData.slice(0, 50) })}

        Instrucción: Usa los datos crudos para identificar el "Top Content" y dar el diagnóstico de por qué funcionaron.`;

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
        console.error('[Reports API] Error generating strategic audit:', error);
        res.status(500).json({ error: 'Failed to generate audit', details: error.message });
    }
});

export default router;
