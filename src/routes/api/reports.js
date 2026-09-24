import { governedFetch as fetch } from '../../services/aiEgress.js';
import express from 'express';
import multer from 'multer';
import prisma from '../../lib/prisma.js';
import { uploadClientFile, getSignedUrl, getClientFileStream } from '../../services/storageService.js';
import {
    extractMetricsWithOpenAI,
    generateNarrativeWithAIProvider,
    generatePublishableNarrative,
    validateAndCleanSourceExtraction,
    preserveApprovedReportData,
    reconcileNarrativeSections,
    buildNarrativeFailureUpdate
} from '../../services/reportVisionService.js';
import { v4 as uuidv4 } from 'uuid';
import { createEvidenceExtractionHandler, createEvidenceWorkflowHandlers, REPORT_EVIDENCE_PIPELINE_VERSION } from './reportEvidenceRoutes.js';
import { buildMetricReportHtml, renderMetricReportPdf } from '../../services/metricReportPdf.js';
import { sanitizeNarrativeForReport } from '../../lib/reportPresentation.js';
import { isSafeStoragePath } from '../../config/security.js';
import {
    buildReportExtractionPrompt,
    parseAndValidateReportExtraction,
    toLegacyReportAnalysis
} from '../../services/reportExtractionService.js';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 15 }
});
const REPORT_PIPELINE_VERSION = REPORT_EVIDENCE_PIPELINE_VERSION;
const REPORT_DEPLOY_COMMIT = process.env.REPORT_DEPLOY_COMMIT || process.env.RAILWAY_GIT_COMMIT_SHA || 'development';

export { buildNarrativeFailureUpdate };
export const narrativeFailureRouteContract = { status: 'REVIEW', narrative: { generationMode: 'NARRATIVE_FAILED' } };

export function getReportPipelineStatus() {
    return {
        pipelineVersion: REPORT_PIPELINE_VERSION,
        commit: REPORT_DEPLOY_COMMIT
    };
}

console.log('[Reports API] OpenAI report pipeline initialized.');

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
        if (!isSafeStoragePath(decodedPath)) {
            console.warn(`[Reports Proxy] Blocked potentially malicious path: ${decodedPath}`);
            return res.status(403).send("Invalid path");
        }

        const registeredSource = await prisma.metricReportSource.findFirst({
            where: { storagePath: decodedPath },
            select: { id: true }
        });
        if (!registeredSource) return res.status(404).send("Image not found");

        // Use standard service to get stream
        const stream = getClientFileStream(decodedPath);

        // Use extension as fallback or add a metadata helper to storageService if needed.
        // For now, we trust extension or default to jpeg.
        const ext = decodedPath.split('.').pop().toLowerCase();
        const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'private, max-age=300');

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

        const promptText = buildReportExtractionPrompt({
            clientName: client.name,
            currency,
            organicSources: organicData.map(({ sourceId, originalname }) => ({ sourceId, filename: originalname })),
            adsSources: adsData.map(({ sourceId, originalname }) => ({ sourceId, filename: originalname }))
        });

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'OpenAI service not configured' });

        const imageParts = [...organicData, ...adsData].map(img => ({
            type: 'input_image',
            image_url: `data:${img.mimeType};base64,${img.buffer.toString('base64')}`,
            detail: 'high'
        }));
        const aiResponse = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': 'BrainStudioIntelligence/2.0'
            },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL || 'gpt-5',
                instructions: 'Extrae datos visuales con precisión. No inventes valores y devuelve solo JSON válido.',
                input: [{ role: 'user', content: [{ type: 'input_text', text: promptText }, ...imageParts] }],
                text: { format: { type: 'json_object' } },
                max_output_tokens: 16384
            })
        });
        const responsePayload = await aiResponse.json();
        if (!aiResponse.ok) throw new Error(`OpenAI report analysis failed (${aiResponse.status})`);
        const rawText = responsePayload.output_text || (responsePayload.output || [])
            .flatMap(item => item.content || [])
            .map(item => item.text || '')
            .join('');
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


router.post('/extract-metrics', upload.any(), createEvidenceExtractionHandler({
    prisma, uploadClientFile, extractMetrics: extractMetricsWithOpenAI,
    cleanExtraction: validateAndCleanSourceExtraction
}));

const evidenceHandlers = createEvidenceWorkflowHandlers({
    prisma, buildHtml: buildMetricReportHtml, renderPdf: renderMetricReportPdf
});
router.get('/', evidenceHandlers.list);
router.get('/:reportId', evidenceHandlers.get);
router.patch('/:reportId/observations', evidenceHandlers.review);
router.post('/:reportId/analyze', evidenceHandlers.analyze);
router.post('/:reportId/publish', evidenceHandlers.publish);
router.post('/:reportId/reopen', evidenceHandlers.reopen);
router.get('/:reportId/preview', evidenceHandlers.preview);
router.get('/:reportId/pdf', evidenceHandlers.pdf);

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
        if (dbMetrics.schemaVersion === 2) return res.status(409).json({ error: 'Usa la revisión por observaciones para actualizar este informe.' });
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

const NARRATIVE_GENERATION_TIMEOUT_MS = 270000;

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
        if (metrics.schemaVersion === 2) return res.status(409).json({ error: 'Usa el análisis con referencias para este informe.' });
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
            if (/Missing OPENAI_API_KEY/i.test(generationError?.message || '')) throw generationError;

            const loggedError = buildNarrativeErrorLog(generationError, null, { step: 'withTimeout', reportId, isFatal: false });
            console.error('[Reports API] Narrative generation did not produce publishable content:', loggedError);

            publishableResult = {
                status: 'REVIEW',
                publishable: false,
                narrative: null,
                attempts: [{ step: 'fatal', error: generationError.message }]
            };
        }

        const narrativeResult = sanitizeNarrativeForReport(publishableResult.narrative);
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
