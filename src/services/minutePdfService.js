import { jsPDF } from 'jspdf';
import { readFileSync } from 'node:fs';

const WORK_SANS_REGULAR = readFileSync(new URL('../assets/fonts/WorkSans-Regular.ttf', import.meta.url)).toString('base64');
const WORK_SANS_BOLD = readFileSync(new URL('../assets/fonts/WorkSans-Bold.ttf', import.meta.url)).toString('base64');

const PAGE = { width: 210, height: 297, marginX: 20, top: 20, bottom: 32 };
const COLORS = {
  ink: [24, 24, 27],
  muted: [113, 113, 122],
  line: [228, 228, 231],
  accent: [0, 158, 185],
  soft: [240, 250, 252]
};

const printable = (value) => String(value ?? '')
  .replace(/[\u2013\u2014\u2212]/g, '-')
  .replace(/\u2022/g, '-')
  .replace(/\u00a0/g, ' ')
  .trim();

const list = (items, formatter = (item) => item) => (Array.isArray(items) ? items : [])
  .map((item) => printable(formatter(item)))
  .filter(Boolean);

const actionLine = (item = {}) => [
  item.task || item.title,
  item.owner ? `Responsable: ${item.owner}` : null,
  item.dueDate ? `Fecha: ${item.dueDate}` : null,
  item.priority ? `Prioridad: ${item.priority}` : null
].filter(Boolean).join(' - ');

const signalLine = (item = {}) => [item.type, item.description, item.evidence].filter(Boolean).join(' - ');

const formatMeetingDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' }).format(date);
};

const createWriter = ({ documentLabel, title, subtitle, minute }) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('WorkSans-Regular.ttf', WORK_SANS_REGULAR);
  doc.addFont('WorkSans-Regular.ttf', 'WorkSans', 'normal');
  doc.addFileToVFS('WorkSans-Bold.ttf', WORK_SANS_BOLD);
  doc.addFont('WorkSans-Bold.ttf', 'WorkSans', 'bold');
  let y = PAGE.top;

  const addPage = () => {
    doc.addPage();
    y = PAGE.top;
  };
  const ensureSpace = (height) => {
    if (y + height > PAGE.height - PAGE.bottom) addPage();
  };
  const text = (value, { size = 10, color = COLORS.ink, style = 'normal', gap = 3, indent = 0 } = {}) => {
    const normalized = printable(value);
    if (!normalized) return;
    doc.setFont('WorkSans', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(normalized, PAGE.width - (PAGE.marginX * 2) - indent);
    const lineHeight = size * 0.42;
    ensureSpace(lines.length * lineHeight + gap);
    doc.text(lines, PAGE.marginX + indent, y);
    y += lines.length * lineHeight + gap;
  };
  const section = (heading, body, { items = false } = {}) => {
    const values = items ? body : [body];
    if (!values?.length || values.every((value) => !printable(value))) return;
    ensureSpace(18);
    y += 3;
    doc.setDrawColor(...COLORS.line);
    doc.line(PAGE.marginX, y, PAGE.width - PAGE.marginX, y);
    y += 7;
    text(heading.toUpperCase(), { size: 8, color: COLORS.accent, style: 'bold', gap: 5 });
    values.forEach((value) => text(items ? `- ${value}` : value, { size: 10, color: COLORS.ink, gap: 3, indent: items ? 2 : 0 }));
  };

  doc.setFillColor(...COLORS.soft);
  doc.roundedRect(PAGE.marginX, y, PAGE.width - (PAGE.marginX * 2), 13, 3, 3, 'F');
  doc.setFont('WorkSans', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.accent);
  doc.text(printable(`BRIA - ${documentLabel}`).toUpperCase(), PAGE.marginX + 5, y + 8);
  y += 22;
  text(title || minute.title || 'Reunión', { size: 22, style: 'bold', gap: 4 });
  text(subtitle, { size: 11, color: COLORS.muted, gap: 6 });
  text(`${printable(minute.title || 'Reunión')}  |  ${formatMeetingDate(minute.meetingAt)}`, { size: 8, color: COLORS.muted, gap: 7 });

  const finish = () => {
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(...COLORS.line);
      doc.line(PAGE.marginX, PAGE.height - 14, PAGE.width - PAGE.marginX, PAGE.height - 14);
      doc.setFont('WorkSans', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.muted);
      doc.text('Documento generado automáticamente por Bria. Verifica las acciones antes de ejecutarlas.', PAGE.marginX, PAGE.height - 9);
      doc.text(`${page} / ${pages}`, PAGE.width - PAGE.marginX, PAGE.height - 9, { align: 'right' });
    }
    return Buffer.from(doc.output('arraybuffer'));
  };

  return { text, section, finish };
};

export const buildSummaryPdf = ({ minute, analysis }) => {
  const writer = createWriter({
    documentLabel: 'Resumen ejecutivo',
    title: analysis.summaryTitle || minute.title,
    subtitle: analysis.summarySubtitle || 'Síntesis ejecutiva de la reunión',
    minute
  });
  writer.section('Resumen ejecutivo', analysis.executiveSummary || minute.executiveSummary || 'Sin resumen disponible.');
  writer.section('Participantes', list(analysis.participants || minute.participants, (item) => typeof item === 'string' ? item : [item?.name, item?.role].filter(Boolean).join(' - ')), { items: true });
  writer.section('Decisiones', list(analysis.decisions), { items: true });
  writer.section('Acciones propuestas', list(analysis.actionItems || minute.actionItems, actionLine), { items: true });
  return writer.finish();
};

export const buildAnalysisPdf = ({ minute, analysis }) => {
  const writer = createWriter({
    documentLabel: 'Análisis operativo',
    title: analysis.analysisTitle || `Análisis - ${minute.title}`,
    subtitle: analysis.analysisSubtitle || 'Lectura operativa y señales para revisión',
    minute
  });
  writer.section('Contexto', analysis.executiveSummary || minute.executiveSummary || 'Sin contexto disponible.');
  writer.section('Temas tratados', list(analysis.topics), { items: true });
  writer.section('Decisiones', list(analysis.decisions), { items: true });
  writer.section('Riesgos', list(analysis.risks), { items: true });
  writer.section('Oportunidades', list(analysis.opportunities), { items: true });
  writer.section('Señales del Observer', list(analysis.observerSignals || minute.observerSignals, signalLine), { items: true });
  writer.section('Acciones propuestas', list(analysis.actionItems || minute.actionItems, actionLine), { items: true });
  return writer.finish();
};

const safeSegment = (value) => printable(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

export const buildMinutePdfStorageKey = ({ meetingId, meetingAt, fileName }) => {
  const date = meetingAt ? new Date(meetingAt) : new Date();
  const year = Number.isNaN(date.getTime()) ? new Date().getUTCFullYear() : date.getUTCFullYear();
  return `bria/minutes/${year}/${safeSegment(meetingId)}/${safeSegment(fileName)}`;
};

export const createMinutePdfArtifacts = async ({ minute, analysis, storage }) => {
  const storageBase = { meetingId: minute.externalId || minute.id, meetingAt: minute.meetingAt };
  const summaryBody = buildSummaryPdf({ minute, analysis });
  const analysisBody = buildAnalysisPdf({ minute, analysis });
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
