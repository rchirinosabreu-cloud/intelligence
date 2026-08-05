import express from 'express';
import multer from 'multer';
import prisma from '../../lib/prisma.js';
import { GoogleGenAI } from '@google/genai';
import { uploadClientFile, getSignedUrl, getClientFileStream } from '../../services/storageService.js';
import { parseJsonResponse, extractModelText } from '../../services/aiService.js';
import {
    extractMetricsWithGemini,
    generateNarrativeWithAIProvider,
    generatePublishableNarrative,
    validateAndCleanSourceExtraction,
    mergeSourceMetricsIntoAccumulator,
    finalizeNormalizedMetrics,
    preserveApprovedReportData,
    reconcileNarrativeSections,
    buildNarrativeFailureUpdate
} from '../../services/reportVisionService.js';
import { v4 as uuidv4 } from 'uuid';
import { buildScopedReportData, normalizeAdsTableRows, orderReportSections } from '../../lib/reportStructure.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const REPORT_PIPELINE_VERSION = 'vision-2026-08-03.4';
const REPORT_DEPLOY_COMMIT = process.env.REPORT_DEPLOY_COMMIT || 'development';

export { buildNarrativeFailureUpdate };
export const narrativeFailureRouteContract = { status: 'REVIEW', narrative: { generationMode: 'NARRATIVE_FAILED' } };

export function getReportPipelineStatus() {
    return {
        pipelineVersion: REPORT_PIPELINE_VERSION,
        commit: REPORT_DEPLOY_COMMIT,
        legacyFilterGuard: typeof globalThis.filterTopContentRows === 'function'
    };
}

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

router.get('/pipeline-status', (_req, res) => {
    res.json(getReportPipelineStatus());
});

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
        const currency = /^[A-Z]{3}$/.test(req.body.currency || '') ? req.body.currency : 'COP';
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

                const sourceIndex = file.fieldname === 'organic' ? organicData.length + 1 : adsData.length + 1;
                const imageData = {
                    sourceId: `${file.fieldname}-${sourceIndex}`,
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

        const promptText = buildReportExtractionPrompt({
            clientName: client.name,
            currency,
            organicSources: organicData.map(({ sourceId, originalname }) => ({ sourceId, filename: originalname })),
            adsSources: adsData.map(({ sourceId, originalname }) => ({ sourceId, filename: originalname }))
        });

        const result = await genAI.models.generateContent({
            model: MODEL_NAME,
            contents: [{
                role: 'user',
                parts: [
                    { text: promptText },
                    ...imageParts
                ]
            }],
            config: buildReportGenerationConfig()
        });

        const rawText = extractModelText(result);
        const reportData = parseAndValidateReportExtraction(rawText, { currency });

        // 4. Preserve source traceability with stable IDs instead of array positions
        const buildProxyUrl = (gcsPath) => `/api/reports/image-proxy?path=${encodeURIComponent(gcsPath)}`;

        const imageUrls = {
            organic: Object.fromEntries(organicData.map((source) => [source.sourceId, buildProxyUrl(source.gcsPath)])),
            ads: Object.fromEntries(adsData.map((source) => [source.sourceId, buildProxyUrl(source.gcsPath)]))
        };
        const analysis = toLegacyReportAnalysis(reportData, imageUrls);

        res.json({
            client: {
                name: client.name,
                logoUrl: updatedLogoUrl
            },
            transparencyLog,
            sourcesAudit,
            reportData,
            analysis
        });

    } catch (error) {
        console.error('[Reports API] Fatal Error:', error);
        res.status(500).json({ error: 'Internal Server Error during analysis' });
    }
});


