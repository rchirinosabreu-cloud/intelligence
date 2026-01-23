import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();

// Basic, maximally permissive CORS configuration
app.use(cors());

app.use(express.json());

const PORT = process.env.PORT || 8080;
// Support both standard env var and VITE_ prefixed one for compatibility
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || "gemini-1.5-flash";

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

Actúa como un sistema híbrido avanzado.`;

app.get('/', (req, res) => {
    res.status(200).send('Brainstudio Intelligence API is running (v4-stable-esm).');
});

app.post('/api/chat', async (req, res) => {
    console.log("Received chat request");
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

        console.log("Sending request to Gemini model:", MODEL_NAME);
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
        console.log("Stream completed successfully");

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
