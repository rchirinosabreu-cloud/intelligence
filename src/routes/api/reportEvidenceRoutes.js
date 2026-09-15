import { randomUUID, createHash } from 'node:crypto';
import { buildEvidenceReport, normalizeReportObservations } from '../../lib/reportEvidence.js';
import { applyReportReview, assertReportVersion, assertEvidenceReady, validateReportPeriod, prepareReportPublication, saveReportVersion, generateEvidenceNarrative, reportWorkflowError } from '../../services/reportWorkflowService.js';

export const REPORT_EVIDENCE_PIPELINE_VERSION = 'report-evidence-2026-09-16.1';
const jsonSafe = value => JSON.parse(JSON.stringify(value));
const errorResponse = (res, error) => {
  console.error('[Reports evidence]', error.message);
  return res.status(error.status || (error.isAIUnavailable ? 502 : 500)).json({ error: error.message || 'No se pudo completar la operación del informe.' });
};

export function createEvidenceExtractionHandler({ prisma, uploadClientFile, extractMetrics, cleanExtraction }) {
  return async (req, res) => {
    try {
      const { clientId, periodKind = 'MONTHLY', startDate, endDate } = req.body || {};
      const reportPeriod = validateReportPeriod(startDate, endDate);
      if (!clientId || !['MONTHLY', 'QUARTERLY'].includes(periodKind)) throw reportWorkflowError('Selecciona cliente y tipo de período válidos.');
      const incoming = req.files || [];
      if (incoming.some(file => !['logo', 'files', 'organicFiles', 'adsFiles'].includes(file.fieldname))) throw reportWorkflowError('La carga contiene un campo de archivo desconocido.');
      const files = incoming.filter(file => file.fieldname !== 'logo');
      const logos = incoming.filter(file => file.fieldname === 'logo');
      if (!files.length || files.length > 14 || logos.length > 1) throw reportWorkflowError('Carga entre una y catorce capturas y un solo logo opcional.');
      if (logos.some(file => file.buffer.length > 1024 * 1024)) throw reportWorkflowError('El logo debe pesar como máximo 1 MB para incluirlo en el informe.');
      if (incoming.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype))) throw reportWorkflowError('Usa imágenes PNG, JPEG o WebP.');
      if (incoming.reduce((sum, file) => sum + (file.buffer?.length || 0), 0) > 100 * 1024 * 1024) throw reportWorkflowError('El lote supera los 100 MB.');
      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (!client) throw reportWorkflowError('El cliente no existe.', 404);
      const jobs = files.map(file => ({ file, sourceId: randomUUID(), contentHash: createHash('sha256').update(file.buffer).digest('hex') }));
      const results = new Array(jobs.length);
      let cursor = 0;
      // Bound model concurrency; each source keeps its own outcome and identity.
      const run = async () => {
        while (cursor < jobs.length) {
          const index = cursor++;
          const { file, sourceId, contentHash } = jobs[index];
          let storagePath;
          const declaredCategory = file.fieldname === 'adsFiles' ? 'ADS' : file.fieldname === 'organicFiles' ? 'SOCIAL' : 'UNKNOWN';
          const context = { sourceId, clientName: client.name, reportPeriod, declaredCategory, declaration: declaredCategory };
          try {
            const upload = await uploadClientFile({ ...file, originalname: `${sourceId}-${file.originalname}` }, client.name);
            storagePath = upload.gcsPath;
            const extracted = await extractMetrics(file.buffer, file.mimetype, context);
            const cleaned = cleanExtraction({ ...extracted, sourceId, originalName: file.originalname }, context);
            const observations = normalizeReportObservations(cleaned.observations?.length ? cleaned : { ...cleaned, observations: undefined }, { sourceId, reportPeriod });
            const usable = observations.some(item => item.value !== null) || cleaned.panels?.some(panel => panel.dataset?.length);
            const panels = buildEvidenceReport([{ ...cleaned, sourceId, observations }], { reportPeriod }).panels;
            results[index] = { ...cleaned, sourceId, contentHash, storagePath, originalName: file.originalname, declaredCategory, observations, panels, usable,
              outcome: usable ? 'SUCCESS' : 'PARTIAL', error: usable ? null : 'No se encontraron cifras o paneles utilizables.' };
          } catch (error) {
            console.error('[Reports evidence] Source extraction failed:', file.originalname, error.message);
            results[index] = { sourceId, contentHash, storagePath, originalName: file.originalname, declaredCategory, outcome: 'FAILED', usable: false, error: error.message || 'Lectura fallida', observations: [], panels: [] };
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, run));
      const successful = results.filter(source => source.usable);
      const sourceFailures = results.filter(source => !source.usable).map(({ sourceId, originalName, error, outcome }) => ({ sourceId, originalName, error, outcome }));
      const processingSummary = { totalFiles: files.length, successfulFiles: successful.length, partialFiles: results.filter(source => source.outcome === 'PARTIAL').length, failedFiles: results.filter(source => source.outcome === 'FAILED').length };
      if (!successful.length) return res.status(422).json({ error: 'No se obtuvo una lectura utilizable. Las capturas no se publicaron.', processingSummary, sourceFailures });
      const branding = {};
      const warnings = results.flatMap(source => source.warnings || []);
      if (logos[0]) {
        try {
          branding.logoStoragePath = (await uploadClientFile(logos[0], client.name)).gcsPath;
          branding.logoDataUrl = `data:${logos[0].mimetype};base64,${logos[0].buffer.toString('base64')}`;
        }
        catch (error) { console.error('[Reports evidence] Logo upload failed:', error.message); warnings.push('El logo no pudo guardarse. Las cifras se conservaron.'); }
      }
      const evidence = buildEvidenceReport(successful, { reportPeriod });
      const normalizedMetrics = jsonSafe({ ...evidence, version: 1, dataVersion: 1, reportPeriod, sourceExtractions: successful,
        processingSummary, sourceFailures, excludedSources: [], warnings, branding, readyForNarrative: evidence.readyForNarrative && !sourceFailures.length });
      const processedSources = results.filter(source => source.storagePath).map(source => ({
        sourceId: source.sourceId, storagePath: source.storagePath,
        platform: source.platform === 'META_ADS' || source.declaredCategory === 'ADS' ? 'META_ADS' : 'ORGANIC_RRSS',
        screenType: source.screenType || 'UNKNOWN', extractionData: jsonSafe(source),
        confidence: typeof source.confidence === 'number' && Number.isFinite(source.confidence) ? source.confidence : 0,
        warnings: source.warnings || (source.error ? [source.error] : [])
      }));
      const report = await prisma.$transaction(tx => tx.metricReport.create({
        data: { clientId, periodKind, startDate: new Date(startDate), endDate: new Date(endDate), status: 'DRAFT', normalizedMetrics,
          narrative: { generationMode: 'PENDING', needsRegeneration: true }, sections: evidence.panels, sources: { create: processedSources } },
        include: { sources: true, client: true }
      }));
      return res.status(201).json({ success: true, pipelineVersion: REPORT_EVIDENCE_PIPELINE_VERSION, report });
    } catch (error) { return errorResponse(res, error); }
  };
}

