import express from 'express';
import multer from 'multer';
import { uploadClientFile, getClientFilesWithUrls } from '../../services/storageService.js';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 250 * 1024 * 1024 } // 250 MB Limit
});

// GET /api/clients/:clientId/files - List files with Signed URLs
router.get('/:clientId/files', async (req, res) => {
    try {
        const { clientId } = req.params;
        const { category = 'Entregable' } = req.query;
        console.log(`[API] Listing files for clientId: ${clientId}, Category: ${category}`);

        const files = await getClientFilesWithUrls(clientId, category);
        res.json(files);
    } catch (error) {
        console.error("[API] Error listing client files:", error);
        res.status(500).json({ error: "Failed to list files" });
    }
});

// POST /api/clients/:clientId/files - Upload file to GCS
router.post('/:clientId/files', upload.single('file'), async (req, res) => {
    try {
        const { clientId } = req.params;
        const file = req.file;
        const { category = 'Entregable' } = req.body;

        if (!file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        console.log(`[API] Uploading file to client: ${clientId}, File: ${file.originalname}`);

        const clientFile = await uploadClientFile(clientId, file, category);
        res.json(clientFile);
    } catch (error) {
        console.error("[API] Error uploading client file:", error);
        res.status(500).json({ error: "Failed to upload file" });
    }
});

export default router;