router.post('/extract-metrics', upload.any(), async (req, res) => {
    const requestId = uuidv4();
    console.log(`[Reports API][ID:${requestId}] Pipeline ${REPORT_PIPELINE_VERSION}`);
    try {
        console.log(`[Reports API][ID:${requestId}] Pipeline ${REPORT_PIPELINE_VERSION}`);
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

        // Process files in parallel with Promise.allSettled
        const filePromises = files.map(async (file) => {
            const sourceId = uuidv4();

            // 1. Upload to GCS
            const uploadResult = await uploadClientFile(file, client.name);

            // 2. Vision analysis
            const extracted = await extractMetricsWithGemini(file.buffer, file.mimetype);

            // 3. Validation and cleaning by Source
            const cleaned = validateAndCleanSourceExtraction(extracted);

            return {
                sourceId,
                storagePath: uploadResult.gcsPath,
                ...cleaned,
                originalName: file.originalname
            };
        });

        const settleResults = await Promise.allSettled(filePromises);

        const successful = [];
        const partial = [];
        const failed = [];
        const allWarnings = [];

        settleResults.forEach((res, index) => {
            const originalName = files[index]?.originalname || `Captura ${index + 1}`;
            if (res.status === 'fulfilled') {
                const val = res.value;
                if (val.usable) {
                    successful.push(val);
                    if (val.warnings && val.warnings.length > 0) {
                        allWarnings.push(...val.warnings);
                    }
                } else {
                    partial.push({
                        originalName: val.originalName || originalName,
                        reason: "Información extraída no contiene datos utilizables o métricas reconocibles.",
                        ...val
                    });
                    allWarnings.push(`Archivo parcial (${originalName}): No se detectaron métricas ni audiencias.`);
                }
            } else {
                const err = res.reason || {};
                console.error(`[Reports API][ID:${requestId}] Source failed (${originalName}):`, err.message || String(err));
                failed.push({
                    originalName,
                    error: err.message || String(err)
                });
                allWarnings.push(`Fallo en lectura (${originalName}): ${err.message || String(err)}`);
            }
        });

        const processingSummary = {
            totalFiles: files.length,
            successfulFiles: successful.length,
            partialFiles: partial.length,
            failedFiles: failed.length
        };

        // Responder con estado HTTP 422 única y exclusivamente si ninguna imagen del lote aportó información utilizable
        if (successful.length === 0) {
            return res.status(422).json({
                error: 'AI response validation failed',
                details: 'Ninguna de las imágenes del lote proporcionó datos utilizables (métricas, gráficos o audiencias).',
                processingSummary,
                warnings: allWarnings,
                pipelineVersion: REPORT_PIPELINE_VERSION,
                requestId
            });
        }

        let accumulator = null;
        const processedSources = [];
        const extractedSections = [];
        const narrativeDrafts = [];

        successful.forEach((res, index) => {
            // Merge into semantic accumulator
            accumulator = mergeSourceMetricsIntoAccumulator(accumulator, res);

            // Register sections
            const hasDemographics = ['ageGender', 'cities', 'countries']
                .some(key => Array.isArray(res.demographics?.[key]) && res.demographics[key].length > 0);
            const hasSectionData = (Array.isArray(res.dataset) && res.dataset.length > 0) || hasDemographics;
            if (hasSectionData) {
                extractedSections.push({
                    sectionId: uuidv4(),
                    sourceId: res.sourceId,
                    chartType: res.chartType || 'LINE_CHART',
                    title: res.title || 'Sección',
                    sectionCategory: res.sectionCategory || 'ADS',
                    platform: res.platform || 'META_ADS',
                    dataset: res.dataset,
                    screenType: res.screenType,
                    entityLevel: res.entityLevel,
                    resultType: res.resultType,
                    period: res.period,
                    narrativeComment: ""
                });
            }

            if (res.narrativeDraft) {
                narrativeDrafts.push(`Captura ${index + 1}: ${res.narrativeDraft}`);
            }

            // Map extracted platform to valid MetricSourcePlatform enum (META_ADS/ORGANIC_RRSS)
            let dbPlatform = 'META_ADS';
            if (res.sectionCategory === 'ORGANIC' || res.platform === 'ORGANIC_RRSS' || res.platform === 'FACEBOOK' || res.platform === 'INSTAGRAM') {
                dbPlatform = 'ORGANIC_RRSS';
            }

            processedSources.push({
                sourceId: res.sourceId,
                storagePath: res.storagePath,
                platform: dbPlatform,
                screenType: res.screenType,
                extractionData: {
                    metrics: res.metrics,
                    chartType: res.chartType,
                    title: res.title,
                    sectionCategory: res.sectionCategory,
                    platform: res.platform,
                    dataset: res.dataset,
                    demographics: res.demographics,
                    topContent: res.topContent,
                    entityLevel: res.entityLevel,
                    resultType: res.resultType,
                    period: res.period
                },
                confidence: parseFloat(res.confidence) || 1.0,
                warnings: res.warnings || []
            });
        });

        // Finalize consolidated metrics
        const validatedNormalizedMetrics = finalizeNormalizedMetrics(accumulator);

        const scopedReportData = buildScopedReportData(successful.map((source) => ({
            sourceId: source.sourceId,
            platform: source.platform,
            sectionCategory: source.sectionCategory,
            screenType: source.screenType,
            entityLevel: source.entityLevel,
            resultType: source.resultType,
            period: source.period,
            metrics: source.metrics,
            dataset: source.dataset,
            demographics: source.demographics,
            topContent: source.sectionCategory === 'ADS'
                ? normalizeAdsTableRows(source.topContent)
                : source.topContent
        })));
        validatedNormalizedMetrics.organicSummary = scopedReportData.organicSummary;
        validatedNormalizedMetrics.adsSummary = scopedReportData.adsSummary;
        validatedNormalizedMetrics.sourceExtractions = scopedReportData.sources;

        // Inject processingSummary and warnings directly into the normalizedMetrics object
        validatedNormalizedMetrics.processingSummary = processingSummary;
        validatedNormalizedMetrics.warnings = allWarnings;

        const combinedNarrative = narrativeDrafts.join('\n\n') || "No hay narrativa disponible.";

        const parsedStartDate = startDate ? new Date(startDate) : new Date(new Date().setDate(1));
        const parsedEndDate = endDate ? new Date(endDate) : new Date();

        // Enforce valid enums MONTHLY and DRAFT
        const validPeriodKinds = ['MONTHLY', 'QUARTERLY'];
        const finalPeriodKind = validPeriodKinds.includes(periodKind) ? periodKind : 'MONTHLY';

        // Save DRAFT report in database under a secure transaction with no spread fields
        let report;
        try {
            report = await prisma.$transaction(async (tx) => {
                return await tx.metricReport.create({
                    data: {
                        clientId: client.id,
                        periodKind: finalPeriodKind,
                        startDate: parsedStartDate,
                        endDate: parsedEndDate,
                        status: 'DRAFT',
                        normalizedMetrics: validatedNormalizedMetrics,
                        narrative: {
                            draft: combinedNarrative,
                            final: combinedNarrative,
                            headline: "",
                            summaryPoints: [],
                            keyAchievements: combinedNarrative,
                            actionPlan: [],
                            logrosYAvances: [],
                            contenidoTopAnalisis: "",
                            oportunidadesYAprendizajes: [],
                            recomendacionesEstrategicas: []
                        },
                        sections: orderReportSections(extractedSections),
                        sources: {
                            create: processedSources
                        }
                    },
                    include: {
                        sources: true,
                        client: true
                    }
                });
            });
            console.log(`[Reports API] MetricReport created successfully with ID ${report.id}.`);
        } catch (dbError) {
            console.error(`[Reports API][ID:${requestId}] Prisma insertion failed:`, dbError.message || dbError);
            return res.status(500).json({
                error: 'Database validation or insertion error',
                message: 'Internal Database Error',
                requestId
            });
        }

        res.status(201).json({
            success: true,
            pipelineVersion: REPORT_PIPELINE_VERSION,
            report
        });

    } catch (error) {
        console.error(`[Reports API][ID:${requestId}] Error extracting metrics:`, error.message);
        if (error.isAIUnavailable) {
            return res.status(502).json({
                error: 'AI service unavailable or failed',
                details: error.message,
                requestId
            });
        } else if (error.isAIInvalidResponse || error.message.includes('validation') || error.message.includes('schema') || error.message.includes('Unexpected') || error.message.includes('Metric')) {
            return res.status(422).json({
                error: 'AI response validation failed',
                details: error.message,
                requestId
            });
        }
        res.status(500).json({
            error: 'Internal Server Error during metrics extraction',
            message: error.message,
            requestId
        });
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
        const reviewedMetrics = {};
        for (const key of ['spend', 'impressions', 'reach', 'clicks', 'ctr', 'results']) {
            const dbMetric = dbMetrics[key] || {};
            const newMetric = newMetrics[key] || {};

            // Determine if the value was manually modified from the DB value
            const dbVal = dbMetric.value !== undefined ? dbMetric.value : null;
            const newVal = newMetric.value !== undefined ? newMetric.value : null;
            const isEdited = dbVal !== newVal || dbMetric.isManuallyEdited === true;

            reviewedMetrics[key] = {
                ...dbMetric,
                ...newMetric,
                isManuallyEdited: isEdited
            };
        }
        const updatedMetrics = preserveApprovedReportData(dbMetrics, reviewedMetrics);

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

const withTimeout = (promise, ms, errorMessage = "Timeout exceeded") => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(errorMessage));
        }, ms);
    });
    return Promise.race([
        promise,
        timeoutPromise
    ]).finally(() => clearTimeout(timeoutId));
};

