import { Storage } from '@google-cloud/storage';
import 'dotenv/config';

const setBucketCors = async () => {
    const bucketName = process.env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;

    if (!credentialsJson || !projectId) {
        console.error("CRITICAL: GCS Credentials or Project ID missing in environment variables.");
        return;
    }

    try {
        const credentials = JSON.parse(credentialsJson);
        const storage = new Storage({
            projectId,
            credentials,
        });

        console.log(`[CORS Script] Setting CORS for bucket: ${bucketName}...`);

        await storage.bucket(bucketName).setCorsConfiguration([
            {
                maxAgeSeconds: 3600,
                method: ['GET', 'PUT', 'POST', 'OPTIONS', 'DELETE', 'HEAD'],
                origin: ['https://labs.brainstudioagencia.com', 'http://localhost:5173', 'http://localhost:3000'],
                responseHeader: ['Content-Type', 'Authorization', 'Content-Length', 'User-Agent', 'x-goog-resumable', 'x-goog-meta-*'],
            },
        ]);

        console.log(`[CORS Script] SUCCESS: CORS configuration applied to ${bucketName}.`);
    } catch (error) {
        console.error(`[CORS Script] ERROR: Failed to apply CORS configuration.`);
        console.error(`Details: ${error.message}`);
        if (error.code === 403) {
            console.error("Permission denied. Please ensure the service account has 'Storage Admin' or 'Storage Legacy Bucket Owner' role.");
        }
    }
};

setBucketCors();
