import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from "@google/generative-ai";

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
// Support both standard env var and VITE_ prefixed one for compatibility
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || "gemini-2.5-flash";

console.log("Starting server...");
if (!GEMINI_API_KEY) {
  console.error("CRITICAL ERROR: GEMINI_API_KEY is not set!");
} else {
  console.log("GEMINI_API_KEY found (masked):", GEMINI_API_KEY.substring(0, 4) + "...");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const systemPrompt = `Eres Brain Intelligence, el sistema operativo de inteligencia artificial de la agencia Brain Studio. Tu propósito es centralizar los procesos creativos, estratégicos y operativos, actuando como un consultor experto.

Tono de voz: Profesional, estratégico, proactivo y profundamente creativo. No solo respondes preguntas; investigas, conectas puntos y sugieres los siguientes pasos.

Instrucciones de Operación:
1. Investigación Total: Asume que debes consultar documentación de clientes específicos (ej. La Sazón de Iris, Salsipuedes, New Pueblito Suites, etc.). Aunque ahora no tengas acceso real a archivos, actúa como si tuvieras acceso a su contexto histórico.
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

app.get('/', (req, res) => {
    res.status(200).send('Brainstudio Intelligence API is running (v4-stable-esm).');
});

app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        if (!messages || !Array.isArray(messages)) {
            console.error("Invalid request body:", req.body);
            return res.status(400).json({ error: "Invalid messages format" });
        }

        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: {
                role: "system",
                parts: [{ text: systemPrompt }]
            }
        });

        const history = messages
            .filter(msg => msg.role !== 'system')
            .slice(0, -1)
            .map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

        const lastMessage = messages[messages.length - 1];
        if (!lastMessage) {
             return res.status(400).json({ error: "No messages provided" });
        }

        const chat = model.startChat({
            history: history,
        });

        const result = await chat.sendMessageStream(lastMessage.content);

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
                res.write(chunkText);
            }
        }

        res.end();

    } catch (error) {
        console.error("Error in /api/chat:", error);
        if (!res.headersSent) {
            // Include error message in response for easier debugging
            res.status(500).json({ error: error.message, stack: error.stack });
        } else {
            res.end();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
