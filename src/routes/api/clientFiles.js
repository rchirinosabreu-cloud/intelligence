import express from 'express';
import multer from 'multer';
import prisma from '../../lib/prisma.js';
import {
    uploadClientFile,
    getSignedUrl,
    deleteFileFromGCS,
    getClientFileStream,
    getUploadSignedUrl,
    getClientFileMetadata,
    getClientStoragePrefix,
    sanitizeStorageFileName
} from '../../services/storageService.js';
import { isSafeStoragePath, validateUploadFile } from '../../config/security.js';

const router = express.Router({ mergeParams: true });
const MAX_CLIENT_FILE_SIZE = 50 * 1024 * 1024;
// Memory storage for multer - keeps file in RAM before GCS upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_CLIENT_FILE_SIZE, files: 1 }
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
        validateUploadFile({ originalname: fileName, mimetype: fileType, size: 0 }, { maxBytes: MAX_CLIENT_FILE_SIZE });
    } catch (error) {
        return res.status(415).json({ error: error.code || 'UNSAFE_FILE_TYPE' });
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
router.post('/files', async (req, res, next) => {
    // Check if it's a JSON request (Direct Upload Registration)
    const isJson = req.headers['content-type']?.includes('application/json');

    // If it's JSON, we skip Multer to avoid it processing the body and hitting size limits
    if (isJson) {
        return next();
    }

    // For Multipart, we use Multer
    upload.single('file')(req, res, next);
}, async (req, res) => {
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
        const fileNameToCheck = (isDirectUpload === 'true' || isDirectUpload === true) ? name : req.file?.originalname;

        try {
            validateUploadFile({
                originalname: fileNameToCheck,
                mimetype: mimeType || req.file?.mimetype,
                size: Number(size || req.file?.size || 0),
                buffer: req.file?.buffer
            }, { maxBytes: MAX_CLIENT_FILE_SIZE });
        } catch (error) {
            return res.status(error.code === 'FILE_TOO_LARGE' ? 413 : 415).json({ error: error.code });
        }

        const client = await prisma.client.findUnique({
            where: { id: clientId },
            select: { name: true }
        });
        if (!client) return res.status(404).json({ error: "Client not found" });

        let registrationData = {};

        if (isDirectUpload === 'true' || isDirectUpload === true) {
            // Case A: File was already uploaded directly to GCS via Signed URL
            if (!gcsPath || !name || !size || !mimeType) {
                return res.status(400).json({ error: "Missing metadata for direct upload registration" });
            }
            const prefix = `${getClientStoragePrefix(client.name)}/`;
            const expectedSuffix = `_${sanitizeStorageFileName(name)}`;
            if (!isSafeStoragePath(gcsPath, [prefix]) || !gcsPath.endsWith(expectedSuffix)) {
                return res.status(400).json({ error: "Invalid storage path for this client" });
            }
            const storedMetadata = await getClientFileMetadata(gcsPath);
            try {
                validateUploadFile({
                    originalname: name,
                    mimetype: storedMetadata.contentType,
                    size: storedMetadata.size
                }, { maxBytes: MAX_CLIENT_FILE_SIZE });
            } catch (error) {
                await deleteFileFromGCS(gcsPath);
                return res.status(error.code === 'FILE_TOO_LARGE' ? 413 : 415).json({ error: error.code });
            }
            if (storedMetadata.size > MAX_CLIENT_FILE_SIZE) {
                await deleteFileFromGCS(gcsPath);
                return res.status(413).json({ error: "El archivo supera el límite de 50 MB" });
            }
            registrationData = {
                name,
                bucketUrl: gcsPath,
                size: storedMetadata.size,
                mimeType: storedMetadata.contentType
            };
        } else {
            // Case B: Proxy upload (legacy/small files)
            const file = req.file;
            if (!file) {
                return res.status(400).json({ error: "No file uploaded" });
            }

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
    const { clientId, fileId } = req.params;

    try {
        const file = await prisma.clientFile.findFirst({
            where: { id: fileId, clientId }
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
    const { clientId, fileId } = req.params;

    try {
        const file = await prisma.clientFile.findFirst({
            where: { id: fileId, clientId }
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
