import { S3Client, PutObjectCommand, PutBucketCorsCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { validateUploadFile } from '../config/security.js';
import { randomUUID } from 'node:crypto';

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

const DEFAULT_STORAGE_ORIGINS = [
    "https://labs.brainstudioagencia.com",
    "https://intelligence.brainstudioagencia.com",
    "http://localhost:3000",
    "http://localhost:5173"
];

/** `STORAGE_CORS_ORIGINS` añade orígenes separados por coma sin tocar el código (despliegues nuevos). */
const storageCorsOrigins = () => {
    const extra = String(process.env.STORAGE_CORS_ORIGINS || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);
    return Array.from(new Set([...DEFAULT_STORAGE_ORIGINS, ...extra]));
};

/**
 * Deja el bucket listo para que el navegador suba directo.
 *
 * `PUT` es lo que hace falta para la subida directa de una pieza final (Rodny, 24 de septiembre de 2026):
 * sin él el navegador ni siquiera llega a intentarlo, lo corta el propio navegador. Se llama al arrancar,
 * **fuera** de la cadena de `npm start`, porque un almacenamiento caído no puede impedir que el servidor
 * levante: aquí un fallo se registra y la vida sigue (lo que se rompe es la subida directa, no la app).
 */
export const configureS3Cors = async () => {
    const s3Client = getS3Client();
    const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";
    if (!s3Client) return;

    try {
        console.log(`[S3 Storage] Configuring CORS for bucket: ${bucketName}`);
        const command = new PutBucketCorsCommand({
            Bucket: bucketName,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedHeaders: ["*"],
                        AllowedMethods: ["GET", "HEAD", "PUT", "OPTIONS"],
                        AllowedOrigins: storageCorsOrigins(),
                        ExposeHeaders: ["Content-Length", "Content-Type", "ETag"],
                        MaxAgeSeconds: 3600
                    }
                ]
            }
        });
        await s3Client.send(command);
        console.log(`[S3 Storage] CORS configuration applied successfully.`);
    } catch (error) {
        console.error(`[S3 Storage] CORS configuration failed:`, error.message);
    }
};

/**
 * Un permiso firmado para que el navegador deje **un** objeto en **una** clave que elegimos nosotros.
 * La clave nunca viene del cliente: si viniera, cualquiera podría escribir encima de lo que quisiera.
 */
export const createSignedUpload = async ({ key, contentType, expiresIn = 900 }) => {
    const s3Client = getS3Client();
    const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";
    if (!s3Client) throw new Error("S3 client not initialized");
    if (!key) throw new Error("A signed upload needs a key");

    const command = new PutObjectCommand({ Bucket: bucketName, Key: key, ContentType: contentType });
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return { url, key, contentType, expiresIn };
};

/**
 * Lo que el almacenamiento dice que hay en esa clave, o `null` si no hay nada.
 * Es la única forma de saber el peso real de lo que subió el navegador: lo que el cliente declara
 * antes de subir es una promesa, no un hecho.
 */
export const headS3Object = async (key) => {
    const s3Client = getS3Client();
    const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";
    if (!s3Client) throw new Error("S3 client not initialized");

    try {
        const object = await s3Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
        return {
            key,
            size: Number(object.ContentLength || 0),
            mimeType: String(object.ContentType || '').split(';', 1)[0].trim()
        };
    } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return null;
        throw error;
    }
};

/**
 * Uploads a file to the S3-compatible bucket.
 * @param {Object} file - Multer file object.
 * @param {string} folder - Virtual folder/prefix.
 * @returns {Promise<Object>} - Uploaded file details.
 */
/**
 * Streams an object from S3.
 * @param {string} key - S3 object key.
 */
export const getFromS3Stream = async (key) => {
    const s3Client = getS3Client();
    const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";

    if (!s3Client) throw new Error("S3 client not initialized");

    const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
    });

    const response = await s3Client.send(command);
    return response;
};

export const deleteFromS3 = async (key) => {
    if (!key) return;

    const s3Client = getS3Client();
    const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";

    if (!s3Client) throw new Error("S3 client not initialized");

    const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
    });

    await s3Client.send(command);
};

/**
 * `maxBytes` deja que quien llama fije su propio tope. Sin él, el de siempre: 25 MB. La pieza final de una
 * parrilla pasa el suyo, porque un video normal no cabe en 25 MB (Rodny, 24 de septiembre de 2026).
 */
export const uploadToS3 = async (file, folder = "chat", { maxBytes = 25 * 1024 * 1024 } = {}) => {
    validateUploadFile(file, { maxBytes });
    const s3Client = getS3Client();
    const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";

    if (!s3Client) {
        throw new Error("S3 client not initialized");
    }

    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const key = `${folder}/${timestamp}_${randomUUID()}_${sanitizedName}`;

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
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
