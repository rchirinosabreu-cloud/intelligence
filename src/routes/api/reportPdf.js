import express from 'express';
import { renderReportPDF } from '../../services/pdfRenderer.js';

const router = express.Router();
const safeFilename = (value) => {
  const name = String(value || 'Reporte_BrainStudio.pdf').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ._-]+/g, '_');
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
};

router.post('/render', async (req, res) => {
  try {
    const pdf = await renderReportPDF(req.body?.html);
    const filename = safeFilename(req.body?.filename);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (error) {
    console.error('[Report PDF] Generation failed:', error);
    const status = /vacío|tamaño máximo/.test(error.message) ? 400 : 500;
    res.status(status).json({ error: status === 400 ? error.message : 'No fue posible generar el PDF.' });
  }
});

export default router;
