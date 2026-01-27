import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { VertexAI, FunctionDeclarationSchemaType } from '@google-cloud/vertexai';
import { SearchServiceClient } from '@google-cloud/discoveryengine';

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
const DATA_STORE_ID = "conector-drive-brainstudio_1769439248669";

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

// Initialize Discovery Engine Client
let searchClient;
try {
    if (!PROJECT_ID) throw new Error("Project ID is missing from credentials");
    searchClient = new SearchServiceClient({
        credentials,
        projectId: PROJECT_ID
    });
    console.log("[DiscoveryEngine] Client initialized successfully.");
} catch (e) {
     console.error("[DiscoveryEngine] Failed to initialize client:", e);
}

// --- DISCOVERY ENGINE SEARCH ---
async function searchAndReadDrive(query) {
    if (!searchClient) {
        return { text: "Error: Discovery Engine client no está inicializado.", inlineDataParts: [] };
    }

    try {
        console.log(`[Discovery] Searching for: ${query}`);
        const servingConfig = `projects/${PROJECT_ID}/locations/global/collections/default_collection/dataStores/${DATA_STORE_ID}/servingConfigs/default_search`;

        const request = {
            servingConfig,
            query: query,
            pageSize: 5,
            contentSearchSpec: {
                snippetSpec: { returnSnippet: true },
                extractiveContentSpec: { maxExtractiveAnswerCount: 1 }
            }
        };

        const [response] = await searchClient.search(request);
        const results = response.results;

        if (!results || results.length === 0) {
            return {
                text: `No se encontraron documentos relevantes para: "${query}"`,
                inlineDataParts: []
            };
        }

        let combinedContent = `Encontré ${results.length} documentos relevantes en el Data Store para "${query}":\n\n`;
        const linkEntries = [];

        for (const result of results) {
            const doc = result.document;
            const derived = doc.derivedStructData;

            const title = derived?.title || doc.name || "Documento sin título";
            const link = derived?.link || (derived?.sourceLink ? derived.sourceLink : "Sin enlace");

            // Extract snippets
            let snippetText = "";
            const extractiveAnswers = derived?.extractive_answers || derived?.extractiveAnswers;
            if (Array.isArray(extractiveAnswers)) {
                 snippetText = extractiveAnswers.map(ans => ans.content).join("\n...\n");
            }

            if (!snippetText) {
                const snippets = derived?.snippets;
                if (Array.isArray(snippets)) {
                    snippetText = snippets.map(s => s.snippet).join("\n...\n");
                }
            }
             if (!snippetText) {
                snippetText = "(Sin fragmento extraíble)";
            }

            combinedContent += `--- DOCUMENTO: ${title} ---\n`;
            combinedContent += `Enlace: ${link}\n`;
            combinedContent += `Fragmentos relevantes:\n${snippetText}\n\n`;

            linkEntries.push(`- ${title}: ${link}`);
        }

        if (linkEntries.length) {
            combinedContent += `\n=== ENLACES ===\n${linkEntries.join('\n')}\n`;
        }

        return { text: combinedContent, inlineDataParts: [] };

    } catch (error) {
        console.error("Discovery Search Error:", error);
        return { text: `Error al buscar en Discovery Engine: ${error.message}`, inlineDataParts: [] };
    }
}

const systemPrompt = `Eres Bria, el núcleo de inteligencia y razonamiento de "Brainstudio Intelligence" (Brain OS). Tu misión es actuar como una Consultora Estratégica con Omnisciencia Operativa: no solo encuentras información, la analizas, conectas y transformas en insights accionables.

TU PROCESO DE PENSAMIENTO (Chain of Thought):
Antes de responder, realiza un análisis interno profundo (oculto en <thinking>).
NO narres lo que vas a hacer ("Voy a decirle al usuario..."). HAZLO: Analiza los datos, cruza información y detecta patrones.
1.  **Análisis de Intención:** ¿Qué necesita realmente el usuario?
2.  **Examen de Evidencia:** Si buscaste archivos, lee el contenido extraído. ¿Qué dicen los datos? ¿Hay contradicciones?
3.  **Síntesis:** Construye la respuesta final basada en estos hallazgos.

ESTRUCTURA DE RESPUESTA OBLIGATORIA:
<thinking>
[Espacio para análisis técnico y razonamiento puro. No hables con el usuario aquí, habla contigo misma sobre los datos.]
- Archivos analizados: [Lista]
- Hallazgos clave: [Datos específicos encontrados en el contenido]
- Estrategia: [Cómo estructurarás la respuesta]
</thinking>

[Aquí comienza tu respuesta final al usuario]

REGLAS DE ESTILO Y FORMATO (ESTRICTAS):
1.  **CERO COMILLAS RARAS EN NOMBRES DE ARCHIVO:**
    -   ESTÁ PROHIBIDO usar backticks (\`) para nombres de archivos (ej: \`archivo.pdf\`). ¡Se ve horrible!
    -   ESTÁ PROHIBIDO usar negritas con backticks (ej: **\`archivo.pdf\`**).
    -   CORRECTO: Usa negrita simple para destacar el nombre (ej: **archivo.pdf**) o simplemente menciónalo naturalmente.
2.  **Professional Markdown:**
    -   Usa títulos H1, H2, H3 (Markdown #, ##, ###) para estructurar.
    -   Usa listas y tablas para datos densos.
3.  **Tono:** Profesional, directo, estratégico, empático pero eficiente. Eres Bria.

PRINCIPIOS DE ANÁLISIS PROFUNDO:
-   Si encuentras un documento, ANALÍZALO. No digas "encontré este documento". Di "Analizando el documento X, observo que la estrategia de Q3 se centra en..."
-   Cruza información: "El Excel de ventas contradice lo que dice el Brief en PDF..." -> Eso es valor.
-   Si es una imagen, descríbela y úsala en tu análisis.

Eres la socia intelectual de Brainstudio. Piensa, luego responde.`;

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
