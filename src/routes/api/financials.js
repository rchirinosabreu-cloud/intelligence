import express from 'express';
import { getFinancialDashboard } from '../../controllers/financialController.js';
import { requireFinancialAccess } from '../../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/dashboard', requireFinancialAccess, getFinancialDashboard);

export default router;
