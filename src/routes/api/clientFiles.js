import express from 'express';
import multer from 'multer';
import prisma from '../../lib/prisma.js';
import { uploadClientFile, getSignedUrl, deleteFileFromGCS, getClientFileStream, getUploadSignedUrl } from '../../services/storageService.js';

const router = express.Router({ mergeParams: true });

// Memory storage for multer - keeps file in RAM before GCS upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // Max 50MB
});

/**
 * Generate a Signed URL for direct upload to GCS.
 * GET /api/clients/:clientId/storage/signed-url
 */
router.get('/storage/signed-url', async (req, res) => {
    const { clientId } = req.params;
    const { fileName, fileType } = req.query;

    if (!fileName || !fileType) {
        return res.status(400).json({ error: "fileName and fileType are required" });
    }

    try {
        const client = await prisma.client.findUnique({
            where: { id: clientId },
            select: { name: true }
        });

        if (!client) {
            return res.status(404).json({ error: "Client not found" });
        }

        const result = await getUploadSignedUrl(client.name, fileName, fileType);
        return res.json(result);
    } catch (error) {
        console.error("Error generating signed upload URL:", error);
        return res.status(500).json({ error: "Error generating upload URL", details: error.message });
    }
});

/**
 * Upload or Register a file for a specific client.
 * POST /api/clients/:clientId/files
 * Supports both direct proxy upload (multer) AND registration of pre-uploaded GCS files.
 */
router.post('/files', upload.single('file'), async (req, res) => {
    const { clientId } = req.params;
    const {
        category = 'Entregable',
        isDirectUpload = false,
        gcsPath,
        name,
        size,
        mimeType
    } = req.body;

    try {
        // Security check: Block executable files
        const forbiddenExtensions = ['.exe', '.js', '.sh', '.php', '.bat', '.cmd'];
        const fileNameToCheck = (isDirectUpload === 'true' || isDirectUpload === true) ? name : req.file?.originalname;

        if (fileNameToCheck && forbiddenExtensions.some(ext => fileNameToCheck.toLowerCase().endsWith(ext))) {
            return res.status(403).json({ error: "Por seguridad, no se permiten archivos ejecutables" });
        }

        let registrationData = {};

        if (isDirectUpload === 'true' || isDirectUpload === true) {
            // Case A: File was already uploaded directly to GCS via Signed URL
            if (!gcsPath || !name || !size || !mimeType) {
                return res.status(400).json({ error: "Missing metadata for direct upload registration" });
            }
            registrationData = {
                name,
                bucketUrl: gcsPath,
                size: parseInt(size),
                mimeType
            };
        } else {
            // Case B: Proxy upload (legacy/small files)
            const file = req.file;
            if (!file) {
                return res.status(400).json({ error: "No file uploaded" });
            }

            const client = await prisma.client.findUnique({
                where: { id: clientId },
                select: { name: true }
            });

            if (!client) return res.status(404).json({ error: "Client not found" });

            const uploadResult = await uploadClientFile(file, client.name);
            registrationData = {
                name: uploadResult.name,
                bucketUrl: uploadResult.gcsPath,
                size: uploadResult.size,
                mimeType: uploadResult.mimeType
            };
        }

        // Save to database
        const clientFile = await prisma.clientFile.create({
            data: {
                clientId,
                ...registrationData,
                category
            }
        });

        // Generate a read URL for immediate response
        const readUrl = await getSignedUrl(clientFile.bucketUrl);

        return res.status(201).json({
            ...clientFile,
            url: readUrl
        });
    } catch (error) {
        console.error("Error in client file registration API:", error);
        return res.status(500).json({ error: "Internal server error during registration", details: error.message });
    }
});

/**
 * Get all files for a client.
 * GET /api/clients/:clientId/files?category=Entregable
 */
router.get('/files', async (req, res) => {
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

        // Regenerate signed URLs for all files and filter out ghosts
        const results = await Promise.all(files.map(async (file) => {
            const signedUrl = await getSignedUrl(file.bucketUrl);

            // Auto-healing: If file is NOT_FOUND in GCS, delete record from database
            if (signedUrl && typeof signedUrl === 'object' && signedUrl.error === 'NOT_FOUND') {
                console.log(`Auto-healing: Deleting ghost file record ${file.id} (${file.name})`);
                await prisma.clientFile.delete({ where: { id: file.id } });
                return null;
            }

            return {
                ...file,
                url: signedUrl
            };
        }));

        // Filter out null entries (deleted ghosts)
        const validFiles = results.filter(f => f !== null);

        return res.json(validFiles);
    } catch (error) {
        console.error("Error fetching client files:", error);
        return res.status(500).json({ error: "Error retrieving files", details: error.message });
    }
});

/**
 * Delete a specific file.
 * DELETE /api/clients/:clientId/files/:fileId
 */
router.delete('/files/:fileId', async (req, res) => {
    const { fileId } = req.params;

    // Permissions check: Only ADMIN and EDITOR can delete files
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'EDITOR') {
        return res.status(403).json({ error: "No tienes permisos para eliminar archivos" });
    }

    try {
        const file = await prisma.clientFile.findUnique({
            where: { id: fileId }
        });

        if (!file) {
            return res.status(404).json({ error: "File not found" });
        }

        // 1. Delete from GCS
        await deleteFileFromGCS(file.bucketUrl);

        // 2. Delete from database (Hard delete as requested)
        await prisma.clientFile.delete({
            where: { id: fileId }
        });

        return res.json({ message: "File deleted successfully" });
    } catch (error) {
        console.error("Error deleting client file:", error);
        return res.status(500).json({ error: "Error deleting file", details: error.message });
    }
});

/**
 * Backend Proxy Download for forcing Save As behavior
 * GET /api/clients/:clientId/files/:fileId/download
 */
router.get('/files/:fileId/download', async (req, res) => {
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

        gcsStream.on('error', async (err) => {
            console.error("Error streaming from GCS:", err);

            // If the file is not found (404), auto-heal database
            if (err.code === 404) {
                console.log(`Auto-healing on download: Deleting ghost record ${file.id}`);
                await prisma.clientFile.delete({ where: { id: file.id } }).catch(() => {});
            }

            if (!res.headersSent) {
                res.status(err.code === 404 ? 404 : 500).json({
                    error: err.code === 404 ? "File no longer exists in storage" : "Error downloading file"
                });
            }
        });

        gcsStream.pipe(res);
    } catch (error) {
        console.error("Error in download proxy:", error);
        return res.status(500).json({ error: "Download failed", details: error.message });
    }
});

export default router;
