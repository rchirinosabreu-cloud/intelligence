import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Send message to Google Gemini API with streaming support
 * @param {Array} messages - Array of message objects with role and content
 * @param {Function} onChunk - Callback function for each streamed chunk
 */
export async function sendMessage(messages, onChunk) {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  // Fallback to stable version alias
  const MODEL_NAME = "gemini-1.5-flash-latest";

  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY no está configurado. Por favor, configura tu API key en el archivo .env');
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const systemPrompt = `Eres Brain Intelligence, el sistema operativo de inteligencia artificial de la agencia Brain Studio. Tu propósito es centralizar los procesos creativos, estratégicos y operativos, actuando como un consultor experto.

Tono de voz: Profesional, estratégico, proactivo y profundamente creativo. No solo respondes preguntas; investigas, conectas puntos y sugieres los siguientes pasos.

Instrucciones de Operación:
1. Investigación Total: Asume que debes consultar documentación de clientes específicos (ej. La Sazón de Iris, Salsipuedes, New Pueblito Suites, etc.). Aunque ahora no tengas acceso real a archivos, actúa como si tuvieras acceso a su contexto histórico.
2. Gestión de Pendientes: Identifica tareas no resueltas en las conversaciones y recuérdalas.
3. Multimodalidad: Estás preparado para analizar briefings y piezas gráficas.
4. Seguridad: Mantén separación estricta entre información de clientes.
5. Objetivo Final: Ayudar a escalar la agencia permitiendo que cualquier miembro del equipo tenga el contexto completo de un proyecto en segundos.

Actúa como un sistema híbrido avanzado.`;

  const history = messages
    .filter(msg => msg.role !== 'system')
    .slice(0, -1)
    .map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

  const lastMessage = messages[messages.length - 1];

  try {
    const chat = model.startChat({
      history: history,
      systemInstruction: systemPrompt,
    });

    const result = await chat.sendMessageStream(lastMessage.content);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        onChunk(chunkText);
      }
    }
  } catch (error) {
    console.error('Error in sendMessage:', error);
    // Enhance error message for user debugging
    if (error.message.includes('404')) {
        throw new Error(`Error 404: El modelo '${MODEL_NAME}' no fue encontrado o la API no está habilitada. Verifica tu API Key y configuración en Google AI Studio.`);
    }
    throw error;
  }
}

/**
 * Format message for display
 * @param {Object} message - Message object
 * @returns {String} Formatted message
 */
export function formatMessage(message) {
  return message.content.trim();
}

/**
 * Validate API configuration
 * @returns {Object} Validation result with status and message
 */
export function validateApiConfig() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    return {
      valid: false,
      message: 'VITE_GEMINI_API_KEY no está configurado'
    };
  }

  return {
    valid: true,
    message: 'Configuración válida'
  };
}
