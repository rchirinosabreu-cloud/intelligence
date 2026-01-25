import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { VertexAI, FunctionDeclarationSchemaType } from '@google-cloud/vertexai';
import { google } from 'googleapis';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';

dotenv.config();

// Global Crash Handler
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    // Keep alive if possible, or let Railway restart it with a log
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});

console.log("Server script starting...");

const app = express();

const allowedOrigins = [
  "https://intelligence.brainstudioagencia.com",
  "http://localhost:3000",
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : [])
];

const corsOptions = {
  origin: (origin, callback) => {
    // Permitir peticiones sin origen (como Postman o apps móviles)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: El origen ${origin} no está autorizado.`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
};

// CORS configuration (allow all by default; restrict via CORS_ORIGINS env)
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());

const PORT = process.env.PORT || 3000;

// --- AUTHENTICATION SETUP ---
let credentials;
try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        console.log("Credentials parsed successfully for project:", credentials?.project_id);
    } else {
        console.error("CRITICAL: GOOGLE_APPLICATION_CREDENTIALS_JSON is missing");
    }
} catch (e) {
    console.error("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON", e);
}

const PROJECT_ID = credentials?.project_id;
const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const MODEL_NAME = process.env.GEMINI_MODEL || process.env.VERTEX_MODEL || "gemini-2.5-flash";

console.log(`[VertexAI] Initializing with Project ID: ${PROJECT_ID || 'UNDEFINED'}, Location: ${LOCATION}, Model: ${MODEL_NAME}`);

// Initialize Clients safely
let vertexAI;
try {
    if (!PROJECT_ID) throw new Error("Project ID is missing from credentials");
    vertexAI = new VertexAI({
        project: PROJECT_ID,
        location: LOCATION,
        googleAuthOptions: { credentials }
    });
    console.log("[VertexAI] Client initialized successfully.");
} catch (e) {
    console.error("[VertexAI] Failed to initialize client:", e);
}

let drive;
let sheets;
try {
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/spreadsheets.readonly'
        ]
    });
    drive = google.drive({ version: 'v3', auth });
    sheets = google.sheets({ version: 'v4', auth });
    console.log("[Drive] Client initialized successfully.");
} catch (e) {
    console.error("[Drive] Failed to initialize client:", e);
}

