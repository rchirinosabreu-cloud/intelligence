import { generateAnalysisHTML, generateSummaryHTML } from '../utils/htmlExport.js';
import { formatMeetingDuration } from '../utils/meetingDuration.js';
import { renderReportPDF } from './pdfRenderer.js';

const printable = (value) => String(value ?? '')
  .replace(/[\u2013\u2014\u2212]/g, '-')
  .replace(/\u2022/g, '-')
  .replace(/\u00a0/g, ' ')
  .trim();

const asList = (value) => (Array.isArray(value) ? value : []).filter(Boolean);

const participantLabel = (participant) => {
  if (typeof participant === 'string') return printable(participant);
  return [participant?.name, participant?.role].filter(Boolean).map(printable).join(': ');
};

const summaryData = ({ minute, analysis }) => ({
  meeting_title: minute.title,
  meeting_duration: formatMeetingDuration(minute.durationSeconds),
  participants: asList(analysis.participants || minute.participants).map(participantLabel).filter(Boolean),
  meeting_topics: asList(analysis.topics),
  discussion_details: [analysis.executiveSummary || minute.executiveSummary, ...asList(analysis.risks)].filter(Boolean),
  agreements: asList(analysis.decisions),
  action_items: asList(analysis.actionItems || minute.actionItems).map((item) => ({
    task: item?.task || item?.title,
    owner: item?.owner,
    due_date: item?.dueDate,
    priority: item?.priority
  }))
});

const analysisData = ({ minute, analysis }) => ({
  meeting_duration: formatMeetingDuration(minute.durationSeconds),
  meeting_topics: asList(analysis.topics),
  consulting_insights: [analysis.executiveSummary || minute.executiveSummary, ...asList(analysis.decisions)].filter(Boolean),
  observations: asList(analysis.risks),
  opportunities: asList(analysis.opportunities),
  recommendations: asList(analysis.actionItems || minute.actionItems).map((item) => ({
    title: item?.task || item?.title || 'Acción propuesta',
    description: [
      item?.owner ? `Responsable: ${item.owner}` : null,
      item?.dueDate ? `Fecha: ${item.dueDate}` : null,
      item?.priority ? `Prioridad: ${item.priority}` : null
    ].filter(Boolean).join(' · ') || 'Acción propuesta para revisión humana.',
    priority: item?.priority
  }))
});

export const buildSummaryHtml = ({ minute, analysis }) => generateSummaryHTML(
  summaryData({ minute, analysis }),
  minute.title,
  {
    reportTitle: analysis.summaryTitle || minute.title,
    projectSubtitle: analysis.summarySubtitle || 'Síntesis ejecutiva de la reunión'
  }
);

export const buildAnalysisHtml = ({ minute, analysis }) => generateAnalysisHTML(
  analysisData({ minute, analysis }),
  minute.title,
  {
    reportTitle: analysis.analysisTitle || `Análisis - ${minute.title}`,
    projectSubtitle: analysis.analysisSubtitle || 'Lectura operativa y señales para revisión'
  }
);

const asBuffer = (value) => Buffer.isBuffer(value) ? value : Buffer.from(value);

export const buildSummaryPdf = async ({ minute, analysis, renderPdf = renderReportPDF }) => asBuffer(
  await renderPdf(buildSummaryHtml({ minute, analysis }))
);

export const buildAnalysisPdf = async ({ minute, analysis, renderPdf = renderReportPDF }) => asBuffer(
  await renderPdf(buildAnalysisHtml({ minute, analysis }))
);

const safeSegment = (value) => printable(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

export const buildMinutePdfStorageKey = ({ meetingId, meetingAt, fileName }) => {
  const date = meetingAt ? new Date(meetingAt) : new Date();
  const year = Number.isNaN(date.getTime()) ? new Date().getUTCFullYear() : date.getUTCFullYear();
  return `bria/minutes/${year}/${safeSegment(meetingId)}/${safeSegment(fileName)}`;
};

export const createMinutePdfArtifacts = async ({ minute, analysis, storage, renderPdf = renderReportPDF }) => {
  const storageBase = { meetingId: minute.externalId || minute.id, meetingAt: minute.meetingAt };
  const summaryBody = await buildSummaryPdf({ minute, analysis, renderPdf });
  const analysisBody = await buildAnalysisPdf({ minute, analysis, renderPdf });
  const summary = await storage.uploadBuffer({
    key: buildMinutePdfStorageKey({ ...storageBase, fileName: 'summary.pdf' }),
    body: summaryBody,
    mimeType: 'application/pdf'
  });
  const analysisArtifact = await storage.uploadBuffer({
    key: buildMinutePdfStorageKey({ ...storageBase, fileName: 'analysis.pdf' }),
    body: analysisBody,
    mimeType: 'application/pdf'
  });
  return { summary, analysis: analysisArtifact };
};
