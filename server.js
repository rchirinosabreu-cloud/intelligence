import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { VertexAI, FunctionDeclarationSchemaType } from '@google-cloud/vertexai';
import { google } from 'googleapis';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

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
const MODEL_NAME = process.env.GEMINI_MODEL || process.env.VERTEX_MODEL || "gemini-1.5-flash";

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
try {
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    drive = google.drive({ version: 'v3', auth });
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
            pageSize: 5,
            fields: 'files(id, name, mimeType)',
            orderBy: 'modifiedTime desc'
        });

        const files = res.data.files;
        if (!files || files.length === 0) {
            return `No se encontraron archivos para la búsqueda: "${query}"`;
        }

        let combinedContent = `Encontré ${files.length} archivos relevantes para "${query}":\n`;

        // 2. Read content (limit to first 3)
        for (const file of files.slice(0, 3)) {
            try {
                let content = "";
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
                        alt: 'media'
                    });
                    content = getData.data;
                } else if (file.mimeType === 'application/pdf') {
                    // PDF
                    const getData = await drive.files.get({
                        fileId: file.id,
                        alt: 'media',
                        responseType: 'arraybuffer'
                    });
                    const dataBuffer = Buffer.from(getData.data);
                    const pdfData = await pdf(dataBuffer);
                    content = pdfData.text;
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
                } else {
                    content = `[Archivo detectado. Tipo: ${file.mimeType}. Contenido no legible directamente]`;
                }

                const snippet = typeof content === 'string' ? content.substring(0, 8000) : "Contenido no textual";
                combinedContent += `\n--- ARCHIVO: ${file.name} ---\n${snippet}\n`;
            } catch (err) {
                console.error(`Error reading file ${file.id} (${file.mimeType}):`, err);
                combinedContent += `\n--- ARCHIVO: ${file.name} (Error al leer contenido: ${err.message}) ---\n`;
            }
        }
        return combinedContent;

    } catch (error) {
        console.error("Drive Search Error:", error);
        return "Error interno al buscar en Google Drive.";
    }
}

const systemPrompt = `Eres Brain Intelligence, el sistema operativo de inteligencia artificial de la agencia Brain Studio. Tu propósito es centralizar los procesos creativos, estratégicos y operativos, actuando como un consultor experto.

Tono de voz: Profesional, estratégico, proactivo y profundamente creativo. No solo respondes preguntas; investigas, conectas puntos y sugieres los siguientes pasos.

Instrucciones de Operación:
1. Investigación Total: Tienes acceso a una herramienta 'search_drive_files' que te permite buscar en los archivos de la agencia. Úsala SIEMPRE que te pregunten por un cliente, proyecto o documento interno (ej. "Info de Muebles Nuva", "Brief de Salsipuedes").
2. Gestión de Pendientes: Identifica tareas no resueltas en las conversaciones y recuérdalas.
3. Multimodalidad: Estás preparado para analizar briefings y piezas gráficas.
4. Seguridad: Mantén separación estricta entre información de clientes.
5. Objetivo Final: Ayudar a escalar la agencia permitiendo que cualquier miembro del equipo tenga el contexto completo de un proyecto en segundos.

FORMATO DE RESPUESTA (ESTRICTO):
1.  **Uso de Markdown:** Todas las respuestas deben usar formato Markdown.
2.  **Títulos y Subtítulos:**
    *   Usa **títulos en negrita** (h1/h2/h3) acompañados de **emojis estratégicos** al inicio (ej. **🚀 Estrategia de Lanzamiento**, **📊 Análisis de Datos**, **✅ Próximos Pasos**).
    *   Diferencia claramente entre títulos principales y subtítulos usando jerarquía de Markdown (#, ##, ###) y negritas.
3.  **Conceptos Clave:** Resalta los términos importantes y conceptos clave usando **negrita**.
4.  **Estructura Visual:**
    *   Usa **listas con viñetas** o numeradas para enumerar pasos, características o datos.
    *   Usa **tablas Markdown** cuando presentes datos comparativos o estructurados.
    *   Deja **una línea en blanco** entre cada párrafo para mejorar la legibilidad.
5.  **Estilo:** Mantén un diseño limpio, profesional y fácil de escanear visualmente.

Actúa como un sistema híbrido avanzado.`;

const tools = [{
    functionDeclarations: [
        {
            name: "search_drive_files",
            description: "Busca archivos en Google Drive (Google Docs, Texto, PDF, Word) de la agencia y lee su contenido. Útil para responder preguntas sobre clientes, briefs, minutas o documentos internos.",
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
        const streamResult = await chat.sendMessageStream(lastMessageContent);
        console.log(`[DEBUG] chat.sendMessageStream returned. Starting to iterate stream...`);

        let functionCallDetected = false;
        let wroteText = false;

        // Consume the first stream
        for await (const chunk of streamResult.stream) {
            console.log(`[DEBUG] Received chunk from Vertex AI`);
            // Check for text content
            let text = '';
            try {
                text = chunk.text();
            } catch (e) {
                // If it's a function call, text() might throw or return empty
            }

            if (text) {
                res.write(text);
                wroteText = true;
            }

            // Check if this chunk indicates a function call
            const parts = chunk.candidates?.[0]?.content?.parts;
            if (parts?.[0]?.functionCall) {
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
            const fallbackText = fullParts
                .filter(part => part.text)
                .map(part => part.text)
                .join('');
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

                // Send the tool output back to the model
                const functionResponseParts = [{
                    functionResponse: {
                        name: 'search_drive_files',
                        response: { name: 'search_drive_files', content: toolOutput }
                    }
                }];

                // Start a new stream with the answer
                console.log(`[API] Sending function response back to model...`);
                let streamResult2;
                try {
                     streamResult2 = await chat.sendMessageStream(functionResponseParts);
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
                    try {
                        text = chunk.text();
                    } catch (e) {
                         console.warn("[DEBUG] Chunk (post-function) has no text:", e.message);
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
            res.status(500);
            res.write(`Error: ${error.message}`);
            res.end();
        } else {
            res.end();
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (Bound to 0.0.0.0)`);
});