import { buildNarrativeErrorLog } from '../../lib/reportPresentation.js';

const NARRATIVE_GENERATION_TIMEOUT_MS = 180000;

router.post('/:reportId/generate-narrative', async (req, res) => {
    const timeoutContext = { cancelled: false };
    try {
        const { reportId } = req.params;

        const report = await prisma.metricReport.findUnique({
            where: { id: reportId },
            include: { client: { select: { name: true } } }
        });

        if (!report) {
            return res.status(404).json({ error: "Metric report not found" });
        }

        const metrics = report.normalizedMetrics || {};
        const sections = report.sections || [];

        console.log(`[Reports API] Generating narrative for report ${reportId}...`);

        let publishableResult;
        try {
            publishableResult = await withTimeout(
                generatePublishableNarrative(metrics, sections, report.client.name, {
                    generateFullNarrative: generateNarrativeWithAIProvider
                }, timeoutContext),
                NARRATIVE_GENERATION_TIMEOUT_MS,
                "AI narrative generation timed out"
            );
        } catch (generationError) {
            timeoutContext.cancelled = true;
            if (/Missing GEMINI_API_KEY/i.test(generationError?.message || '')) throw generationError;

            const loggedError = buildNarrativeErrorLog(generationError, null, { step: 'withTimeout', reportId, isFatal: false });
            console.error('[Reports API] Narrative generation did not produce publishable content:', loggedError);

            publishableResult = {
                status: 'REVIEW',
                publishable: false,
                narrative: null,
                attempts: [{ step: 'fatal', error: generationError.message }]
            };
        }

        const narrativeResult = publishableResult.narrative;
        const updateData = publishableResult.publishable ? {
            narrative: {
                headline: narrativeResult.headline,
                summaryPoints: narrativeResult.summaryPoints,
                keyAchievements: narrativeResult.keyAchievements,
                actionPlan: narrativeResult.actionPlan,
                logrosYAvances: narrativeResult.logrosYAvances || [],
                contenidoTopAnalisis: narrativeResult.contenidoTopAnalisis || "",
                oportunidadesYAprendizajes: narrativeResult.oportunidadesYAprendizajes || [],
                recomendacionesEstrategicas: narrativeResult.recomendacionesEstrategicas || [],
                granularNarratives: narrativeResult.granularNarratives || [],
                generationMode: 'AI',
                needsRegeneration: false,
                attempts: publishableResult.attempts || []
            },
            sections: reconcileNarrativeSections(sections, narrativeResult.sections || []),
            status: 'PUBLISHED'
        } : buildNarrativeFailureUpdate(publishableResult.attempts || [], publishableResult.technicalDraft);

        const updatedReport = await prisma.metricReport.update({
            where: { id: reportId },
            data: updateData,
            include: {
                sources: true,
                client: true
            }
        });

        res.status(200).json({
            success: Boolean(publishableResult.publishable),
            needsRegeneration: !publishableResult.publishable,
            report: updatedReport
        });

    } catch (error) {
        console.error('[Reports API] Fatal Error in narrative endpoint:', error);
        res.status(500).json({
            error: "NARRATIVE_GENERATION_FAILED",
            message: error.message || 'Fallo general en la generación de narrativa'
        });
    }
});

export default router;
