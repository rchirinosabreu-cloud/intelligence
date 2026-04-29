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

        // 2. Parse Multiple Files
        const parseFiles = (files) => {
            if (!files || files.length === 0) return [];
            return files.map(file => {
                const workbook = XLSX.read(file.buffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                return {
                    fileName: file.originalname,
                    data: XLSX.utils.sheet_to_json(worksheet)
                };
            });
        };

        const organicFilesData = parseFiles(req.files['organic']);
        const adsFilesData = parseFiles(req.files['ads']);

        if (organicFilesData.length === 0 && adsFilesData.length === 0) {
            return res.status(400).json({ error: 'At least one data file is required' });
        }

        // 3. AI Analysis with Gemini 2.5 Pro
        if (!vertexAI) {
            return res.status(500).json({ error: 'AI Service not available' });
        }

        const model = vertexAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: {
                role: "system",
                parts: [{ text: `Eres el Director Estratégico de Brainstudio. Analiza estos datos de marketing consolidados de múltiples fuentes.
Tu objetivo es redactar un reporte "Deep Analysis" que resalte el valor de la agencia.

Reglas:
1. Consolidación: Suma métricas globales, pero también compara el rendimiento entre fuentes (archivos).
2. Tono: Profesional, analítico y optimista. Habla de "oportunidades de optimización".
3. Visualización: Devuélveme un JSON estructurado para alimentar widgets de KPI, tablas de comparación y gráficas.

ESTRUCTURA JSON OBLIGATORIA:
{
  "narrative": "Análisis profundo...",
  "kpis": [
    { "label": "Alcance Total", "value": "120K", "trend": "+12%" },
    { "label": "Interacciones", "value": "5.4K", "trend": "+5%" }
  ],
  "topPerformers": [
    { "source": "Instagram_Oct.csv", "metric": "Engagement", "value": "4.2%" },
    { "source": "Facebook_Ads.xlsx", "metric": "ROAS", "value": "3.5x" }
  ],
  "metrics": {
    "organic": {
      "followers": [{ "date": "...", "value": 0 }],
      "interactions": [{ "date": "...", "value": 0 }],
      "distributionBySource": [{ "name": "Source A", "value": 100 }]
    },
    "ads": {
      "funnel": [{ "stage": "...", "value": 0 }],
      "distributionBySource": [{ "name": "Campaign A", "value": 500 }]
    }
  },
  "keyTakeaways": ["Punto 1", "Punto 2"],
  "nextSteps": "Estrategia para el próximo mes..."
}` }]
            },
            generationConfig: {
                responseMimeType: "application/json"
            }
        });

        const prompt = `Analiza los siguientes datos consolidados para el cliente ${client.name}.
Hay ${organicFilesData.length} fuentes orgánicas y ${adsFilesData.length} fuentes de pauta.

DATOS ORGÁNICOS (MULTI-FUENTE):
${JSON.stringify(organicFilesData)}

DATOS DE PAUTA (MULTI-FUENTE):
${JSON.stringify(adsFilesData)}`;

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
        console.error('[Reports API] Error generating multi-file report:', error);
        res.status(500).json({ error: 'Failed to generate report', details: error.message });
    }
});

export default router;
