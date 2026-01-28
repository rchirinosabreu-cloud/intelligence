import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { VertexAI, FunctionDeclarationSchemaType } from '@google-cloud/vertexai';
import { SearchServiceClient } from '@google-cloud/discoveryengine';
import { JWT } from 'google-auth-library';

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
        if (credentials && credentials.private_key) {
            // Sanitize private key: replace literal \n with actual newlines
            credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }
        console.log("Credentials parsed and sanitized successfully for project:", credentials?.project_id);
    } else {
        console.error("CRITICAL: GOOGLE_APPLICATION_CREDENTIALS_JSON is missing");
    }
} catch (e) {
    console.error("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON", e);
}

// Use explicit project ID 'brainstudio-intelligence' if not found in credentials
const PROJECT_ID = credentials?.project_id || 'brainstudio-intelligence';
// Force 'global' location explicitly as requested
const LOCATION = 'global';
const MODEL_NAME = process.env.GEMINI_MODEL || process.env.VERTEX_MODEL || "gemini-2.5-flash";

// Engine ID for the App (Brainstudio Intelligence)
const ENGINE_ID = process.env.ENGINE_ID || process.env.DISCOVERY_ENGINE_ENGINE_ID || "brainstudio-intelligence-v_1769568594187";
// Data Store ID for reference/logs (Brainstudio Unstructured Docs)
const DATA_STORE_ID = process.env.DATA_STORE_ID || "brainstudio-unstructured-v1_1769568459490";

// Ensure Discovery Engine also uses the global location derived above
const DISCOVERY_ENGINE_LOCATION = LOCATION;
const DISCOVERY_ENGINE_API_ENDPOINT = 'discoveryengine.googleapis.com';

console.log(`[VertexAI] Initializing with Project ID: ${PROJECT_ID || 'UNDEFINED'}, Location: ${LOCATION}, Model: ${MODEL_NAME}`);
console.log(`[DiscoveryEngine] Selected Engine ID: ${ENGINE_ID} (DataStore: ${DATA_STORE_ID})`);

