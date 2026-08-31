import { generateSummaryHTML, generateAnalysisHTML } from './htmlExport.js';

const getAuthToken = () => localStorage.getItem('authToken') || localStorage.getItem('token');

export const downloadPDFFromHTML = async (html, filename) => {
  const token = getAuthToken();
  const response = await fetch('/api/report-pdf/render', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ html, filename }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'No fue posible generar el PDF.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const generateSummaryPDF = (data, sourceTitle, reportMeta) => downloadPDFFromHTML(
  generateSummaryHTML(data, sourceTitle, reportMeta),
  `Resumen_BrainStudio_${Date.now()}.pdf`,
);

export const generateAnalysisPDF = (data, sourceTitle, reportMeta) => downloadPDFFromHTML(
  generateAnalysisHTML(data, sourceTitle, reportMeta),
  `Analisis_BrainStudio_${Date.now()}.pdf`,
);
