import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * S3-Compatible Storage Service (Railway / T3)
 * Uses AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME
 */

const getS3Client = () => {
    const endpoint = process.env.AWS_ENDPOINT_URL || "https://t3.storageapi.dev";
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
        console.warn("S3 Credentials missing. S3 storage service will fail.");
        return null;
    }

    return new S3Client({
        endpoint,
        region: "us-east-1", // Standard for S3-compatible, usually ignored by custom endpoints
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
        forcePathStyle: true, // Required for many S3-compatible providers
    });
};

/**
 * Uploads a file to the S3-compatible bucket.
 * @param {Object} file - Multer file object.
 * @param {string} folder - Virtual folder/prefix.
 * @returns {Promise<Object>} - Uploaded file details.
 */
export const uploadToS3 = async (file, folder = "chat") => {
    const s3Client = getS3Client();
    const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";

    if (!s3Client) {
        throw new Error("S3 client not initialized");
    }

    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const key = `${folder}/${timestamp}_${sanitizedName}`;

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read', // Ensure it's publicly readable if the provider supports it
    });

    try {
        await s3Client.send(command);

        // Construct the public URL
        // Usually: {endpoint}/{bucket}/{key}
        const endpoint = (process.env.AWS_ENDPOINT_URL || "https://t3.storageapi.dev").replace(/\/$/, "");
        const publicUrl = `${endpoint}/${bucketName}/${key}`;

        return {
            url: publicUrl,
            key: key,
            name: file.originalname,
            size: file.size,
            mimeType: file.mimetype
        };
    } catch (error) {
        console.error("Error uploading to S3:", error);
        throw error;
    }
};
