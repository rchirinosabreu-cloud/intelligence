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
    { name: 'organic', maxCount: 1 },
    { name: 'ads', maxCount: 1 },
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

        // 1. Handle Logo Upload (if provided)
        let updatedLogoUrl = client.logoUrl;
        if (req.files['logo']) {
            const logoFile = req.files['logo'][0];
            try {
                const uploadResult = await uploadClientFile(logoFile, client.name);
                // The storage service returns a signed URL and a gcsPath.
                // Based on server.js proxy logic, we might want to store a specific format or just the URL.
                // The proxy in server.js expects 'gcsPath=' in the URL to handle it specially.
                updatedLogoUrl = `${process.env.API_BASE_URL || ''}/api/clients/${client.id}/logo-image?gcsPath=${encodeURIComponent(uploadResult.gcsPath)}`;

                await prisma.client.update({
                    where: { id: clientId },
                    data: { logoUrl: updatedLogoUrl }
                });
            } catch (uploadError) {
                console.error('[Reports API] Logo upload failed:', uploadError);
                // Non-critical, continue with report generation
            }
        }

        // 2. Parse Files
        const parseFile = (file) => {
            if (!file) return null;
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            return XLSX.utils.sheet_to_json(worksheet);
        };

        const organicData = parseFile(req.files['organic']?.[0]);
        const adsData = parseFile(req.files['ads']?.[0]);

        if (!organicData && !adsData) {
            return res.status(400).json({ error: 'At least one data file (Organic or Ads) is required' });
        }

        // 3. AI Analysis with Gemini 2.5 Pro
        if (!vertexAI) {
            return res.status(500).json({ error: 'AI Service not available' });
        }

        const model = vertexAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: {
                role: "system",
                parts: [{ text: `Eres el Director Estratégico de Brainstudio. Analiza estos datos de marketing. Tu objetivo es redactar un reporte que resalte el valor de la agencia.
Reglas:
1. Si los datos son bajos, no hables de fracaso, habla de 'oportunidades de optimización'.
2. Provee siempre una estrategia esperanzadora para el próximo mes.
3. Devuélveme el análisis narrativo y un objeto JSON con los puntos clave para las gráficas.

IMPORTANTE: Responde con un JSON que tenga esta estructura exacta:
{
  "narrative": "Tu análisis aquí...",
  "metrics": {
    "organic": {
      "followers": [{ "date": "...", "value": 0 }],
      "interactions": [{ "date": "...", "value": 0 }]
    },
    "ads": {
      "funnel": [{ "stage": "...", "value": 0 }],
      "distribution": [{ "name": "...", "value": 0 }]
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

        const prompt = `Analiza los siguientes datos para el cliente ${client.name}:

        DATOS ORGÁNICOS:
        ${JSON.stringify(organicData || "No provisto")}

        DATOS DE PAUTA (ADS):
        ${JSON.stringify(adsData || "No provisto")}`;

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
        console.error('[Reports API] Error generating report:', error);
        res.status(500).json({ error: 'Failed to generate report', details: error.message });
    }
});

export default router;
