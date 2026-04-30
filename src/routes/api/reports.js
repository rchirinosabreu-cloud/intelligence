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

        // 1. Handle Logo Upload
        const files = req.files || [];
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

        // 2. Dynamic Detection and Parsing
        const organicRawData = [];
        const adsRawData = [];
        const sourcesAudit = [];

        for (const file of files) {
            if (file.fieldname === 'logo') continue;

            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            if (json.length === 0) {
                sourcesAudit.push({ name: file.originalname, status: "Archivo vacío", type: "Desconocido" });
                continue;
            }

            const headers = Object.keys(json[0]);

            // Detection logic based on mandatory headers (Huella Digital)
            const isAds = headers.includes("Importe gastado (COP)") && headers.includes("Resultados");
            const isOrganic = headers.includes("Me gusta") && headers.includes("Alcance") && headers.includes("Impresiones");

            if (isAds) {
                // Ads Logic: Use total row if "Nombre del conjunto de anuncios" OR "Nombre de la campaña" is empty/null, otherwise sum individuals
                const totalRow = json.find(row =>
                    (!row["Nombre del conjunto de anuncios"] || String(row["Nombre del conjunto de anuncios"]).trim() === "") &&
                    (!row["Nombre de la campaña"] || String(row["Nombre de la campaña"]).trim() === "") &&
                    row["Importe gastado (COP)"]
                );

                let processedRows = 0;
                if (totalRow) {
                    adsRawData.push(totalRow);
                    processedRows = 1;
                } else {
                    const individualRows = json.filter(row => row["Nombre del conjunto de anuncios"] || row["Nombre de la campaña"]);
                    adsRawData.push(...individualRows);
                    processedRows = individualRows.length;
                }
                sourcesAudit.push({
                    name: file.originalname,
                    status: `Detectado archivo de Pauta (${processedRows} filas procesadas)`,
                    type: "Ads"
                });
            } else if (isOrganic) {
                organicRawData.push(...json);
                sourcesAudit.push({
                    name: file.originalname,
                    status: `Detectado archivo Orgánico (${json.length} filas procesadas)`,
                    type: "Organic"
                });
            } else {
                sourcesAudit.push({
                    name: file.originalname,
                    status: "Archivo no compatible (Huella digital no detectada)",
                    type: "Desconocido"
                });
            }
        }

        const adsCount = sourcesAudit.filter(s => s.type === "Ads").length;
        const organicCount = sourcesAudit.filter(s => s.type === "Organic").length;
        const transparencyLog = `Análisis basado en ${organicCount + adsCount} archivos detectados: ${organicCount} de Redes y ${adsCount} de Ads. Procesando datos reales...`;

        // Pre-processing totals for the widgets
        const summary = {
            organic: {
                impressions: organicRawData.reduce((acc, row) => acc + (Number(row.Impresiones || row.Impressions || 0)), 0),
                interactions: organicRawData.reduce((acc, row) => acc + (Number(row.Interacciones || row.Engagement || row.Interactions || row["Me gusta"] || 0)), 0),
                followersGrowth: organicRawData.reduce((acc, row) => acc + (Number(row.Seguidores || row.Followers || 0)), 0),
                totalReach: organicRawData.reduce((acc, row) => acc + (Number(row.Alcance || row.Reach || 0)), 0)
            },
            ads: {
                investment: adsRawData.reduce((acc, row) => acc + (Number(row["Importe gastado (COP)"] || row.Spend || row.Inversión || row.Amount || 0)), 0),
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
4. Respuesta: Devuelve SIEMPRE un JSON válido. Si el dato no está en los archivos, reporta 0 y menciona que el archivo no contenía esa métrica. Queda terminantemente PROHIBIDO inventar cifras.

ESTRUCTURA JSON:
{
  "organic": {
    "widgets": [
      { "label": "Impresiones", "value": 0 },
      { "label": "Interacciones", "value": 0 },
      { "label": "Nuevos seguidores", "value": 0 },
      { "label": "Alcance total", "value": 0 }
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
      { "label": "Inversión", "value": 0 },
      { "label": "Conversiones", "value": 0 },
      { "label": "Impresiones", "value": 0 },
      { "label": "Alcance", "value": 0 }
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
        Asegura que el campo 'hoja_de_ruta' contenga exactamente 3 pasos.
        IMPORTANTE: En la sección 'widgets', los valores deben ser NÚMEROS PUROS sin símbolos de moneda ni separadores de miles.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const analysis = JSON.parse(response.candidates[0].content.parts[0].text);

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