export function createEvidenceWorkflowHandlers({ prisma, generateNarrative = generateEvidenceNarrative, buildHtml, renderPdf }) {
  const read = async reportId => {
    const report = await prisma.metricReport.findUnique({ where: { id: reportId }, include: { sources: true, client: true } });
    if (!report) throw reportWorkflowError('El informe no existe.', 404);
    return report;
  };
  const wrap = handler => async (req, res) => { try { return await handler(req, res); } catch (error) { return errorResponse(res, error); } };
  return {
    get: wrap(async (req, res) => res.json({ success: true, report: await read(req.params.reportId) })),
    list: wrap(async (req, res) => {
      if (!req.query.clientId) throw reportWorkflowError('Selecciona un cliente.');
      const take = 30;
      const rows = await prisma.metricReport.findMany({ where: { clientId: req.query.clientId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1,
        ...(req.query.cursor ? { cursor: { id: req.query.cursor }, skip: 1 } : {}),
        select: { id: true, status: true, startDate: true, endDate: true, createdAt: true, updatedAt: true } });
      res.json({ reports: rows.slice(0, take), nextCursor: rows.length > take ? rows[take - 1].id : null });
    }),
    review: wrap(async (req, res) => {
      const report = await read(req.params.reportId);
      const changes = applyReportReview(report, req.body, { actorId: req.user?.id });
      const updated = await saveReportVersion(prisma, report, changes);
      return res.json({ success: true, report: updated });
    }),
    analyze: wrap(async (req, res) => {
      const report = await read(req.params.reportId);
      assertReportVersion(report, req.body?.expectedVersion);
      if (report.status === 'PUBLISHED') throw reportWorkflowError('Reabre la revisión antes de generar otro análisis.', 409);
      assertEvidenceReady(report);
      let narrative;
      try { narrative = await generateNarrative(report); }
      catch (error) {
        console.error('[Reports evidence] Narrative failed:', error.message);
        const updated = await saveReportVersion(prisma, report, { status: 'REVIEW', narrative: { ...report.narrative, generationMode: 'NARRATIVE_FAILED', needsRegeneration: true } });
        return res.status(422).json({ error: 'El análisis no pudo validarse. Las cifras se conservaron; puedes volver a intentarlo.', report: updated });
      }
      const updated = await saveReportVersion(prisma, report, { status: 'REVIEW', narrative });
      return res.json({ success: true, report: updated });
    }),
    publish: wrap(async (req, res) => {
      const report = await read(req.params.reportId);
      const changes = prepareReportPublication(report, req.body?.expectedVersion);
      changes.normalizedMetrics = { ...report.normalizedMetrics, publication: { actorId: req.user?.id || null, at: new Date().toISOString(), dataVersion: report.normalizedMetrics.dataVersion } };
      return res.json({ success: true, report: await saveReportVersion(prisma, report, changes) });
    }),
    reopen: wrap(async (req, res) => {
      const report = await read(req.params.reportId);
      assertReportVersion(report, req.body?.expectedVersion);
      if (report.status !== 'PUBLISHED') throw reportWorkflowError('El informe ya está en revisión.', 409);
      return res.json({ success: true, report: await saveReportVersion(prisma, report, { status: 'REVIEW' }) });
    }),
    preview: wrap(async (req, res) => {
      const report = await read(req.params.reportId);
      assertReportVersion(report, Number(req.query.version));
      const html = buildHtml(report, { preview: report.status !== 'PUBLISHED' });
      res.set?.('Cache-Control', 'no-store');
      return res.json({ html, version: report.normalizedMetrics.version });
    }),
    pdf: wrap(async (req, res) => {
      const report = await read(req.params.reportId);
      assertReportVersion(report, Number(req.query.version));
      const pdf = await renderPdf(report);
      const current = await read(report.id);
      if (current.normalizedMetrics.version !== report.normalizedMetrics.version || current.status !== 'PUBLISHED') throw reportWorkflowError('La versión cambió durante la exportación. Descarga nuevamente el informe vigente.', 409);
      if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString() !== '%PDF-') throw reportWorkflowError('El generador no devolvió un archivo PDF válido.', 502);
      const filename = `informe-${report.id}-${report.normalizedMetrics.dataVersion}.pdf`;
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' });
      return res.send(pdf);
    })
  };
}