// Initialize Clients safely
let vertexAI;
try {
    if (!PROJECT_ID) throw new Error("Project ID is missing from credentials");
    vertexAI = new VertexAI({
        project: PROJECT_ID,
        location: LOCATION,
        apiEndpoint: 'aiplatform.googleapis.com', // Explicitly force global endpoint for Vertex AI
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

    // Explicitly configure JWT auth with the correct scope for Service Account
    const authClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    searchClient = new SearchServiceClient({
        authClient: authClient,
        projectId: PROJECT_ID,
        apiEndpoint: 'discoveryengine.googleapis.com' // Explicitly force global endpoint
    });
    console.log("[DiscoveryEngine] Client initialized successfully.");
} catch (e) {
     console.error("[DiscoveryEngine] Failed to initialize client:", e);
}

// --- DISCOVERY ENGINE SEARCH (Cloud Storage / Unstructured) ---
async function searchCloudStorage(query) {
    if (!searchClient) {
        return { text: "Error: Discovery Engine client no está inicializado.", inlineDataParts: [] };
    }

    // Helper to format results
    const formatResults = (results, sourceName) => {
        let combinedContent = `Encontré ${results.length} documentos relevantes en el repositorio (${sourceName}) para "${query}":\n\n`;
        const linkEntries = [];

        for (const result of results) {
            const doc = result.document;
            const derived = doc.derivedStructData || doc.structData;

            const title = derived?.title || doc.name || "Documento sin título";
            const link = derived?.link || (derived?.sourceLink ? derived.sourceLink : "Sin enlace");

            // Extract snippets from unstructured content
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
        return combinedContent;
    };

    try {
        console.log(`[Discovery] Searching Cloud Storage (Engine: ${ENGINE_ID}) for: ${query}`);

        // 1. Try Searching via Engine ID (App)
        const engineServingConfig = `projects/${PROJECT_ID}/locations/${DISCOVERY_ENGINE_LOCATION}/collections/default_collection/engines/${ENGINE_ID}/servingConfigs/default_search`;

        const engineRequest = {
            servingConfig: engineServingConfig,
            query: query,
            pageSize: 5,
            contentSearchSpec: {
                snippetSpec: { returnSnippet: true },
                extractiveContentSpec: { maxExtractiveAnswerCount: 1 }
            }
        };

        let results = [];
        let usedSource = "Engine";

        try {
            const [engineResponse] = await searchClient.search(engineRequest, { autoPaginate: false });
            if (engineResponse.results && engineResponse.results.length > 0) {
                results = engineResponse.results;
                console.log(`[Discovery] Engine returned ${results.length} results.`);
            } else {
                console.log(`[Discovery] Engine returned 0 results. Raw response keys: ${Object.keys(engineResponse).join(', ')}`);
            }
        } catch (engineError) {
            console.warn(`[Discovery] Engine search failed: ${engineError.message}`);
        }

        // 2. Fallback: Try Searching via Data Store ID if Engine failed or returned 0
        if (results.length === 0) {
            console.log(`[Discovery] Attempting fallback to Data Store (${DATA_STORE_ID})...`);

            // Note: DataStore path uses 'dataStores' collection
            const dataStoreServingConfig = `projects/${PROJECT_ID}/locations/${DISCOVERY_ENGINE_LOCATION}/collections/default_collection/dataStores/${DATA_STORE_ID}/servingConfigs/default_search`;

            const dataStoreRequest = {
                servingConfig: dataStoreServingConfig,
                query: query,
                pageSize: 5,
                contentSearchSpec: {
                    snippetSpec: { returnSnippet: true },
                    // Relaxed spec: Remove extractiveContentSpec to broaden results (like Preview)
                }
            };

            try {
                const [dsResponse] = await searchClient.search(dataStoreRequest, { autoPaginate: false });
                if (dsResponse.results && dsResponse.results.length > 0) {
                    results = dsResponse.results;
                    usedSource = "DataStore";
                    console.log(`[Discovery] Data Store returned ${results.length} results.`);
                } else {
                     console.log(`[Discovery] Data Store also returned 0 results.`);
                }
            } catch (dsError) {
                 console.error(`[Discovery] Data Store fallback failed: ${dsError.message}`);
            }
        }

        if (!results || results.length === 0) {
            return {
                text: `No se encontraron documentos relevantes en Cloud Storage para: "${query}" (intentado en Engine y DataStore).`,
                inlineDataParts: []
            };
        }

        const formattedText = formatResults(results, usedSource);
        return { text: formattedText, inlineDataParts: [] };

    } catch (error) {
        console.error("Discovery Search Error:", error);
        if (error?.code === 5 && typeof error?.message === 'string' && error.message.includes('DataStore')) {
            return {
                text:
                    `Error al buscar en Discovery Engine: no se encontró el Engine/DataStore. ` +
                    `Verifica ENGINE_ID, DISCOVERY_ENGINE_LOCATION o credenciales.`,
                inlineDataParts: []
            };
        }
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
            name: "search_cloud_storage",
            description: "Busca en el 'cerebro' de Brainstudio (Google Cloud Storage) documentos no estructurados (PDFs, guías, reportes) de clientes como Sunpartners, TruPeak, etc. Usa esto para consultas sobre información interna o conocimiento de proyectos.",
            parameters: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: {
                    query: {
                        type: FunctionDeclarationSchemaType.STRING,
                        description: "Término de búsqueda (ej. 'Estrategia Sunpartners', 'Reporte TruPeak', 'Guía de Estilo')."
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

/**
 * Filter text to suppress <thinking>...</thinking> blocks.
 * Maintains state across chunks to handle split tags.
 */
function createThinkingFilter() {
    let buffer = "";
    let insideThinking = false;

    // Process a chunk of text
    // Returns: The text to be emitted to the user
    return (chunkText) => {
        if (!chunkText) return "";

        let output = "";
        let scanIndex = 0;

        // Append new text to any existing buffer
        const fullText = buffer + chunkText;
        buffer = ""; // consumed

        const len = fullText.length;

        while (scanIndex < len) {
            if (insideThinking) {
                // Look for closing tag </thinking>
                const closeTagIndex = fullText.indexOf("</thinking>", scanIndex);
                if (closeTagIndex !== -1) {
                    // Found closing tag. Skip past it.
                    scanIndex = closeTagIndex + "</thinking>".length;
                    insideThinking = false;
                } else {
                    // No closing tag yet.
                    // Check if we have a partial closing tag at the end
                    // </thinking> is 11 chars.
                    const tail = fullText.slice(scanIndex);
                    // Minimal check: if the tail matches the beginning of the tag
                    let match = false;
                    for (let i = 1; i < 11; i++) {
                         if ("</thinking>".startsWith(tail.slice(-i))) {
                             // potential partial match, keep in buffer
                             buffer = tail;
                             match = true;
                             break;
                         }
                    }
                    if (!match) {
                        // The whole tail is inside thinking, discard it?
                        // Actually, we just discard everything since we are inside thinking
                        // and didn't find the end.
                    }
                    // Since we are inside thinking, we consume everything remaining
                    // effectively suppressing it.
                    // BUT: if there is a partial tag at the end, we technically "buffer" it?
                    // No need to buffer inside thinking mode, unless we suspect the tag is split.
                    // Wait, if we are inside thinking, we output NOTHING until we find </thinking>.
                    // So we just consume scanIndex to end.
                    scanIndex = len;
                }
            } else {
                // Not inside thinking. Look for opening tag <thinking>
                const openTagIndex = fullText.indexOf("<thinking>", scanIndex);

                if (openTagIndex !== -1) {
                    // Found opening tag.
                    // Emit everything before it.
                    output += fullText.slice(scanIndex, openTagIndex);
                    // Switch state
                    insideThinking = true;
                    // Move past the tag
                    scanIndex = openTagIndex + "<thinking>".length;
                } else {
                    // No opening tag found.
                    // Need to check for partial opening tag at the end
                    // <thinking> is 10 chars.
                    let partialFound = false;
                    // We check if the end of string matches start of <thinking>
                    // Only need to check if length is sufficient or if it's very short
                    const remaining = fullText.slice(scanIndex);

                    // Optimization: check from end
                    for (let i = 1; i < 10; i++) {
                        if (remaining.length >= i && "<thinking>".startsWith(remaining.slice(-i))) {
                             // Found partial match at the very end
                             // Output everything up to that partial match
                             output += remaining.slice(0, remaining.length - i);
                             buffer = remaining.slice(-i);
                             partialFound = true;
                             break;
                        }
                    }

                    if (!partialFound) {
                        // Safe to emit all
                        output += remaining;
                    }
                    scanIndex = len; // Done
                }
            }
        }

        return output;
    };
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

        // Initialize thinking filter
        const processFilter = createThinkingFilter();

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
                const safeText = processFilter(text);
                if (safeText) {
                    res.write(safeText);
                    wroteText = true;
                }
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
            // We need to be careful here: if the filter absorbed everything (because it was all thinking),
            // then we technically "wrote" nothing visible, but the model did respond.
            // However, the fallbackText usually comes from fullParts.
            const fallbackText = extractTextFromParts(fullParts);
            // Apply filter to fallback text too, but beware of double processing if we already processed chunks.
            // Usually if we processed chunks, buffer is stateful.
            // If wroteText is false, it means we output nothing.
            // If fallbackText contains thinking, we should filter it.
            // But since we streamed, the filter state is advanced.
            // If the stream was fully consumed, the filter buffered potentially partial tags.
            // We can try to flush the filter buffer if we had a way, but createThinkingFilter closure variables are private.

            // Simpler approach: If we didn't write anything, maybe it was a pure function call?
            // Or maybe it was just thinking.

            // If function call detected, we don't worry about empty text yet.
        }

        // If a function call was detected during the stream, we execute it now
        if (functionCallDetected) {
            const call = functionCallPart?.functionCall;

            if (call && call.name === 'search_cloud_storage') {
                const query = call.args?.query;
                if (!query) {
                    console.error("[FunctionCall] Missing query argument in function call:", call);
                    res.write("Error: Missing query argument for search_cloud_storage.");
                    res.end();
                    return;
                }
                console.log(`[FunctionCall] Executing search_cloud_storage with query: ${query}`);
                const toolOutput = await searchCloudStorage(query);
                const inlineDataParts = Array.isArray(toolOutput?.inlineDataParts)
                    ? toolOutput.inlineDataParts
                    : [];

                // Send the tool output back to the model
                const functionResponseParts = [{
                    functionResponse: {
                        name: 'search_cloud_storage',
                        response: { name: 'search_cloud_storage', content: toolOutput.text }
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
                // Reset filter or create new one?
                // Creating new one is safer for the new stream.
                const processFilter2 = createThinkingFilter();

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
                        const safeText = processFilter2(text);
                        if (safeText) {
                            res.write(safeText);
                            wroteTextInSecondStream = true;
                        }
                    }
                }

                if (!wroteTextInSecondStream) {
                    console.warn("[API] Second stream finished but wrote no text. Sending fallback.");
                    res.write("\n\n(La búsqueda se completó, pero el modelo no generó una respuesta textual adicional).");
                }
            }
        }

        if (!wroteText && !functionCallDetected) {
            // Only error if we truly got nothing useful.
            // If we filtered out thinking, that's fine, but the user gets empty string?
            // Usually the model outputs thinking THEN the answer.
            // If it only outputs thinking, it's weird.
            console.error("[VertexAI] Empty response with no function call detected.", {
                model: MODEL_NAME,
                parts: fullParts
            });
            // Don't send error text if we just suppressed thinking.
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
