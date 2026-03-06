
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { generateSummaryHTML, generateAnalysisHTML } from './htmlExport';
import { STYLES } from './reportStyling';

const generatePDFFromHTML = async (htmlString, filename) => {
  // Create a container for the HTML
  // We use a container to render the HTML content off-screen but visible to the DOM
  const container = document.createElement('div');

  // Apply body styles from reportStyling to the container to ensure consistent look
  // We append essential positioning styles to keep it off-screen but renderable
  container.style.cssText = `
    ${STYLES.body}
    position: fixed;
    left: 0;
    top: 0;
    width: 1400px;
    opacity: 0;
    pointer-events: none;
    z-index: -1;
  `;

  // Inject HTML
  // Parse the HTML to extract styles and body content to avoid nesting <html> tags.
  const parsedDoc = new DOMParser().parseFromString(htmlString, 'text/html');
  const styleTags = parsedDoc.querySelectorAll('style');
  container.innerHTML = parsedDoc.body.innerHTML;
  styleTags.forEach((styleTag) => {
    container.prepend(styleTag.cloneNode(true));
  });

  document.body.appendChild(container);

  try {
    // Wait for images and fonts to settle
    await new Promise(resolve => setTimeout(resolve, 300));
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    const images = Array.from(container.querySelectorAll('img'));
    await Promise.all(images.map((img) => (img.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      })
    )));

    // Convert DOM to canvas
    const canvas = await html2canvas(container, {
      scale: 2, // 2x scale for better resolution (Retina-like)
      useCORS: true, // Allow cross-origin images
      logging: false,
      backgroundColor: '#f8faf5',
      windowWidth: 1400
    });

    const imgData = canvas.toDataURL('image/png');

    // Initialize PDF (A4 Landscape)
    const pdf = new jsPDF('l', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    // Calculate dimensions to fit A4 width
    const imgProps = pdf.getImageProperties(imgData);
    const imgWidth = pdfWidth;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

    let heightLeft = imgHeight;
    let position = 0;

    // Add first page
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    // Add subsequent pages if content overflows
    while (heightLeft > 0) {
      position -= pdfHeight; // Move the image up to show the next section
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(filename);

  } catch (error) {
    console.error("PDF Generation Error:", error);
    alert("Hubo un error generando el PDF. Por favor intente nuevamente.");
  } finally {
    // Cleanup
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
};

export const generateSummaryPDF = (data, sourceTitle, reportMeta) => {
  const htmlContent = generateSummaryHTML(data, sourceTitle, reportMeta);
  const filename = `Resumen_BrainStudio_${Date.now()}.pdf`;
  generatePDFFromHTML(htmlContent, filename);
};

export const generateAnalysisPDF = (data, sourceTitle, reportMeta) => {
  const htmlContent = generateAnalysisHTML(data, sourceTitle, reportMeta);
  const filename = `Analisis_BrainStudio_${Date.now()}.pdf`;
  generatePDFFromHTML(htmlContent, filename);
};
