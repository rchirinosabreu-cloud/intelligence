import express from 'express';
import * as quotationController from '../../controllers/quotationController.js';
import { authenticateToken, requireModulePermission } from '../../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * PUBLIC ROUTE: Get quotation by its unique token
 * GET /api/quotations/public/:uuid_slug
 */
router.get('/public/:uuid_slug', quotationController.getPublicQuotation);
router.post('/public/:uuid_slug/accept', quotationController.acceptPublicQuotation);

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
