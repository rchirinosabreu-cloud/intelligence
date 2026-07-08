import express from 'express';
import { getPersonalThreats } from '../../controllers/operativeIntelligenceController.js';

const router = express.Router();

router.get('/personal-threats/:userId', getPersonalThreats);

export default router;
