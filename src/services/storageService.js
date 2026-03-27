import { Storage } from '@google-cloud/storage';
import prisma from '../lib/prisma.js';
import path from 'path';

let storage;
const bucketName = process.env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';

try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        if (credentials.private_key) {
            credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }
        storage = new Storage({
            projectId: process.env.GOOGLE_CLOUD_PROJECT || credentials.project_id,
            credentials
        });
        console.log(`[StorageService] GCS Client initialized for bucket: ${bucketName}`);
    } else {
        console.warn("[StorageService] GOOGLE_APPLICATION_CREDENTIALS_JSON is missing. Storage functionality will be limited.");
    }
} catch (error) {
    console.error("[StorageService] Failed to initialize GCS client:", error);
}

/**
 * Uploads a file to GCS and saves metadata in Prisma.
 */
export async function uploadClientFile(clientId, file, category = 'Entregable') {
    if (!storage) throw new Error("Storage client not initialized");

    // 1. Get client name for virtual folder
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { name: true }
    });

    if (!client) throw new Error("Client not found");

    const bucket = storage.bucket(bucketName);
    const gcsDestination = `${client.name}/${Date.now()}_${file.originalname}`;
    const gcsFile = bucket.file(gcsDestination);

    // 2. Upload to GCS
    await gcsFile.save(file.buffer, {
        metadata: {
            contentType: file.mimetype,
        },
    });

    console.log(`[StorageService] File uploaded to GCS: ${gcsDestination}`);

    // 3. Save to Prisma
    const clientFile = await prisma.clientFile.create({
        data: {
            clientId,
            name: file.originalname,
            bucketUrl: gcsDestination, // We store the GCS path/key
            category,
            size: file.size,
            mimeType: file.mimetype
        }
    });

    return clientFile;
}

/**
 * Lists files for a client and generates Signed URLs.
 */
export async function getClientFilesWithUrls(clientId, category = 'Entregable') {
    const files = await prisma.clientFile.findMany({
        where: {
            clientId,
            category
        },
        orderBy: { createdAt: 'desc' }
    });

    if (!storage) {
        return files.map(f => ({ ...f, url: '#' }));
    }

    const bucket = storage.bucket(bucketName);

    // Generate signed URLs for each file
    const filesWithUrls = await Promise.all(files.map(async (fileRecord) => {
        try {
            const gcsFile = bucket.file(fileRecord.bucketUrl);
            const [url] = await gcsFile.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + 60 * 60 * 1000, // 1 hour
            });
            return {
                ...fileRecord,
                url
            };
        } catch (error) {
            console.error(`[StorageService] Error signing URL for ${fileRecord.bucketUrl}:`, error);
            return { ...fileRecord, url: null, error: 'Signed URL failed' };
        }
    }));

    return filesWithUrls;
}

/**
 * Deletes a file from GCS and removes its record from Prisma.
 */
export async function deleteClientFile(fileId) {
    // 1. Get record to find GCS path
    const fileRecord = await prisma.clientFile.findUnique({
        where: { id: fileId }
    });

    if (!fileRecord) throw new Error("File record not found in database");

    // 2. Delete from GCS
    if (storage) {
        try {
            const bucket = storage.bucket(bucketName);
            const gcsFile = bucket.file(fileRecord.bucketUrl);

            // Check if file exists before deleting to avoid crash
            const [exists] = await gcsFile.exists();
            if (exists) {
                await gcsFile.delete();
                console.log(`[StorageService] File deleted from GCS: ${fileRecord.bucketUrl}`);
            } else {
                console.warn(`[StorageService] File not found in GCS, skipping GCS delete: ${fileRecord.bucketUrl}`);
            }
        } catch (error) {
            console.error(`[StorageService] GCS Delete Error for ${fileRecord.bucketUrl}:`, error);
            // We continue to delete from Prisma even if GCS delete fails or file is missing
        }
    }

    // 3. Delete from Prisma
    await prisma.clientFile.delete({
        where: { id: fileId }
    });

    return { success: true };
}
