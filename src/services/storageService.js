import { Storage } from '@google-cloud/storage';
import { validateUploadFile } from '../config/security.js';

let storage;

export const getClientStoragePrefix = (clientName = '') => String(clientName)
    .replace(/[^a-z0-9/]/gi, '_')
    .toLowerCase();

export const sanitizeStorageFileName = (fileName = '') => String(fileName)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 180);

/**
 * Initializes the GCS client.
 * Requires GOOGLE_APPLICATION_CREDENTIALS_JSON, GOOGLE_CLOUD_PROJECT, and GCS_BUCKET_NAME.
 */
const getStorageClient = () => {
    if (storage) return storage;

    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;

    if (!credentialsJson || !projectId) {
        console.warn("GCS Credentials or Project ID missing. Storage service will fail.");
        return null;
    }

    try {
        const credentials = JSON.parse(credentialsJson);
        storage = new Storage({
            projectId,
            credentials,
        });

        return storage;
    } catch (error) {
        console.error("Error initializing GCS Storage client:", error);
        return null;
    }
};

/**
 * Uploads a file to GCS into a virtual folder named after the client.
 * @param {Object} file - The file object from multer (memoryStorage).
 * @param {string} clientName - The name of the client to use as folder name.
 * @returns {Promise<Object>} - The uploaded file details (url, name, size).
 */
export const uploadClientFile = async (file, clientName) => {
    validateUploadFile(file, { maxBytes: 50 * 1024 * 1024 });
    const bucketName = process.env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';
    const storageClient = getStorageClient();

    if (!storageClient) {
        throw new Error("Storage client not initialized");
    }

    const bucket = storageClient.bucket(bucketName);

    // Create a clean folder name from client name (allow slashes for structured paths)
    const folderName = getClientStoragePrefix(clientName);
    const timestamp = Date.now();

    // Sanitize original filename (remove spaces, special chars)
    const sanitizedOriginalName = sanitizeStorageFileName(file.originalname);
    const gcsFileName = `${folderName}/${timestamp}_${sanitizedOriginalName}`;

    const blob = bucket.file(gcsFileName);
    const blobStream = blob.createWriteStream({
        resumable: false,
        metadata: {
            contentType: file.mimetype,
        },
    });

    return new Promise((resolve, reject) => {
        blobStream.on('error', (err) => reject(err));
        blobStream.on('finish', async () => {
            // Generate a signed URL for secure access (expires in 1 hour by default)
            const [url] = await blob.getSignedUrl({
                action: 'read',
                expires: Date.now() + 1000 * 60 * 60, // 1 hour
            });

            resolve({
                url,
                gcsPath: gcsFileName,
                name: file.originalname,
                size: file.size,
                mimeType: file.mimetype
            });
        });
        blobStream.end(file.buffer);
    });
};

/**
 * Programmatically configures CORS for the storage bucket.
 */
export const configureBucketCors = async () => {
    const bucketName = process.env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';
    const storageClient = getStorageClient();
    if (!storageClient) return;

    try {
        console.log(`[Storage] Configuring CORS for bucket: ${bucketName}`);
        const [metadata] = await storageClient.bucket(bucketName).setCorsConfiguration([
            {
                maxAgeSeconds: 3600,
                method: ['GET', 'PUT', 'POST', 'OPTIONS', 'DELETE', 'HEAD'],
                origin: ['https://labs.brainstudioagencia.com', 'http://localhost:3000', 'http://localhost:5173'],
                responseHeader: ['Content-Type', 'Authorization', 'Content-Length', 'User-Agent', 'x-goog-resumable', 'x-goog-meta-*'],
            },
        ]);
        console.log(`[Storage] CORS configuration applied successfully.`);
    } catch (error) {
        console.error(`[Storage] CORS configuration failed:`, error.message);
        throw error;
    }
};

/**
 * Generates a V4 Signed URL for uploading a file directly to GCS.
 * @param {string} clientName - For folder prefix.
 * @param {string} fileName - Original filename.
 * @param {string} contentType - MIME type.
 * @returns {Promise<Object>} - Signed URL and gcsPath.
 */