// --- DRIVE HELPER FUNCTIONS ---
async function searchAndReadDrive(query) {
    try {
        console.log(`[Drive] Searching for: ${query}`);
        // 1. List files (Name matches)
        const res = await drive.files.list({
            q: `name contains '${query}' and trashed = false`,
            pageSize: 10,
            fields: 'files(id, name, mimeType)',
            orderBy: 'modifiedTime desc'
        });

        const files = res.data.files;
        if (!files || files.length === 0) {
            return {
                text: `No se encontraron archivos para la búsqueda: "${query}"`,
                inlineDataParts: []
            };
        }

        let combinedContent = `Encontré ${files.length} archivos relevantes para "${query}":\n`;
        const inlineDataParts = [];
        const linkEntries = [];

        // 2. Read content (limit to first 5)
        for (const file of files.slice(0, 5)) {
            try {
                let content = "";
                const driveLink = `https://drive.google.com/file/d/${file.id}/view`;
                if (file.mimeType === 'application/vnd.google-apps.document') {
                    // Google Docs
                    const exportData = await drive.files.export({
                        fileId: file.id,
                        mimeType: 'text/plain'
                    });
                    content = exportData.data;
                } else if (file.mimeType === 'text/plain' || file.mimeType === 'text/csv') {
                     // Plain text or CSV (if simple)
                     const getData = await drive.files.get({
                        fileId: file.id,
                        alt: 'media',
                        responseType: 'arraybuffer'
                    });
                    const dataBuffer = Buffer.from(getData.data);
                    content = dataBuffer.toString('utf8');
                } else if (file.mimeType === 'application/pdf') {
                    // PDF (multimodal)
                    const getData = await drive.files.get({
                        fileId: file.id,
                        alt: 'media',
                        responseType: 'arraybuffer'
                    });
                    const dataBuffer = Buffer.from(getData.data);
                    const extractedPdfText = await extractPdfText(dataBuffer);
                    inlineDataParts.push({
                        inlineData: {
                            mimeType: 'application/pdf',
                            data: dataBuffer.toString('base64')
                        }
                    });
                    if (extractedPdfText) {
                        content = extractedPdfText;
                    } else {
                        content = '[PDF adjunto para análisis multimodal]';
                    }
                } else if (file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                    // DOCX (Word)
                    const getData = await drive.files.get({
                        fileId: file.id,
                        alt: 'media',
                        responseType: 'arraybuffer'
                    });
                    const dataBuffer = Buffer.from(getData.data);
                    const result = await mammoth.extractRawText({ buffer: dataBuffer });
                    content = result.value;
                } else if (file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
                    // Excel (.xlsx)
                    const getData = await drive.files.get({
                        fileId: file.id,
                        alt: 'media',
                        responseType: 'arraybuffer'
                    });
                    const dataBuffer = Buffer.from(getData.data);
                    const workbook = xlsx.read(dataBuffer, { type: 'buffer' });
                    const sheetName = workbook.SheetNames[0];
                    if (!sheetName) {
                        content = '[Archivo Excel sin hojas visibles]';
                    } else {
                        const worksheet = workbook.Sheets[sheetName];
                        const csvData = xlsx.utils.sheet_to_csv(worksheet);
                        content = csvData || '[Hoja de Excel vacía]';
                    }
                } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
                    // Google Sheets
                    const spreadsheet = await sheets.spreadsheets.get({
                        spreadsheetId: file.id
                    });
                    const firstSheetTitle = spreadsheet.data.sheets?.[0]?.properties?.title;
                    if (!firstSheetTitle) {
                        content = '[Hoja de cálculo sin pestañas legibles]';
                    } else {
                        const valuesResponse = await sheets.spreadsheets.values.get({
                            spreadsheetId: file.id,
                            range: `${firstSheetTitle}!A1:Z200`
                        });
                        const rows = valuesResponse.data.values || [];
                        if (!rows.length) {
                            content = `[Hoja de cálculo vacía en "${firstSheetTitle}"]`;
                        } else {
                            content = rows.map(row => row.join('\t')).join('\n');
                        }
                    }
                } else if (file.mimeType === 'application/vnd.google-apps.presentation') {
                    // Google Slides (export to PDF for multimodal)
                    const exportData = await drive.files.export({
                        fileId: file.id,
                        mimeType: 'application/pdf'
                    }, { responseType: 'arraybuffer' });
                    const dataBuffer = Buffer.from(exportData.data);
                    inlineDataParts.push({
                        inlineData: {
                            mimeType: 'application/pdf',
                            data: dataBuffer.toString('base64')
                        }
                    });
                    content = '[Slides exportadas a PDF para análisis multimodal]';
                } else if (file.mimeType?.startsWith('image/')) {
                    // Image (multimodal)
                    const getData = await drive.files.get({
                        fileId: file.id,
                        alt: 'media',
                        responseType: 'arraybuffer'
                    });
                    const dataBuffer = Buffer.from(getData.data);
                    inlineDataParts.push({
                        inlineData: {
                            mimeType: file.mimeType,
                            data: dataBuffer.toString('base64')
                        }
                    });
                    content = '[Imagen adjunta para análisis multimodal]';
                } else {
                    content = `[Archivo detectado. Tipo: ${file.mimeType}. Contenido no legible directamente]`;
                }

                const snippet = typeof content === 'string' ? content.substring(0, 8000) : "Contenido no textual";
                combinedContent += `\n--- ARCHIVO: ${file.name} ---\n${snippet}\nEnlace: ${driveLink}\n`;
                linkEntries.push(`- ${file.name}: ${driveLink}`);
            } catch (err) {
                console.error(`Error reading file ${file.id} (${file.mimeType}):`, err);
                combinedContent += `\n--- ARCHIVO: ${file.name} (Error al leer contenido: ${err.message}) ---\n`;
            }
        }
        if (linkEntries.length) {
            combinedContent += `\n=== ENLACES ===\n${linkEntries.join('\n')}\n`;
        }
        return { text: combinedContent, inlineDataParts };

    } catch (error) {
        console.error("Drive Search Error:", error);
        return { text: "Error interno al buscar en Google Drive.", inlineDataParts: [] };
    }
}

