
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Configure PDF.js worker to use local build instead of CDN to avoid CORS issues
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export const processDocument = async (file) => {
  const fileType = file.type;

  try {
    if (fileType === 'application/pdf') {
      return await extractTextFromPDF(file);
    } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return await extractTextFromWord(file);
    } else if (fileType === 'text/plain' || fileType === 'text/csv' || file.name.endsWith('.csv')) {
      return await extractTextFromTXT(file);
    } else {
      throw new Error('Unsupported file type. Please upload PDF, DOCX, CSV, or TXT.');
    }
  } catch (error) {
    console.error("Document processing error:", error);
    throw new Error(`Failed to process document: ${error.message}`);
  }
};

const extractTextFromPDF = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n\n';
  }

  return fullText.trim();
};

const extractTextFromWord = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
};

const extractTextFromTXT = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
};
