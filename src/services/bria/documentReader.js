import { Storage } from '@google-cloud/storage';
import pdfParse from 'pdf-parse';

export class DocumentNotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DocumentNotFoundError';
    }
}

export class UnreadablePdfError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnreadablePdfError';
    }
}

let storageClient = null;

/**
 * Lazy initialization of the Google Cloud Storage client to ensure credentials
 * are available at runtime.
 */
function getStorageClient() {
    if (storageClient) return storageClient;

    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        throw new Error("Missing GCP configuration or credentials: GOOGLE_APPLICATION_CREDENTIALS_JSON is not set");
    }

    try {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

        // Sanitize private key: replace literal \n with actual newlines
        if (credentials && credentials.private_key) {
            credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }

        if (!credentials.project_id) {
            throw new Error("Project ID is missing from credentials");
        }

        storageClient = new Storage({
            projectId: credentials.project_id,
            credentials
        });

        return storageClient;
    } catch (error) {
        throw new Error(`Failed to initialize GCP Storage Client: ${error.message}`);
    }
}

/**
 * Descarga un PDF desde un bucket de GCP y extrae su texto limpio.
 * Cumple con los lineamientos de TDD definidos en src/tests/bria/documentReader.test.js.
 *
 * @param {string} bucketName - El nombre del bucket en GCP.
 * @param {string} fileName - La ruta o nombre del archivo en el bucket.
 * @returns {Promise<string>} El texto extraído del documento.
 */
export async function readPdfFromBucket(bucketName, fileName) {
    // Test 5: Formato no soportado
    if (!fileName || !fileName.toLowerCase().endsWith('.pdf')) {
        throw new Error('Unsupported format. Only PDFs are allowed.');
    }

    // Test 3: Falla de Entorno / Credenciales
    const storage = getStorageClient();

    if (!bucketName) {
        throw new Error('Bucket name is required');
    }

    try {
        console.log(`[Bria Optic Nerve] Intentando descargar: gs://${bucketName}/${fileName}`);

        const file = storage.bucket(bucketName).file(fileName);

        // Verificar existencia antes de descargar
        const [exists] = await file.exists();
        if (!exists) {
            // Test 2: Archivo Inexistente
            throw new DocumentNotFoundError(`El archivo gs://${bucketName}/${fileName} no fue encontrado en el bucket.`);
        }

        // Descargar archivo a memoria (buffer)
        const [buffer] = await file.download();

        console.log(`[Bria Optic Nerve] Archivo descargado en memoria. Iniciando parseo PDF...`);

        // Extraer texto
        const pdfData = await pdfParse(buffer);
        const extractedText = pdfData.text ? pdfData.text.trim() : '';

        // Test 4: PDF no legible (Escaneado)
        if (extractedText.length === 0) {
            throw new UnreadablePdfError(`El PDF fue procesado pero no contiene texto seleccionable. Es probable que sea una imagen escaneada que requiere OCR.`);
        }

        // Test 1: Happy Path
        console.log(`[Bria Optic Nerve] Parseo exitoso. Extracción: ${extractedText.length} caracteres.`);
        return extractedText;

    } catch (error) {
        // Propagar errores tipados de dominio
        if (error instanceof DocumentNotFoundError || error instanceof UnreadablePdfError) {
            throw error;
        }

        // Envolver otros errores inesperados
        console.error(`[Bria Optic Nerve] Error crítico leyendo ${fileName}:`, error.message);
        throw new Error(`Failed to read document: ${error.message}`);
    }
}