const systemPrompt = `Eres Bria, el núcleo de inteligencia y razonamiento de "Brainstudio Intelligence" (Brain OS). Tu misión absoluta es alcanzar la Omnisciencia Operativa: comprender profundamente el contenido, contexto e intención de cada archivo y consulta para la agencia Brain Studio.

PRINCIPIOS DE PENSAMIENTO AVANZADO (OBLIGATORIOS):

1. 🧠 **Axioma del Razonamiento sobre la Búsqueda:**
   Nunca trates una consulta como texto simple. Antes de dar la respuesta final, realiza un análisis interno:
   - **Decodificación de Intención:** Si hay errores ("muevles") o términos vagos ("la parrilla"), corrige e infiere el cliente o término técnico.
   - **Mapeo de Entidades:** Investiga coincidencias cercanas si el nombre no es exacto.
   - **INSTRUCCIÓN:** Resume este análisis de forma breve, sin revelar cadenas de pensamiento detalladas.

2. 🔓 **Superación de la Barrera de Formatos (Acceso Profundo):**
   - Tu visión perfora los documentos. Trata PDFs, Excel (.xlsx), CSV e imágenes como fuentes vivas.
   - **Análisis Multimodal:** Si es imagen o escaneo, usa tu visión para extraer la verdad.
   - **Investigación de Contenido:** No te quedes en el nombre del archivo. Lee las filas del Excel, los párrafos del DOCX.

3. ⚓ **Arquitectura de Respuesta (Grounding Total):**
   - Conecta puntos: Si encuentras una parrilla en Excel y un diseño en PNG, relaciónalos.
   - Ancla tu respuesta en la realidad de los archivos. No especules sin avisar.

4. 🧬 **Mandato de Evolución:**
   - Si una búsqueda falla, analiza qué metadatos faltaron y sugiérelo o reintenta mentalmente.

FORMATO DE RESPUESTA (ESTRICTO):
1.  **Razonamiento Visible:** Inicia siempre con un breve resumen de intención.
2.  **Uso de Markdown:** Usa formato Markdown rico.
3.  **Títulos y Subtítulos:** Usa **títulos en negrita** (h1/h2/h3) con **emojis estratégicos** (ej. **🚀 Estrategia**, **📊 Datos**, **✅ Pasos**).
4.  **Conceptos Clave:** Resalta en **negrita**.
5.  **Estructura Visual:** Listas, tablas y espacios claros.
6.  **Enlaces:** Cuando cites documentos encontrados, incluye siempre un bloque **Enlaces** con URLs clicables.

Eres la guardiana de la memoria de Brainstudio. Si está en el Drive, tú lo sabes, lo entiendes y lo explicas.`;

const tools = [{
    functionDeclarations: [
        {
            name: "search_drive_files",
            description: "Busca archivos en Google Drive (Docs, Texto, Sheets, Slides, PDFs, imágenes, Word) y obtiene su contenido para responder preguntas sobre clientes, briefs, minutas o documentos internos.",
            parameters: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: {
                    query: {
                        type: FunctionDeclarationSchemaType.STRING,
                        description: "Término de búsqueda (ej. nombre del cliente 'Muebles Nuva', 'Brief Campaña')."
                    }
                },
                required: ["query"]
            }
        }
    ]
}];

function extractTextFromParts(parts = []) {
    return parts
        .filter(part => typeof part.text === 'string')
        .map(part => part.text)
        .join('');
}

function getChunkParts(chunk) {
    return chunk?.candidates?.[0]?.content?.parts || [];
}

