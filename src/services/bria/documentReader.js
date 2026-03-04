import { Storage } from '@google-cloud/storage';
import pdfParse from 'pdf-parse';
import csvParser from 'csv-parser';

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
 * Internal helper to parse CSV streams into a token-efficient string
 */
async function parseCsvStream(fileStream) {
    return new Promise((resolve, reject) => {
        const results = [];
        let headers = [];

        fileStream.pipe(csvParser())
            .on('headers', (h) => {
                headers = h;
                // Add header row to our results
                results.push(headers.join(' | '));
            })
            .on('data', (data) => {
                // Convert row object to a pipe-separated string to save tokens
                // e.g. "Value1 | Value2 | Value3"
                const rowValues = headers.map(h => data[h] || '');
                results.push(rowValues.join(' | '));
            })
            .on('end', () => {
                // Join all rows with newlines
                const finalString = results.join('\n');
                resolve(finalString);
            })
            .on('error', (error) => {
                reject(new Error(`CSV Parsing Error: ${error.message}`));
            });
    });
}

/**
 * Descarga un PDF o CSV desde un bucket de GCP y extrae su texto limpio o estructurado.
 * Cumple con los lineamientos de TDD definidos en src/tests/bria/documentReader.test.js.
 *
 * @param {string} bucketName - El nombre del bucket en GCP.
 * @param {string} fileName - La ruta o nombre del archivo en el bucket.
 * @returns {Promise<string>} El texto extraído del documento.
 */
export async function readDocumentFromBucket(bucketName, fileName) {
    if (!fileName) throw new Error('File name is required.');

    const lowerFileName = fileName.toLowerCase();
    const isPdf = lowerFileName.endsWith('.pdf');
    const isCsv = lowerFileName.endsWith('.csv');

    // Test 5: Formato no soportado (actualizado para permitir CSV)
    if (!isPdf && !isCsv) {
        throw new Error('Unsupported format. Only PDFs and CSVs are allowed.');
    }

    // Test 3: Falla de Entorno / Credenciales
    const storage = getStorageClient();

    if (!bucketName) {
        throw new Error('Bucket name is required');
    }

    try {
        console.log(`[Bria Optic Nerve] Intentando leer: gs://${bucketName}/${fileName}`);

        const file = storage.bucket(bucketName).file(fileName);

        // Verificar existencia antes de descargar
        const [exists] = await file.exists();
        if (!exists) {
            // Test 2: Archivo Inexistente
            throw new DocumentNotFoundError(`El archivo gs://${bucketName}/${fileName} no fue encontrado en el bucket.`);
        }

        let extractedText = '';

        if (isPdf) {
            // Descargar archivo a memoria (buffer)
            const [buffer] = await file.download();
            console.log(`[Bria Optic Nerve] PDF en memoria. Iniciando parseo...`);

            // Extraer texto
            const pdfData = await pdfParse(buffer);
            extractedText = pdfData.text ? pdfData.text.trim() : '';

            // Test 4: PDF no legible (Escaneado)
            if (extractedText.length === 0) {
                throw new UnreadablePdfError(`El PDF fue procesado pero no contiene texto seleccionable. Es probable que sea una imagen escaneada que requiere OCR.`);
            }
        } else if (isCsv) {
            console.log(`[Bria Optic Nerve] Iniciando stream de CSV...`);
            // Stream the file directly into the CSV parser to avoid loading giant files into memory
            const fileStream = file.createReadStream();
            extractedText = await parseCsvStream(fileStream);

            if (!extractedText || extractedText.trim().length === 0) {
                 throw new Error("The CSV file appears to be empty.");
            }
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
