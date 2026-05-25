import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import prisma from '../../lib/prisma.js';
import { GoogleGenAI } from '@google/genai';
import { uploadClientFile } from '../../services/storageService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize AI
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.0-flash";

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
        let detectedAccountName = '';

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
            const isAds = headers.includes("Importe gastado (COP)");
            const isOrganic = headers.includes("Me gusta") || headers.includes("Reacciones");

            if (isAds) {
                // Try to extract account name
                if (!detectedAccountName) {
                    detectedAccountName = json.find(row => row["Nombre de la cuenta"])?.["Nombre de la cuenta"];
                }

                // Ads Logic:
                // STEP A: Buscar la fila donde "Nombre del conjunto de anuncios" esté vacío.
                const totalRow = json.find(row =>
                    (!row["Nombre del conjunto de anuncios"] || String(row["Nombre del conjunto de anuncios"]).trim() === "") &&
                    row["Importe gastado (COP)"]
                );

                let processedRows = 0;
                if (totalRow) {
                    adsRawData.push(totalRow);
                    processedRows = 1;
                } else {
                    // STEP B (Fallback): suma todos los valores de la columna
                    adsRawData.push(...json);
                    processedRows = json.length;
                }
                sourcesAudit.push({
                    name: file.originalname,
                    status: `Detectado archivo de Pauta (${processedRows} filas procesadas)`,
                    type: "Ads"
                });
            } else if (isOrganic) {
                // Try to extract account name
                if (!detectedAccountName) {
                    detectedAccountName = json.find(row => row["Nombre de la página"])?.["Nombre de la página"];
                }

                // SUMAR TODO el 100% de las filas
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
                visualizations: organicRawData.reduce((acc, row) => acc + (Number(row.Visualizaciones || row.Reproducciones || row.Impresiones || 0)), 0),
                interactions: organicRawData.reduce((acc, row) => {
                    // IG: ("Me gusta" + "Comentarios" + "Veces que se compartió" + "Veces que se guardó")
                    if (row["Me gusta"] !== undefined) {
                        return acc + (
                            Number(row["Me gusta"] || 0) +
                            Number(row.Comentarios || 0) +
                            Number(row["Veces que se compartió"] || 0) +
                            Number(row["Veces que se guardó"] || 0)
                        );
                    }
                    // FB: ("Reacciones, comentarios y veces que se compartió" + "Total de clics")
                    if (row["Reacciones"] !== undefined || row["Reacciones, comentarios y veces que se compartió"] !== undefined) {
                        return acc + (
                            Number(row["Reacciones, comentarios y veces que se compartió"] || 0) +
                            Number(row["Total de clics"] || 0)
                        );
                    }
                    return acc;
                }, 0),
                followersGrowth: organicRawData.reduce((acc, row) => acc + (Number(row.Seguidores || row["Seguidores netos"] || 0)), 0),
                totalReach: organicRawData.reduce((acc, row) => acc + (Number(row.Alcance || 0)), 0)
            },
            ads: {
                investment: adsRawData.reduce((acc, row) => acc + (Number(row["Importe gastado (COP)"] || 0)), 0),
                conversions: adsRawData.reduce((acc, row) => acc + (Number(row.Resultados || 0)), 0),
                impressions: adsRawData.reduce((acc, row) => acc + (Number(row.Impresiones || 0)), 0),
                totalReach: adsRawData.reduce((acc, row) => acc + (Number(row.Alcance || 0)), 0)
            }
        };

        // 3. AI Analysis
        if (!genAI) {
            return res.status(500).json({ error: 'AI Service not available' });
        }

        const prompt = `Analiza para ${client.name}:
        Orgánico: ${JSON.stringify(summary.organic)}
        Ads: ${JSON.stringify(summary.ads)}
        Sample: ${JSON.stringify(organicRawData.slice(0, 30))}
        Asegura que el campo 'hoja_de_ruta' contenga exactamente 3 pasos.
        IMPORTANTE: En la sección 'widgets', los valores deben ser NÚMEROS PUROS sin símbolos de moneda ni separadores de miles.`;

        const result = await genAI.models.generateContent({
            model: MODEL_NAME,
            systemInstruction: `Eres el Director Estratégico de Brainstudio. Genera un "Reporte de desempeño digital" estable y profesional.

REGLAS DE ESTABILIDAD Y CONTENIDO:
1. Títulos RAE: Solo mayúscula inicial. Sin negritas ni cursivas en encabezados.
2. Contenido top: Analiza exactamente 5 piezas con métricas y un comentario estratégico de 2-3 líneas cada una.
3. Hoja de ruta: Genera un plan de 3 pasos equilibrado y obligatorio.
4. Respuesta: Devuelve SIEMPRE un JSON válido. Si el dato no está en los archivos, reporta 0 y menciona que el archivo no contenía esa métrica. Queda terminantemente PROHIBIDO inventar cifras.
5. Profundidad: El análisis de "analysis" debe ser extenso (mínimo 3 párrafos para pauta), buscando patrones específicos (ej. "Los miércoles hay más visualizaciones") y enfocándose en Costo por Mil (CPM) y la relación entre Inversión y Alcance (eficiencia del gasto).
6. Aprendizajes: La sección "oportunidades_aprendizaje" en Orgánico debe contener al menos 4 puntos clave robustos.
7. Prohibición: No mencionar "Conversiones" en ninguna parte del análisis de Performance Digital. Queda terminantemente PROHIBIDO usar la palabra "Conversiones".
8. Gráficas: El campo 'accumulatedArea' DEBE ser un array de al menos 7 puntos de datos que representen la evolución temporal (fechas) del Alcance e Impresiones, agrupando o sumando por fecha si es necesario para mostrar una tendencia clara.

ESTRUCTURA JSON:
{
  "organic": {
    "widgets": [
      { "label": "Alcance total", "value": 0 },
      { "label": "Nuevos seguidores", "value": 0 },
      { "label": "Visualizaciones", "value": 0 },
      { "label": "Interacciones", "value": 0 }
    ],
    "analysis": "Análisis profundo de patrones y tendencias...",
    "oportunidades_aprendizaje": [
      { "type": "Aprendizaje", "text": "..." },
      { "type": "Oportunidad", "text": "..." },
      { "type": "Aprendizaje", "text": "..." },
      { "type": "Oportunidad", "text": "..." }
    ],
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
      { "label": "Impresiones", "value": 0 },
      { "label": "Alcance", "value": 0 }
    ],
    "analysis": "Análisis profundo de rendimiento, visibilidad, CPM y eficiencia de gasto (Inversión vs Alcance) (mínimo 3 párrafos). NO USAR LA PALABRA CONVERSIONES. Centrarse en Alcance e Impresiones.",
    "charts": {
      "accumulatedArea": [{ "date": "...", "reach": 0, "impressions": 0 }]
    }
  },
  "hoja_de_ruta": [
    { "step": "1", "title": "...", "description": "..." },
    { "step": "2", "title": "...", "description": "..." },
    { "step": "3", "title": "...", "description": "..." }
  ]
}`,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json"
            }
        });
        const analysis = JSON.parse(result.response?.text);

        res.json({
            client: {
                name: detectedAccountName || client.name,
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
