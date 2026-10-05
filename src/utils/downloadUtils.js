
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

