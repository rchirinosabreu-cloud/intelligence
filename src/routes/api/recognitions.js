import express from 'express';
import { createRecognitionHandlers } from '../../controllers/recognitionController.js';
const router = express.Router();
const handlers = createRecognitionHandlers();
// Mounted after authenticateToken; recipient and current module permissions are checked again by the service.
router.post('/claim', handlers.claim);
router.post('/:id/acknowledge', handlers.acknowledge);
export default router;
