import { generateSummaryHTML, generateAnalysisHTML } from './htmlExport.js';

const waitForFrame = (frame) => new Promise((resolve, reject) => {
  const timeout = window.setTimeout(() => reject(new Error('El reporte tardó demasiado en cargar.')), 15000);
  frame.onload = () => { window.clearTimeout(timeout); resolve(); };
});

const waitForImages = async (documentNode) => Promise.all(Array.from(documentNode.images || []).map((image) => image.complete
  ? Promise.resolve()
  : new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; })));

export const printPDFFromHTML = async (htmlString, filename) => {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:1400px;height:100vh;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(frame);

  try {
    const loaded = waitForFrame(frame);
    frame.srcdoc = htmlString;
    await loaded;
    const frameDocument = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    if (!frameDocument || !frameWindow) throw new Error('No fue posible preparar el documento para impresión.');

    frameDocument.title = filename.replace(/\.pdf$/i, '');
    if (frameDocument.fonts?.ready) await frameDocument.fonts.ready;
    await waitForImages(frameDocument);
    await new Promise((resolve) => window.setTimeout(resolve, 150));

    let removed = false;
    const cleanup = () => {
      if (removed) return;
      removed = true;
      if (document.body.contains(frame)) document.body.removeChild(frame);
    };
    frameWindow.addEventListener('afterprint', cleanup, { once: true });
    window.setTimeout(cleanup, 60000);
    frameWindow.focus();
    frameWindow.print();
  } catch (error) {
    if (document.body.contains(frame)) document.body.removeChild(frame);
    console.error('PDF Generation Error:', error);
    throw new Error('Hubo un error preparando el PDF. Por favor intenta nuevamente.');
  }
};

export const generateSummaryPDF = (data, sourceTitle, reportMeta) => printPDFFromHTML(
  generateSummaryHTML(data, sourceTitle, reportMeta),
  `Resumen_BrainStudio_${Date.now()}.pdf`,
);

export const generateAnalysisPDF = (data, sourceTitle, reportMeta) => printPDFFromHTML(
  generateAnalysisHTML(data, sourceTitle, reportMeta),
  `Analisis_BrainStudio_${Date.now()}.pdf`,
);