export const getUploadSignedUrl = async (clientName, fileName, contentType) => {
    validateUploadFile({ originalname: fileName, mimetype: contentType, size: 0 }, { maxBytes: 50 * 1024 * 1024 });
    const bucketName = process.env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';
    const storageClient = getStorageClient();

    if (!storageClient) {
        throw new Error("Storage client not initialized");
    }

    const folderName = getClientStoragePrefix(clientName);
    const timestamp = Date.now();
    const sanitizedFileName = sanitizeStorageFileName(fileName);
    if (!sanitizedFileName) throw new Error('Invalid file name');
    const gcsFileName = `${folderName}/${timestamp}_${sanitizedFileName}`;

    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(gcsFileName);

    const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType,
    });

    return {
        url,
        gcsPath: gcsFileName
    };
};

/**
 * Generates a fresh signed URL for an existing GCS path.
 * @param {string} gcsPath - The virtual path in the bucket.
 * @param {number} expiresInMinutes - Expiration time.
 */
export const getSignedUrl = async (gcsPath, expiresInMinutes = 60) => {
    const bucketName = process.env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';
    const storageClient = getStorageClient();
    if (!storageClient) return null;

    try {
        const file = storageClient.bucket(bucketName).file(gcsPath);

        // Check if file exists to prevent "ghost" records
        const [exists] = await file.exists();
        if (!exists) {
            return { error: 'NOT_FOUND' };
        }

        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 1000 * 60 * expiresInMinutes,
        });
        return url;
    } catch (error) {
        console.error("Error generating signed URL:", error);
        return null;
    }
};

/**
 * Deletes a file from GCS.
 */
export const deleteFileFromGCS = async (gcsPath) => {
    const bucketName = process.env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';
    const storageClient = getStorageClient();
    if (!storageClient) return;

    try {
        await storageClient.bucket(bucketName).file(gcsPath).delete();
    } catch (error) {
        console.error(`Error deleting file ${gcsPath} from GCS:`, error);
        // We don't throw here to allow database cleanup even if GCS delete fails (e.g. file already gone)
    }
};

/**
 * Returns a readable stream for a GCS file.
 */
export const getClientFileStream = (gcsPath) => {
    const bucketName = process.env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';
    const storageClient = getStorageClient();
    if (!storageClient) throw new Error("Storage client not initialized");

    return storageClient.bucket(bucketName).file(gcsPath).createReadStream();
};

export const getClientFileMetadata = async (gcsPath) => {
    const bucketName = process.env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';
    const storageClient = getStorageClient();
    if (!storageClient) throw new Error('Storage client not initialized');

    const [metadata] = await storageClient.bucket(bucketName).file(gcsPath).getMetadata();
    return {
        size: Number(metadata.size || 0),
        contentType: metadata.contentType || 'application/octet-stream'
    };
};

/**
 * Uploads a team member avatar to GCS.
 * Path: avatars/{memberId}_{timestamp}_{filename}
 * @param {Object} file - Multer file object.
 * @param {string} memberId - ID of the team member.
 * @returns {Promise<Object>} - GCS path and other metadata.
 */
export const uploadAvatar = async (file, memberId) => {
    validateUploadFile(file, { maxBytes: 5 * 1024 * 1024 });
    const bucketName = process.env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';
    const storageClient = getStorageClient();

    if (!storageClient) {
        throw new Error("Storage client not initialized");
    }

    const bucket = storageClient.bucket(bucketName);
    const timestamp = Date.now();
    const gcsFileName = `avatars/${memberId}_${timestamp}_${sanitizeStorageFileName(file.originalname)}`;

    const blob = bucket.file(gcsFileName);
    const blobStream = blob.createWriteStream({
        resumable: false,
        metadata: {
            contentType: file.mimetype,
        },
    });

    return new Promise((resolve, reject) => {
        blobStream.on('error', (err) => reject(err));
        blobStream.on('finish', () => {
            resolve({
                gcsPath: gcsFileName,
                mimeType: file.mimetype
            });
        });
        blobStream.end(file.buffer);
    });
};
