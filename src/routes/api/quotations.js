import express from 'express';
import * as quotationController from '../../controllers/quotationController.js';
import { authenticateToken } from '../../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * PUBLIC ROUTE: Get quotation by its unique token
 * GET /api/quotations/public/:uuid_slug
 */
router.get('/public/:uuid_slug', quotationController.getPublicQuotation);

/**
 * GET /api/quotations/catalog
 * Public or semi-public route to get services
 */
router.get('/catalog', quotationController.getCatalog);

/**
 * PROTECTED ROUTES: Management and creation
 */
router.use(authenticateToken);

/**
 * POST /api/quotations
 * Creates a new quotation with financial rules and contractual sanitization
 */
router.post('/', quotationController.createQuotation);

/**
 * GET /api/quotations/:id/pdf
 * Generates and downloads the PDF version
 */
router.get('/:id/pdf', quotationController.generateQuotationPDF);

/**
 * GET /api/quotations
 * Lists all quotations for admin view
 */
router.get('/', quotationController.listQuotations);

export default router;
