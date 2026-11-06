import { S3Client, PutObjectCommand, PutBucketCorsCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, CopyObjectCommand } from "@aws-sdk/client-s3";
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
export const storageCorsOrigins = (env = process.env) => {
    const extra = String(env.STORAGE_CORS_ORIGINS || '')
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
 * Una URL de lectura firmada y con vencimiento, para que un tercero (Meta, al publicar una pieza)
 * descargue **un** objeto sin que el bucket sea público. Nunca se enseña en la pantalla.
 */
export const createSignedDownload = async ({ key, expiresIn = 900 }) => {
    const s3Client = getS3Client();
    const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";
    if (!s3Client) throw new Error("S3 client not initialized");
    if (!key) throw new Error("A signed download needs a key");

    const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return { url, key, expiresIn };
};

/** El objeto entero en memoria: solo para imágenes (≤ 8 MB, el tope de Meta); nunca para un video. */
export const getS3ObjectBuffer = async (key) => {
    const response = await getFromS3Stream(key);
    const chunks = [];
    for await (const chunk of response.Body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
};

/** Escribe un objeto en una clave que elige quien llama (la copia para Instagram va junto al original). */
export const putS3Object = async ({ key, body, contentType }) => {
    const s3Client = getS3Client();
    const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";
    if (!s3Client) throw new Error("S3 client not initialized");
    if (!key) throw new Error("A put needs a key");
    await s3Client.send(new PutObjectCommand({ Bucket: bucketName, Key: key, Body: body, ContentType: contentType }));
    return { key, size: body.length, mimeType: contentType };
};

/**
 * Lo que el almacenamiento dice que hay en esa clave, o `null` si no hay nada.
 * Es la única forma de saber el peso real de lo que subió el navegador: lo que el cliente declara
 * antes de subir es una promesa, no un hecho.
 */
export const copyS3Object = async (sourceKey, targetKey, { etag } = {}) => {
    const client = getS3Client();
    const bucket = process.env.AWS_S3_BUCKET_NAME || 'chat-evidence';
    if (!client) throw new Error('S3 client not initialized');
    if (!sourceKey || !targetKey || sourceKey === targetKey) throw new Error('A copy needs distinct source and destination keys');
    return client.send(new CopyObjectCommand({
        Bucket: bucket, Key: targetKey,
        CopySource: `${encodeURIComponent(bucket)}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`,
        ...(etag ? { CopySourceIfMatch: etag } : {})
    }));
};

/** Inspect only a bounded signature, tied to the same object version that will be copied. */
export const readS3ObjectPrefix = async (key, maxBytes = 512, { etag } = {}) => {
    const client = getS3Client();
    if (!client) throw new Error('S3 client not initialized');
    const length = Math.min(4096, Math.max(1, Number(maxBytes) || 512));
    const response = await client.send(new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME || 'chat-evidence', Key: key,
        Range: `bytes=0-${length - 1}`, ...(etag ? { IfMatch: etag } : {})
    }));
    const chunks = [];
    let received = 0;
    try {
        for await (const chunk of response.Body) {
            const bytes = Buffer.from(chunk).subarray(0, length - received);
            chunks.push(bytes);
            received += bytes.length;
            if (received >= length) break;
        }
    } finally { response.Body?.destroy?.(); }
    return Buffer.concat(chunks);
};

export const headS3Object = async (key) => {
    const s3Client = getS3Client();
    const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";
    if (!s3Client) throw new Error("S3 client not initialized");

    try {
        const object = await s3Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
        return {
            key,
            size: Number(object.ContentLength || 0),
            mimeType: String(object.ContentType || '').split(';', 1)[0].trim(),
            etag: object.ETag || null
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
export const getFromS3Stream = async (key, { range } = {}) => {
    const s3Client = getS3Client();
    const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";

    if (!s3Client) throw new Error("S3 client not initialized");

    const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
        ...(range ? { Range: range } : {}),
    });

    const response = await s3Client.send(command);
    return response;
};

/**
 * Lista los objetos bajo un prefijo, paginando hasta el final. Solo lee: la usa el
 * barrido de `temp/`, que decide con la base de datos en la mano, nunca por el listado.
 */
export const listS3Objects = async (prefix, { maxPages = 100 } = {}) => {
    const s3Client = getS3Client();
    if (!s3Client) throw new Error("S3 client not initialized");
    const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";

    const objects = [];
    let token;
    let pages = 0;
    do {
        const page = await s3Client.send(new ListObjectsV2Command({
            Bucket: bucketName, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000
        }));
        objects.push(...(page.Contents || []));
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
        pages += 1;
    } while (token && pages < maxPages);

    return objects;
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
