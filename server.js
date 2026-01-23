import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { VertexAI, FunctionDeclarationSchemaType } from '@google-cloud/vertexai';
import { google } from 'googleapis';

dotenv.config();

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

const PORT = process.env.PORT || 8080;

// --- AUTHENTICATION SETUP ---
let credentials;
try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        console.log("Credentials parsed successfully for project:", credentials.project_id);
    } else {
        console.error("CRITICAL: GOOGLE_APPLICATION_CREDENTIALS_JSON is missing");
    }
} catch (e) {
    console.error("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON", e);
}

const PROJECT_ID = credentials?.project_id;
const LOCATION = 'us-central1';
const MODEL_NAME = "gemini-1.5-flash-001";

// Vertex AI Client
const vertexAI = new VertexAI({
    project: PROJECT_ID,
    location: LOCATION,
    googleAuthOptions: { credentials }
});

// Drive Client
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
});
const drive = google.drive({ version: 'v3', auth });

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
                    const exportData = await drive.files.export({
                        fileId: file.id,
                        mimeType: 'text/plain'
                    });
                    content = exportData.data;
                } else if (file.mimeType === 'text/plain') {
                     const getData = await drive.files.get({
                        fileId: file.id,
                        alt: 'media'
                    });
                    content = getData.data;
                } else {
                    // For PDFs or others, we just note existence for now
                    content = `[Archivo detectado. Tipo: ${file.mimeType}. Contenido no legible directamente por ahora]`;
                }

                const snippet = typeof content === 'string' ? content.substring(0, 8000) : "Contenido no textual";
                combinedContent += `\n--- ARCHIVO: ${file.name} ---\n${snippet}\n`;
            } catch (err) {
                console.error(`Error reading file ${file.id}:`, err);
                combinedContent += `\n--- ARCHIVO: ${file.name} (Error al leer contenido) ---\n`;
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
            description: "Busca archivos en Google Drive (Google Docs, Texto) de la agencia y lee su contenido. Útil para responder preguntas sobre clientes, briefs, minutas o documentos internos.",
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
    res.status(200).send('Brainstudio Intelligence API is running (v5-vertex-drive).');
});

app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        if (!messages || !Array.isArray(messages)) {
            console.error("Invalid request body:", req.body);
            return res.status(400).json({ error: "Invalid messages format" });
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

        const lastMessageContent = messages[messages.length - 1].content;

        const chat = generativeModel.startChat({
            history: history,
        });

        const streamResult = await chat.sendMessageStream(lastMessageContent);

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        let functionCallDetected = false;

        // Consume the first stream
        for await (const chunk of streamResult.stream) {
            // Check for text content
            let text = '';
            try {
                text = chunk.text();
            } catch (e) {
                // If it's a function call, text() might throw or return empty
            }

            if (text) {
                res.write(text);
            }

            // Check if this chunk indicates a function call
            const parts = chunk.candidates?.[0]?.content?.parts;
            if (parts?.[0]?.functionCall) {
                functionCallDetected = true;
            }
        }

        // If a function call was detected during the stream, we execute it now
        if (functionCallDetected) {
            // Get the full aggregated response to parse arguments safely
            const fullResponse = await streamResult.response;
            const call = fullResponse.candidates[0].content.parts[0].functionCall;

            if (call && call.name === 'search_drive_files') {
                const query = call.args.query;
                const toolOutput = await searchAndReadDrive(query);

                // Send the tool output back to the model
                const functionResponseParts = [{
                    functionResponse: {
                        name: 'search_drive_files',
                        response: { name: 'search_drive_files', content: toolOutput }
                    }
                }];

                // Start a new stream with the answer
                const streamResult2 = await chat.sendMessageStream(functionResponseParts);

                for await (const chunk of streamResult2.stream) {
                    let text = '';
                    try {
                        text = chunk.text();
                    } catch (e) {}

                    if (text) {
                        res.write(text);
                    }
                }
            }
        }

        res.end();

    } catch (error) {
        console.error("Error in /api/chat:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message, stack: error.stack });
        } else {
            res.end();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
