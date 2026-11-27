import express from 'express';
import multer from 'multer';
import * as quotationController from '../../controllers/quotationController.js';
import { authenticateToken, requireModulePermission } from '../../middlewares/authMiddleware.js';
import { uploadMemoryStorage } from '../../lib/uploadStorage.js';
import { MAX_QUOTATION_FILE_BYTES, formatFileSize } from '../../lib/quotationAttachments.js';
import { servePublicQuotationFile, serveQuotationFile, uploadQuotationFile } from '../../services/quotationFileService.js';

const router = express.Router();
const fileUpload = multer({ storage: uploadMemoryStorage(), limits: { fileSize: MAX_QUOTATION_FILE_BYTES, files: 1 } }).single('file');
const fileError = (label) => (error, res) => {
    const status = error.statusCode || 500;
    if (status >= 500) console.error(`[Cotizaciones] ${label}:`, error);
    if (!res.headersSent) res.status(status).json({ error: status >= 500 ? 'No se pudo leer el archivo.' : error.message });
};

/**
 * PUBLIC ROUTE: Get quotation by its unique token
 * GET /api/quotations/public/:uuid_slug
 */
router.get('/public/:uuid_slug', quotationController.getPublicQuotation);
router.post('/public/:uuid_slug/accept', quotationController.acceptPublicQuotation);
// Un adjunto de la propuesta, para quien tiene su enlace (solo propuestas emitidas o aprobadas).
router.get('/public/:uuid_slug/files/:fileId', (req, res) => servePublicQuotationFile(req, res).catch(error => fileError('Adjunto público')(error, res)));

/**
 * PROTECTED ROUTES: Management and creation
 */
router.use(authenticateToken, requireModulePermission('cotizaciones'));

/**
 * GET /api/quotations/catalog
 * Internal catalog with commercial costing data
 */
router.get('/catalog', quotationController.getCatalog);
router.get('/exchange-rate', quotationController.getExchangeRate);

/**
 * POST /api/quotations/files
 * Sube un adjunto de la propuesta que se está escribiendo; queda suelto hasta guardar (file_ids).
 */
router.post('/files', (req, res) => fileUpload(req, res, async (uploadError) => {
    if (uploadError) {
        const tooBig = uploadError.code === 'LIMIT_FILE_SIZE';
        return res.status(tooBig ? 413 : 400).json({ error: tooBig ? `El archivo pesa más de ${formatFileSize(MAX_QUOTATION_FILE_BYTES)}. Compártelo por Drive y pon el enlace en la propuesta.` : 'No se pudo leer el archivo.' });
    }
    try {
        return res.status(201).json(await uploadQuotationFile({ file: req.file, requester: req.user }));
    } catch (error) {
        return fileError('Subir adjunto')(error, res);
    }
}));
router.get('/:id/files/:fileId', (req, res) => serveQuotationFile(req, res).catch(error => fileError('Adjunto')(error, res)));

/**
 * POST /api/quotations
 * Creates a new quotation with financial rules and contractual sanitization
 */
router.post('/', quotationController.createQuotation);

/**
 * PUT /api/quotations/:id
 * Updates an existing quotation
 */
router.put('/:id', quotationController.updateQuotation);

/**
 * POST /api/quotations/:id/accept
 * Comercial registra que el cliente aprobó por fuera del enlace; abre la formalización del proyecto.
 */
router.post('/:id/accept', quotationController.acceptQuotationInternally);

/**
 * POST /api/quotations/:id/send  { channel: 'CORREO' | 'WHATSAPP' }
 * Reenvía la propuesta por correo, o registra que se mandó por WhatsApp desde el teléfono.
 */
router.post('/:id/send', quotationController.sendQuotation);

/**
 * GET /api/quotations/:id/pdf
 * Generates and downloads the PDF version
 */
router.get('/:id/pdf', quotationController.generateQuotationPDF);

/**
 * GET /api/quotations/:id
 * Retrieves a single quotation (admin)
 */
router.get('/:id', quotationController.getQuotation);

/**
 * GET /api/quotations
 * Lists all quotations for admin view
 */
router.get('/', quotationController.listQuotations);

export default router;
