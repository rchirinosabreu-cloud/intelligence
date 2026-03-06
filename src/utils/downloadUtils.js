
/**
 * Utility to download HTML content as a file
 * @param {string} htmlContent - The HTML string to download
 * @param {string} filename - The name of the file
 */
export const downloadHTML = (htmlContent, filename) => {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Utility to trigger PDF download
 * Note: If using jsPDF's doc.save(), this might be redundant, but provided for consistency
 * @param {object} pdfDoc - The jsPDF document instance
 * @param {string} filename - The name of the file
 */
export const downloadPDF = (pdfDoc, filename) => {
  if (pdfDoc && typeof pdfDoc.save === 'function') {
    pdfDoc.save(filename);
  } else {
    console.error('Invalid PDF document provided');
  }
};
