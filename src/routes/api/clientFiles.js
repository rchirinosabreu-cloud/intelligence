import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { uploadClientFile, getSignedUrl, deleteFileFromGCS, getClientFileStream } from '../../services/storageService.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

// Memory storage for multer - keeps file in RAM before GCS upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // Max 50MB
});

/**
 * Upload a file for a specific client.
 * POST /api/clients/:clientId/files
 */
router.post('/files', authenticateToken, upload.single('file'), async (req, res) => {
    const { clientId } = req.params;
    const { category = 'Entregable' } = req.body;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        // 1. Get client details for folder naming
        const client = await prisma.client.findUnique({
            where: { id: clientId },
            select: { name: true }
        });

        if (!client) {
            return res.status(404).json({ error: "Client not found" });
        }

        // 2. Upload to GCS
        const uploadResult = await uploadClientFile(file, client.name);

        // 3. Save to database
        const clientFile = await prisma.clientFile.create({
            data: {
                clientId,
                name: uploadResult.name,
                bucketUrl: uploadResult.gcsPath, // Store path instead of signed URL for durability
                size: uploadResult.size,
                mimeType: uploadResult.mimeType,
                category
            }
        });

        res.status(201).json({
            ...clientFile,
            url: uploadResult.url // Send signed URL for immediate use
        });
    } catch (error) {
        console.error("Error in client file upload API:", error);
        res.status(500).json({ error: "Internal server error during upload" });
    }
});

/**
 * Get all files for a client.
 * GET /api/clients/:clientId/files?category=Entregable
 */
router.get('/files', authenticateToken, async (req, res) => {
    const { clientId } = req.params;
    const { category } = req.query;

    try {
        const files = await prisma.clientFile.findMany({
            where: {
                clientId,
                ...(category && { category }),
                deletedAt: null
            },
            orderBy: { createdAt: 'desc' }
        });

        // Regenerate signed URLs for all files
        const filesWithUrls = await Promise.all(files.map(async (file) => {
            const signedUrl = await getSignedUrl(file.bucketUrl);
            return {
                ...file,
                url: signedUrl
            };
        }));

        res.json(filesWithUrls);
    } catch (error) {
        console.error("Error fetching client files:", error);
        res.status(500).json({ error: "Error retrieving files" });
    }
});

/**
 * Delete a specific file.
 * DELETE /api/clients/:clientId/files/:fileId
 */
router.delete('/files/:fileId', authenticateToken, async (req, res) => {
    const { fileId } = req.params;

    try {
        const file = await prisma.clientFile.findUnique({
            where: { id: fileId }
        });

        if (!file) {
            return res.status(404).json({ error: "File not found" });
        }

        // 1. Delete from GCS
        await deleteFileFromGCS(file.bucketUrl);

        // 2. Delete from database (Soft delete for safety, hard delete requested)
        await prisma.clientFile.delete({
            where: { id: fileId }
        });

        res.json({ message: "File deleted successfully" });
    } catch (error) {
        console.error("Error deleting client file:", error);
        res.status(500).json({ error: "Error deleting file" });
    }
});

/**
 * Backend Proxy Download for forcing Save As behavior
 * GET /api/clients/:clientId/files/:fileId/download
 */
router.get('/files/:fileId/download', authenticateToken, async (req, res) => {
    const { fileId } = req.params;

    try {
        const file = await prisma.clientFile.findUnique({
            where: { id: fileId }
        });

        if (!file) {
            return res.status(404).json({ error: "File not found" });
        }

        // Set headers for forced download
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');

        // Stream from GCS to response
        const gcsStream = getClientFileStream(file.bucketUrl);

        gcsStream.on('error', (err) => {
            console.error("Error streaming from GCS:", err);
            if (!res.headersSent) {
                res.status(500).json({ error: "Error downloading file from storage" });
            }
        });

        gcsStream.pipe(res);
    } catch (error) {
        console.error("Error in download proxy:", error);
        res.status(500).json({ error: "Download failed" });
    }
});

export default router;