async function extractPdfText(dataBuffer) {
    try {
        const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
        const pdf = await loadingTask.promise;
        let textContent = '';
        const maxPages = Math.min(pdf.numPages || 0, 10);
        for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
            const page = await pdf.getPage(pageNum);
            const text = await page.getTextContent();
            const pageText = text.items
                .map(item => item.str)
                .filter(Boolean)
                .join(' ');
            if (pageText) {
                textContent += `${pageText}\n`;
            }
        }
        return textContent.trim();
    } catch (error) {
        console.warn('[PDF] Failed to extract text:', error.message);
        return '';
    }
}

function isVertexRateLimitError(error) {
    const code = error?.code || error?.status || error?.response?.status;
    if (code === 429) {
        return true;
    }
    const message = error?.message || '';
    return message.includes('429') || message.includes('RESOURCE_EXHAUSTED');
}

async function sendMessageStreamWithRetry(chat, payload, maxAttempts = 3) {
    let attempt = 0;
    let lastError;
    while (attempt < maxAttempts) {
        attempt += 1;
        try {
            return await chat.sendMessageStream(payload);
        } catch (error) {
            lastError = error;
            if (!isVertexRateLimitError(error) || attempt >= maxAttempts) {
                throw error;
            }
            const delayMs = 500 * Math.pow(2, attempt - 1);
            console.warn(`[VertexAI] Rate limited. Retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    throw lastError;
}

app.get('/', (req, res) => {
    res.status(200).send('Brainstudio Intelligence API is running (v6-stable-deploy).');
});

app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        console.log(`[API] /api/chat received request with ${messages?.length || 0} messages.`);

        if (!credentials || !PROJECT_ID) {
            console.error("CRITICAL: Missing Google credentials or project ID for Vertex AI.");
            res.status(500);
            res.write("Error: Missing Google credentials or project ID for Vertex AI.");
            return res.end();
        }

        // Explicitly set headers at the start to prevent CORB blocking errors
        const origin = req.headers.origin;
        if (allowedOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // We will enable chunked encoding implicitly by writing to the stream,
        // but setting it explicit helps some proxies.
        res.setHeader('Transfer-Encoding', 'chunked');

        if (!messages || !Array.isArray(messages)) {
            console.error("Invalid request body:", req.body);
            // Even validation errors should return text to be visible in browser
            res.status(400);
            res.write("Error: Invalid messages format");
            return res.end();
        }

        const generativeModel = vertexAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: {
                role: "system",
                parts: [{ text: systemPrompt }]
            },
            tools: tools
        });

        const history = messages
            .filter(msg => msg.role !== 'system')
            .slice(0, -1)
            .map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

        const lastMessageContent = messages[messages.length - 1]?.content;
        if (typeof lastMessageContent !== 'string' || !lastMessageContent.trim()) {
            console.error("Invalid last message content:", lastMessageContent);
            res.status(400);
            res.write("Error: Missing or invalid last message content.");
            return res.end();
        }

        const chat = generativeModel.startChat({
            history: history,
        });

        console.log(`[API] Sending message to Vertex AI model: ${MODEL_NAME}`);

        // --- DEBUG LOGS START ---
        console.log(`[DEBUG] Calling chat.sendMessageStream now...`);
        const streamResult = await sendMessageStreamWithRetry(chat, lastMessageContent);
        console.log(`[DEBUG] chat.sendMessageStream returned. Starting to iterate stream...`);

        let functionCallDetected = false;
        let wroteText = false;

        // Consume the first stream
        for await (const chunk of streamResult.stream) {
            console.log(`[DEBUG] Received chunk from Vertex AI`);
            // Check for text content
            let text = '';
            if (typeof chunk?.text === 'function') {
                try {
                    text = chunk.text();
                } catch (e) {
                    // If it's a function call, text() might throw or return empty
                }
            }
            if (!text) {
                text = extractTextFromParts(getChunkParts(chunk));
            }

            if (text) {
                res.write(text);
                wroteText = true;
            }

            // Check if this chunk indicates a function call
            const parts = getChunkParts(chunk);
            if (parts?.some(part => part.functionCall)) {
                functionCallDetected = true;
            }
        }

        // Ensure we inspect the full response to detect function calls or missing text
        const fullResponse = await streamResult.response;
        const fullParts = fullResponse?.candidates?.[0]?.content?.parts || [];
        const functionCallPart = fullParts.find(part => part.functionCall);

        if (functionCallPart) {
            functionCallDetected = true;
        }

        if (!wroteText) {
            const fallbackText = extractTextFromParts(fullParts);
            if (fallbackText) {
                res.write(fallbackText);
                wroteText = true;
            }
        }

        // If a function call was detected during the stream, we execute it now
        if (functionCallDetected) {
            const call = functionCallPart?.functionCall;

            if (call && call.name === 'search_drive_files') {
                const query = call.args?.query;
                if (!query) {
                    console.error("[FunctionCall] Missing query argument in function call:", call);
                    res.write("Error: Missing query argument for search_drive_files.");
                    res.end();
                    return;
                }
                console.log(`[FunctionCall] Executing search_drive_files with query: ${query}`);
                const toolOutput = await searchAndReadDrive(query);
                const inlineDataParts = Array.isArray(toolOutput?.inlineDataParts)
                    ? toolOutput.inlineDataParts
                    : [];

                // Send the tool output back to the model
                const functionResponseParts = [{
                    functionResponse: {
                        name: 'search_drive_files',
                        response: { name: 'search_drive_files', content: toolOutput.text }
                    }
                }, ...inlineDataParts];

                // Start a new stream with the answer
                console.log(`[API] Sending function response back to model...`);
                let streamResult2;
                try {
                     streamResult2 = await sendMessageStreamWithRetry(chat, functionResponseParts);
                } catch (streamErr) {
                     console.error("[API] Error calling sendMessageStream with function response:", streamErr);
                     res.write("\n\n(Error interno al comunicar la respuesta de la herramienta al modelo).");
                     res.end();
                     return;
                }

                let wroteTextInSecondStream = false;
                for await (const chunk of streamResult2.stream) {
                    console.log(`[DEBUG] Received chunk (post-function) from Vertex AI`);
                    let text = '';
                    if (typeof chunk?.text === 'function') {
                        try {
                            text = chunk.text();
                        } catch (e) {
                             console.warn("[DEBUG] Chunk (post-function) has no text:", e.message);
                        }
                    }
                    if (!text) {
                        text = extractTextFromParts(getChunkParts(chunk));
                    }

                    if (text) {
                        res.write(text);
                        wroteTextInSecondStream = true;
                    }
                }

                if (!wroteTextInSecondStream) {
                    console.warn("[API] Second stream finished but wrote no text. Sending fallback.");
                    res.write("\n\n(La búsqueda se completó, pero el modelo no generó una respuesta textual adicional).");
                }
            }
        }

        if (!wroteText && !functionCallDetected) {
            console.error("[VertexAI] Empty response with no function call detected.", {
                model: MODEL_NAME,
                parts: fullParts
            });
            res.write("Error: Vertex AI returned an empty response.");
        }

        console.log(`[DEBUG] Stream iteration finished. Ending response.`);
        res.end();

    } catch (error) {
        console.error("Error in /api/chat [CRITICAL]:", {
            message: error.message,
            stack: error.stack,
            code: error.code,
            details: error.details, // Vertex AI often provides details here
            response: error.response?.data,
            raw: JSON.stringify(error)
        });

        // Return error as text/plain so it's not blocked by CORB
        if (!res.headersSent) {
            const statusCode = isVertexRateLimitError(error) ? 429 : 500;
            res.status(statusCode);
            if (statusCode === 429) {
                res.write("Error: Vertex AI rate limit exceeded. Please try again shortly.");
            } else {
                res.write(`Error: ${error.message}`);
            }
            res.end();
        } else {
            res.end();
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (Bound to 0.0.0.0)`);
});
