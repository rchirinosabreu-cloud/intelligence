import express from 'express';
import multer from 'multer';
import prisma from '../../lib/prisma.js';
import { GoogleGenAI } from '@google/genai';
import { uploadClientFile, getSignedUrl, getClientFileStream } from '../../services/storageService.js';
import { parseJsonResponse, extractModelText } from '../../services/aiService.js';
import { extractMetricsWithVision, generateNarrativeWithOpenAI } from '../../services/reportVisionService.js';
import { v4 as uuidv4 } from 'uuid';

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

        const result = await genAI.models.generateContent({
            model: MODEL_NAME,
            contents: [{
                role: 'user',
                parts: [
                    { text: promptText },
                    ...imageParts
                ]
            }],
            config: {
                generationConfig: {
                    responseMimeType: "application/json",
                    maxOutputTokens: 8192,
                    temperature: 0.1
                }
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

router.post('/extract-metrics', upload.any(), async (req, res) => {
    try {
        const { clientId, periodKind, startDate, endDate } = req.body;
        if (!clientId) {
            return res.status(400).json({ error: 'Client ID is required' });
        }

        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const files = req.files || [];
        if (files.length === 0) {
            return res.status(400).json({ error: 'At least one screenshot is required' });
        }

        const processedSources = [];
        let totalSpend = 0;
        let totalImpressions = 0;
        let totalReach = 0;
        let totalClicks = 0;
        let totalResults = 0;
        let firstSourceSpendUnit = 'USD';
        const narrativeDrafts = [];

        // Process files in parallel
        const filePromises = files.map(async (file) => {
            const sourceId = uuidv4();

            // 1. Upload to GCS
            const uploadResult = await uploadClientFile(file, client.name);

            // 2. Vision analysis
            const extracted = await extractMetricsWithVision(file.buffer, file.mimetype);

            // 3. Math Validation
            const spendVal = extracted.metrics?.spend?.value;
            const impressionsVal = extracted.metrics?.impressions?.value;
            const reachVal = extracted.metrics?.reach?.value;
            const clicksVal = extracted.metrics?.clicks?.value;
            const ctrVal = extracted.metrics?.ctr?.value;
            const resultsVal = extracted.metrics?.results?.value;

            const warnings = [];
            if (typeof clicksVal === 'number' && typeof impressionsVal === 'number' && impressionsVal > 0) {
                const theoreticalCtr = (clicksVal / impressionsVal) * 100;
                if (typeof ctrVal === 'number') {
                    const diff = Math.abs(ctrVal - theoreticalCtr);
                    if (diff > 0.01) {
                        warnings.push(`Advertencia matemática: El CTR extraído (${ctrVal}%) difiere del cálculo teórico basado en clics e impresiones (${theoreticalCtr.toFixed(4)}%).`);
                    }
                }
            }

            return {
                sourceId,
                storagePath: uploadResult.gcsPath,
                platform: 'META_ADS',
                screenType: extracted.screenType || 'Desconocido',
                extractionData: extracted.metrics,
                confidence: parseFloat(extracted.confidence) || 0.0,
                warnings: warnings,
                narrativeDraft: extracted.narrativeDraft || '',
                spendVal,
                spendUnit: extracted.metrics?.spend?.unit || 'USD',
                impressionsVal,
                reachVal,
                clicksVal,
                resultsVal,
                chartType: extracted.chartType || 'LINE_CHART',
                title: extracted.title || 'Sección',
                dataset: extracted.dataset || []
            };
        });

        const results = await Promise.all(filePromises);

        const extractedSections = [];

        // Aggregate across sources
        results.forEach((res, index) => {
            if (index === 0 && res.spendUnit) {
                firstSourceSpendUnit = res.spendUnit;
            }
            if (typeof res.spendVal === 'number') totalSpend += res.spendVal;
            if (typeof res.impressionsVal === 'number') totalImpressions += res.impressionsVal;
            if (typeof res.reachVal === 'number') totalReach += res.reachVal;
            if (typeof res.clicksVal === 'number') totalClicks += res.clicksVal;
            if (typeof res.resultsVal === 'number') totalResults += res.resultsVal;

            extractedSections.push({
                sectionId: uuidv4(),
                chartType: res.chartType,
                title: res.title,
                dataset: res.dataset,
                narrativeComment: ""
            });

            if (res.narrativeDraft) {
                narrativeDrafts.push(`Captura ${index + 1}: ${res.narrativeDraft}`);
            }

            processedSources.push({
                sourceId: res.sourceId,
                storagePath: res.storagePath,
                platform: res.platform,
                screenType: res.screenType,
                extractionData: res.extractionData,
                confidence: res.confidence,
                warnings: res.warnings
            });
        });

        // Overall theoretical CTR
        let overallCtr = 0;
        if (totalImpressions > 0) {
            overallCtr = (totalClicks / totalImpressions) * 100;
        }

        const normalizedMetrics = {
            spend: { key: 'spend', label: 'Inversión Total', value: totalSpend, unit: firstSourceSpendUnit, confidence: 1.0, evidence: 'Agregado de fuentes' },
            impressions: { key: 'impressions', label: 'Impresiones Totales', value: totalImpressions, unit: 'count', confidence: 1.0, evidence: 'Agregado de fuentes' },
            reach: { key: 'reach', label: 'Alcance Total', value: totalReach, unit: 'count', confidence: 1.0, evidence: 'Agregado de fuentes' },
            clicks: { key: 'clicks', label: 'Clics Totales', value: totalClicks, unit: 'count', confidence: 1.0, evidence: 'Agregado de fuentes' },
            ctr: { key: 'ctr', label: 'CTR Promedio', value: parseFloat(overallCtr.toFixed(4)), unit: '%', confidence: 1.0, evidence: 'Cálculo agregado' },
            results: { key: 'results', label: 'Resultados Totales', value: totalResults, unit: 'count', confidence: 1.0, evidence: 'Agregado de fuentes' }
        };

        const combinedNarrative = narrativeDrafts.join('\n\n');

        const parsedStartDate = startDate ? new Date(startDate) : new Date(new Date().setDate(1));
        const parsedEndDate = endDate ? new Date(endDate) : new Date();

        // Save DRAFT report in database
        const report = await prisma.metricReport.create({
            data: {
                clientId,
                periodKind: periodKind === 'QUARTERLY' ? 'QUARTERLY' : 'MONTHLY',
                startDate: parsedStartDate,
                endDate: parsedEndDate,
                status: 'DRAFT',
                normalizedMetrics,
                narrative: {
                    draft: combinedNarrative,
                    final: combinedNarrative
                },
                sections: extractedSections,
                sources: {
                    create: processedSources
                }
            },
            include: {
                sources: true,
                client: true
            }
        });

        res.status(201).json({
            success: true,
            report
        });

    } catch (error) {
        console.error('[Reports API] Error extracting metrics:', error);
        res.status(500).json({ error: 'Internal Server Error during metrics extraction', details: error.message });
    }
});

router.patch('/:reportId/metrics', async (req, res) => {
    try {
        const { reportId } = req.params;
        const { normalizedMetrics: newMetrics } = req.body;

        if (!newMetrics) {
            return res.status(400).json({ error: "normalizedMetrics is required in payload" });
        }

        const existingReport = await prisma.metricReport.findUnique({
            where: { id: reportId }
        });

        if (!existingReport) {
            return res.status(404).json({ error: "Metric report not found" });
        }

        const dbMetrics = existingReport.normalizedMetrics || {};
        const updatedMetrics = {};

        const keys = ['spend', 'impressions', 'reach', 'clicks', 'ctr', 'results'];
        keys.forEach(key => {
            const dbMetric = dbMetrics[key] || {};
            const newMetric = newMetrics[key] || {};

            // Determine if the value was manually modified from the DB value
            const dbVal = dbMetric.value !== undefined ? dbMetric.value : null;
            const newVal = newMetric.value !== undefined ? newMetric.value : null;
            const isEdited = dbVal !== newVal || dbMetric.isManuallyEdited === true;

            updatedMetrics[key] = {
                ...dbMetric,
                ...newMetric,
                isManuallyEdited: isEdited
            };
        });

        const updatedReport = await prisma.metricReport.update({
            where: { id: reportId },
            data: {
                normalizedMetrics: updatedMetrics,
                status: 'REVIEW'
            },
            include: {
                sources: true,
                client: true
            }
        });

        res.status(200).json({
            success: true,
            report: updatedReport
        });

    } catch (error) {
        console.error('[Reports API] Error updating report metrics:', error);
        res.status(500).json({ error: 'Internal Server Error during metrics update', details: error.message });
    }
});

router.post('/:reportId/generate-narrative', async (req, res) => {
    try {
        const { reportId } = req.params;

        const report = await prisma.metricReport.findUnique({
            where: { id: reportId }
        });

        if (!report) {
            return res.status(404).json({ error: "Metric report not found" });
        }

        const metrics = report.normalizedMetrics || {};
        const sections = report.sections || [];

        console.log(`[Reports API] Generating narrative for report ${reportId}...`);
        const narrativeResult = await generateNarrativeWithOpenAI(metrics, sections);

        const updatedReport = await prisma.metricReport.update({
            where: { id: reportId },
            data: {
                narrative: {
                    headline: narrativeResult.headline,
                    summaryPoints: narrativeResult.summaryPoints,
                    keyAchievements: narrativeResult.keyAchievements,
                    actionPlan: narrativeResult.actionPlan
                },
                sections: narrativeResult.sections,
                status: 'PUBLISHED'
            },
            include: {
                sources: true,
                client: true
            }
        });

        res.status(200).json({
            success: true,
            report: updatedReport
        });

    } catch (error) {
        console.error('[Reports API] Error generating narrative:', error);
        res.status(500).json({ error: 'Internal Server Error during narrative generation', details: error.message });
    }
});

export default router;
